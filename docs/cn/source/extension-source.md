# Chrome 扩展源码分析

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解扩展的整体架构和文件结构 |
| 进阶 | 掌握 CDP 操作、网络捕获、标签页管理的实现细节 |
| 专家 | 能评估扩展的安全模型，参与扩展功能的改进 |

## 扩展概览

OpenCLI 的 Chrome 扩展使用 Manifest V3 规范，以 Service Worker 作为后台脚本。它是 CLI 控制浏览器的桥梁。

```
extension/
  ├── manifest.json          # 扩展清单
  ├── src/
  │   ├── background.ts      # Service Worker（核心入口）
  │   ├── cdp.ts             # CDP 操作封装
  │   └── protocol.ts        # 通信协议定义
  └── dist/                  # 构建产物
```

## manifest.json

```json
{
  "manifest_version": 3,
  "name": "opencli Browser Bridge",
  "permissions": ["debugger", "tabs", "cookies", "activeTab", "alarms"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "dist/background.js"
  }
}
```

### 权限分析

| 权限 | 用途 | 必要性 |
|------|------|--------|
| `debugger` | 通过 `chrome.debugger` API 附加到标签页，执行 CDP 命令 | 核心 — 所有浏览器操作的基础 |
| `tabs` | 创建、查找和管理标签页 | 核心 — 自动化窗口和标签页管理 |
| `cookies` | 读取目标网站的 Cookie | 核心 — 登录状态检测 |
| `activeTab` | 访问当前活动标签页 | 辅助 — 获取当前页面信息 |
| `alarms` | 周期性探测 Daemon 连接状态 | 辅助 — 断线重连 |
| `<all_urls>` | 在任意网站上执行操作 | 核心 — 支持任意目标网站 |

## 通信协议：protocol.ts

`protocol.ts` 定义了扩展与 Daemon 之间的通信协议：

```typescript
// Daemon WebSocket 地址
const DAEMON_WS_URL = 'ws://localhost:19825/ext';
const DAEMON_PING_URL = 'http://localhost:19825/ping';

// 重连参数
const WS_RECONNECT_BASE_DELAY = 2000;  // 2 秒
const WS_RECONNECT_MAX_DELAY = 60000;  // 60 秒
```

### Command 类型

Daemon 发送给扩展的命令结构：

```typescript
interface Command {
  id: string;              // 命令唯一 ID
  action: string;          // 操作类型
  params?: Record<string, unknown>;  // 操作参数
}
```

### Result 类型

扩展返回给 Daemon 的结果结构：

```typescript
interface Result {
  id: string;              // 对应 Command 的 ID
  success: boolean;        // 是否成功
  data?: unknown;          // 返回数据
  error?: string;          // 错误信息
}
```

## Service Worker：background.ts

`background.ts` 是扩展的核心入口，负责连接管理和命令分发。

### 连接管理

#### 探测 + 连接

扩展启动时先通过 HTTP 探测 Daemon 是否运行，再建立 WebSocket 连接：

```typescript
async function connect(): Promise<void> {
  // 已连接或正在连接则跳过
  if (ws?.readyState === WebSocket.OPEN) return;

  // 先探测 Daemon 是否运行
  try {
    const res = await fetch(DAEMON_PING_URL, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return;
  } catch {
    return;  // Daemon 未运行，跳过 WebSocket 连接
  }

  // Daemon 可达，建立 WebSocket 连接
  ws = new WebSocket(DAEMON_WS_URL);
}
```

**为什么先探测再连接**：直接创建 `new WebSocket()` 连接不存在的服务端时，Chrome 会在扩展错误页面记录 `ERR_CONNECTION_REFUSED` 日志，产生大量噪音。通过先 HTTP 探测，避免这些无效的连接尝试。

#### 版本握手

连接建立后，扩展发送版本信息：

```typescript
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'hello',
    version: chrome.runtime.getManifest().version
  }));
};
```

Daemon 会检查版本是否匹配，如果不匹配会在 CLI 侧提示用户更新扩展。

#### 重连策略

```typescript
const MAX_EAGER_ATTEMPTS = 6;  // 最多 6 次指数退避

function scheduleReconnect(): void {
  reconnectAttempts++;
  if (reconnectAttempts > MAX_EAGER_ATTEMPTS) {
    // 超过最大重试次数，停止主动重连
    // 由 chrome.alarms 周期性探测（~24 秒）
    return;
  }

  // 指数退避：2s → 4s → 8s → 16s → 32s → 60s
  const delay = Math.min(
    WS_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1),
    WS_RECONNECT_MAX_DELAY
  );

  reconnectTimer = setTimeout(connect, delay);
}
```

**两阶段重连**：
1. **积极阶段**（前 6 次）：指数退避，从 2 秒到 60 秒
2. **消极阶段**（之后）：由 `chrome.alarms` 周期性触发，约 24 秒一次

这种设计在 Daemon 频繁启停时快速重连，而在 Daemon 长期不运行时减少资源消耗。

### 命令分发

```typescript
ws.onmessage = async (event) => {
  const command = JSON.parse(event.data) as Command;
  const result = await handleCommand(command);
  ws.send(JSON.stringify(result));
};
```

`handleCommand` 根据 `action` 类型路由到对应的处理器。

### 日志转发

扩展 Hook 了 `console.log/warn/error`，将日志转发给 Daemon：

```typescript
const _origLog = console.log.bind(console);

console.log = (...args) => {
  _origLog(...args);  // 保留原始行为
  forwardLog('info', args);  // 转发给 Daemon
};
```

Daemon 维护一个 200 条的日志环形缓冲区，CLI 可以通过 `GET /logs` 获取。这对于排查浏览器端的错误非常有用。

## CDP 操作：cdp.ts

`cdp.ts` 封装了通过 `chrome.debugger` API 执行 CDP 命令的逻辑。

### 调试器附加

```typescript
async function ensureAttached(tabId: number): Promise<void> {
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    // 处理冲突：其他扩展可能已经附加到该标签页
    if (err.message.includes('already attached')) {
      // 检查是否是我们自己附加的
    } else if (err.message.includes('Another debugger')) {
      // 另一个调试器（如 1Password 扩展）占用了
      // 重试逻辑...
    }
  }
}
```

**调试器冲突问题**：Chrome 只允许一个调试器附加到同一个标签页。其他扩展（如 1Password、密码管理器）可能已经附加了调试器。OpenCLI 通过重试和备用策略处理这种情况。

### JavaScript 执行

```typescript
async function evaluate(tabId: number, expression: string): Promise<unknown> {
  await ensureAttached(tabId);

  const result = await chrome.debugger.sendCommand(
    { tabId },
    "Runtime.evaluate",
    {
      expression,
      returnByValue: true,     // 将结果序列化为 JSON
      awaitPromise: true,      // 等待 Promise 完成
      timeout: 30000,          // 30 秒超时
    }
  );

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }

  return result.result.value;
}
```

**关键参数**：
- `returnByValue: true` — 将 JavaScript 对象序列化为 JSON 返回，而不是返回远程对象引用
- `awaitPromise: true` — 如果表达式返回 Promise，等待其 resolve
- `timeout: 30000` — 防止无限等待

### 网络捕获

通过 CDP 的 `Network` 域捕获 HTTP 请求和响应：

```typescript
// 启用网络监听
await chrome.debugger.sendCommand({ tabId }, "Network.enable");

// 监听事件
chrome.debugger.onEvent.addListener((source, method, params) => {
  switch (method) {
    case 'Network.requestWillBeSent':
      // 记录请求 ID → URL 映射
      break;
    case 'Network.responseReceived':
      // 记录响应头和状态码
      break;
    case 'Network.loadingFinished':
      // 获取响应体
      const body = await chrome.debugger.sendCommand(
        { tabId }, "Network.getResponseBody",
        { requestId: params.requestId }
      );
      break;
  }
});
```

**为什么使用 CDP Network 而非 fetch 拦截**：CDP Network 事件可以捕获所有 HTTP 请求，包括由页面 JavaScript 发起的请求。这比在页面中注入拦截器更可靠，不会受到网站反检测的影响。

### CDP 方法白名单

扩展只允许使用预定义的 CDP 方法：

```typescript
const ALLOWED_CDP_METHODS = new Set([
  'Runtime.evaluate',
  'Page.captureScreenshot',
  'Page.navigate',
  'Network.enable',
  'Network.disable',
  // ...有限的集合
]);
```

这防止了 CLI 通过 Daemon 发送任意 CDP 命令，限制了对浏览器的控制范围。

## 标签页管理

### resolveTab — 标签页查找与创建

```typescript
async function resolveTab(url: string, workspace?: string): Promise<number> {
  // 1. 查找已有的匹配标签页
  const tabs = await chrome.tabs.query({ url: `*://*/*` });
  const match = tabs.find(t => t.url?.includes(new URL(url).hostname));
  if (match) return match.id;

  // 2. 在自动化窗口中创建新标签页
  const window = await getOrCreateAutomationWindow(workspace);
  const tab = await chrome.tabs.create({ windowId: window.id, url });
  return tab.id;
}
```

**标签页漂移处理**：用户可能手动在自动化标签页中导航到其他页面。`resolveTab` 会检查标签页的当前 URL 是否仍然匹配目标域名，如果不匹配则重新导航。

### 自动化窗口

为每个工作区创建独立的 Chrome 窗口：

- 窗口标题包含 `[opencli]` 标识
- 用户可以区分哪些是自动化窗口
- 30 秒无操作自动关闭

## 安全考虑

### URL 方案验证

扩展只允许导航到 `http://` 和 `https://` URL：

```typescript
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
```

这防止了通过 `chrome://`、`file://` 等敏感 URL 的访问。

### CDP 方法限制

只有白名单中的 CDP 方法可以执行。即使攻击者通过某种方式控制了 Daemon 的命令，也无法执行危险的 CDP 操作（如 `Browser.close`、`SystemInfo` 等）。

### 数据隔离

每个工作区的自动化窗口是独立的，不同工作区的 Cookie 和状态互不影响。

## 构建系统

扩展使用 Vite 构建：

```bash
# 构建扩展
cd extension && npm run build
```

构建过程将 TypeScript 源码编译为 Service Worker 兼容的 JavaScript。

## 调试扩展

### 查看扩展日志

1. 打开 `chrome://extensions/`
2. 找到 OpenCLI 扩展
3. 点击 "Inspect views: service worker"
4. 在 DevTools 中查看 Console 输出

### 常见问题

**扩展连接后立即断开**：可能是 Daemon 版本与扩展版本不匹配。尝试更新两者到最新版本。

**CDP 附加失败**：某些安全软件或其他扩展（如 1Password）可能占用调试器。尝试暂时禁用其他扩展。

**扩展报 "context invalidated"**：Service Worker 被挂起后重新激活时可能出现。扩展会自动重连。

## 关联文档

- [核心源码分析](./core-source) — CLI 侧的源码
- [浏览器模块详解](../concepts/browser-module) — Bridge/Daemon/Extension 三层架构
- [架构全景](../concepts/architecture) — 整体架构概览
