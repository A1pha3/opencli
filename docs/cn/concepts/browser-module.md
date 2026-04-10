# 浏览器模块详解

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 CLI、Daemon、Extension 三层架构的通信链路 |
| 进阶 | 掌握浏览器会话的创建流程和 Page API 的使用 |
| 专家 | 理解安全模型、CDP 操作机制和网络拦截的实现原理 |

## 为什么需要浏览器模块

OpenCLI 的核心能力之一是**复用用户的浏览器登录状态**。要实现这一点，OpenCLI 必须能够：
1. 控制一个已经登录的 Chrome 浏览器实例
2. 在浏览器中执行 JavaScript（调用 API、操作 DOM）
3. 捕获浏览器内的网络请求和响应

传统的浏览器自动化方案（如 Puppeteer、Playwright）通过 CDP（Chrome DevTools Protocol）直接连接 Chrome，但要求以特殊参数（`--remote-debugging-port`）启动 Chrome。这意味着用户不能使用自己正在浏览的 Chrome 实例。

OpenCLI 的方案是：通过 Chrome 扩展作为桥梁，在用户正常的 Chrome 实例中执行操作。

## 三层架构

浏览器模块由三个组件构成，形成一条通信链路：

```
CLI 进程 (Node.js)
    │
    │ HTTP POST
    ▼
Daemon 守护进程 (Node.js)
    │
    │ WebSocket
    ▼
Chrome 扩展 (Manifest V3)
    │
    │ chrome.debugger API
    ▼
Chrome 浏览器 (用户实例)
```

### 各层职责

| 层 | 位置 | 进程 | 职责 |
|----|------|------|------|
| CLI | `src/browser/bridge.ts` | 主进程 | 创建会话、发送命令 |
| Daemon | `src/daemon.ts` | 独立进程 | 中继通信、管理生命周期 |
| Extension | `extension/src/` | Chrome 进程 | 执行浏览器操作、返回结果 |

**为什么需要 Daemon 中间层？**

CLI 进程是短暂的——每条命令结束后就退出。Chrome 扩展需要一个持久的连接点。Daemon 作为常驻后台进程，为多个 CLI 调用提供共享的浏览器会话。

## BrowserBridge — 会话管理器

**位置**：`src/browser/bridge.ts`

BrowserBridge 是 CLI 侧的入口，负责管理浏览器会话的完整生命周期。

### 状态机

BrowserBridge 的状态转换：

```
idle → connecting → connected → closing → closed
                        │                    │
                        └────── 可以复用 ──────┘
```

| 状态 | 含义 |
|------|------|
| `idle` | 未建立连接 |
| `connecting` | 正在连接（等待 Daemon 和 Extension） |
| `connected` | 已连接，可以使用 |
| `closing` | 正在关闭 |
| `closed` | 已关闭，不可复用 |

### 连接流程

`connect()` 方法的完整流程：

```
connect()
  │
  ├─ 1. 检查 Daemon 状态 → fetchDaemonStatus()
  │     │
  │     ├─ Extension 已连接 → 直接创建 Page
  │     │
  │     ├─ Daemon 运行但 Extension 未连接
  │     │   └─ 等待 Extension 连接（轮询 200ms，超时 10s）
  │     │
  │     └─ Daemon 未运行
  │         ├─ 自动启动 Daemon 进程（detached）
  │         ├─ 等待 Daemon + Extension 就绪
  │         └─ 超时则报错
  │
  └─ 2. 创建 Page 对象 → new Page(workspace)
```

**关键实现细节**：
- Daemon 进程以 `detached: true` 和 `stdio: 'ignore'` 启动，CLI 退出后 Daemon 继续运行
- 连接等待使用 200ms 间隔轮询，在 TTY 环境下输出进度提示
- 如果超时，错误信息包含具体的排查指引

## Daemon — 守护进程

**位置**：`src/daemon.ts`

Daemon 是一个轻量级的 HTTP + WebSocket 双协议服务器，运行在 `127.0.0.1:19825`。

### HTTP 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/ping` | GET | 健康检查（Daemon 是否运行） |
| `/status` | GET | 返回 Daemon 状态和 Extension 连接信息 |
| `/command` | POST | **核心端点** — 执行浏览器命令 |
| `/shutdown` | POST | 关闭 Daemon |
| `/logs` | GET | 获取扩展日志缓冲区 |

### WebSocket 端点

| 端点 | 用途 |
|------|------|
| `/ext` | Chrome 扩展连接通道 |

### 命令转发机制

```
CLI 发送 HTTP POST /command
  │
  ▼
Daemon 接收请求，生成唯一 ID
  │
  ▼
通过 WebSocket 转发给 Extension
  │
  ▼
Extension 执行操作，返回结果
  │
  ▼
Daemon 通过 Promise.resolve() 返回给 CLI 的 HTTP 响应
```

Daemon 维护一个 `pending` Map，记录每个待处理的命令 ID 及其 Promise 的 resolve/reject。当 Extension 通过 WebSocket 返回结果时，Daemon 找到对应的 Promise 并 resolve。

### 空闲超时

Daemon 使用 `IdleManager` 监控空闲状态。默认 4 小时无 CLI 请求且无 Extension 连接时自动退出。超时时间可通过 `OPENCLI_DAEMON_TIMEOUT` 环境变量配置。

### 安全模型

Daemon 实施了 5 层安全防护（纵深防御）：

| 层 | 机制 | 防御目标 |
|----|------|----------|
| 1 | Origin 检查 | 拒绝非 `chrome-extension://` 来源的 HTTP 请求 |
| 2 | `X-OpenCLI` Header | 浏览器无法在无 CORS 的情况下发送自定义 Header |
| 3 | 无 CORS Header | 响应不包含 `Access-Control-Allow-Origin` |
| 4 | 请求体限制 | 1MB 上限防止 OOM |
| 5 | WebSocket verifyClient | 在握手前验证升级请求 |

**为什么这些措施有效**：恶意网页（攻击者控制的网站）无法向 Daemon 发送请求，因为：
- 网页的 Origin 是 `https://evil.com`，会被 Origin 检查拦截
- 即使绕过 Origin 检查，网页无法发送 `X-OpenCLI` Header（浏览器 CORS 策略限制）
- 即使发送了 Header，Daemon 不返回 CORS Header，浏览器的跨域请求会失败

## Chrome 扩展

**位置**：`extension/`

OpenCLI 的 Chrome 扩展使用 Manifest V3 规范，以 Service Worker 作为后台脚本。

### 权限声明

```json
{
  "permissions": ["debugger", "tabs", "cookies", "activeTab", "alarms"],
  "host_permissions": ["<all_urls>"]
}
```

| 权限 | 用途 |
|------|------|
| `debugger` | 通过 CDP 控制标签页（`chrome.debugger` API） |
| `tabs` | 管理标签页的创建、查找和切换 |
| `cookies` | 读取和管理 Cookie |
| `activeTab` | 访问当前活动标签页 |
| `alarms` | 周期性探测 Daemon 连接状态 |
| `<all_urls>` | 在任意网站上执行操作 |

### 核心组件

#### Service Worker (`background.ts`)

扩展的核心入口。负责：
1. **连接管理**：启动时探测 Daemon，通过 WebSocket 连接
2. **命令分发**：接收 Daemon 转发的命令，路由到对应处理器
3. **窗口管理**：为每个工作区创建独立的自动化窗口

#### CDP 操作 (`cdp.ts`)

通过 `chrome.debugger` API 执行 CDP 命令：

```typescript
// 附加到标签页
chrome.debugger.attach({ tabId }, "1.3")

// 执行 JavaScript
chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
  expression: code,
  returnByValue: true,
  awaitPromise: true,
})

// 截图
chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", { format: "png" })
```

**CDP 方法白名单**：扩展只允许使用预定义的 CDP 方法，防止任意 CDP 访问。

#### 网络捕获

通过 CDP 的 `Network` 域捕获请求和响应：

```
1. Network.enable → 开始监听
2. Network.requestWillBeSent → 记录请求 URL 和 ID
3. Network.responseReceived → 记录响应头和状态
4. Network.loadingFinished → 获取响应体
5. Network.getResponseBody → 读取完整响应内容
```

### 连接与重连

扩展的连接机制：

```
安装/启动
  │
  ├─ 探测 http://localhost:19825/ping
  │   │
  │   ├─ 可达 → 连接 WebSocket ws://localhost:19825/ext
  │   │         │
  │   │         ├─ 成功 → 正常工作
  │   │         │
  │   │         └─ 断开 → 指数退避重连
  │   │                   ├─ 基础 2 秒
  │   │                   ├─ 最多 6 次
  │   │                   └─ 失败后切换到周期探测（~24 秒）
  │   │
  │   └─ 不可达 → 周期探测（~24 秒，使用 chrome.alarms）
```

### 自动化窗口

为每个工作区创建独立的 Chrome 窗口进行自动化操作：
- 窗口标题包含 `[opencli]` 标识
- 30 秒无操作自动关闭（释放资源）
- 与用户正常浏览的窗口隔离

## Page 对象

**位置**：`src/browser/page.ts`

Page 是 CLI 侧操作浏览器的核心接口，实现了 `IPage` 接口。它通过 HTTP 与 Daemon 通信，间接控制浏览器。

### 核心 API

| 方法 | 用途 |
|------|------|
| `navigate(url)` | 导航到指定 URL |
| `evaluate(code)` | 在浏览器中执行 JavaScript |
| `click(selector)` | 点击元素 |
| `type(selector, text)` | 输入文本 |
| `scroll(direction)` | 滚动页面 |
| `wait(selector, timeout)` | 等待元素出现 |
| `snapshot()` | 获取 DOM 快照 |
| `intercept(pattern)` | 设置网络拦截 |
| `screenshot()` | 截取页面截图 |
| `cookies(url)` | 获取 Cookie |
| `tabs()` | 管理标签页 |

### evaluate 的实现原理

`evaluate()` 是最核心的方法。当适配器调用 `page.evaluate('fetch(...)')` 时：

```
1. Page 对象构造 HTTP 请求
   POST http://127.0.0.1:19825/command
   Body: { action: "exec", code: "fetch(...)" }

2. Daemon 接收请求，通过 WebSocket 转发给扩展
   WebSocket 消息: { id: "abc123", action: "exec", code: "fetch(...)" }

3. 扩展的 background.ts 收到消息
   ├─ 找到或创建目标标签页
   ├─ 附加 CDP debugger
   └─ 执行 Runtime.evaluate

4. Chrome 执行 JavaScript
   ├─ 在目标标签页的上下文中执行
   ├─ 自动携带该域的 Cookie
   └─ 返回结果给 CDP

5. 扩展通过 WebSocket 返回结果
   { id: "abc123", result: {...} }

6. Daemon resolve 对应的 Promise
   → HTTP 响应返回给 CLI

7. Page.evaluate() 返回结果
```

### BasePage 抽象层

**位置**：`src/browser/base-page.ts`

`BasePage` 是一个抽象基类，为 `Page`（Daemon 模式）和 `CDPPage`（直连 CDP 模式）提供共享的 DOM 操作实现。

**为什么需要抽象层**：Daemon 模式和直连 CDP 模式的底层通信方式不同，但 DOM 操作（click、type、scroll、wait）的逻辑是相同的。BasePage 将这些操作封装为可复用的 JS 代码生成器，子类只需要实现底层的代码执行方法。

## CDP 直连模式

**位置**：`src/browser/cdp.ts`

对于 Electron 应用（如 Cursor、ChatGPT、Discord），OpenCLI 不使用扩展，而是通过 CDP 直连：

```
CLI 进程
  │
  │ CDP WebSocket
  ▼
Electron 应用 ( --remote-debugging-port )
```

**为什么 Electron 不使用扩展**：
- Electron 应用不安装 Chrome 扩展
- Electron 应用可以通过启动参数暴露 CDP 端口
- 直连 CDP 更简单、延迟更低

CDP 模式支持的应用在 `src/electron-apps.ts` 中注册，包括 Cursor、ChatGPT、Notion、Discord 等。

## DOM 快照

**位置**：`src/browser/dom-snapshot.ts`

DOM 快照是 OpenCLI 独创的 DOM 序列化方案，将页面的 DOM 结构转换为类似可访问性树的文本格式，并为每个可交互元素分配索引号 `[N]`：

```
[1] navigation "Main navigation"
  [2] link "Home"
  [3] link "About"
[4] main
  [5] heading "Welcome"
  [6] button "Search"
  [7] textbox "Enter keywords"
```

适配器可以通过索引号操作对应的元素：

```typescript
await page.click('[6]')  // 点击 Search 按钮
await page.type('[7]', 'hello')  // 在输入框中输入文本
```

**为什么使用快照而非 CSS 选择器**：
- 快照提供稳定且人类可读的元素引用
- 不依赖具体的 CSS class 或 ID（这些经常变化）
- AI Agent 可以理解快照并选择正确的元素

## 网络拦截

**位置**：`src/interceptor.ts`

网络拦截器通过猴子补丁（Monkey Patch）`window.fetch` 和 `XMLHttpRequest.prototype` 来捕获 API 请求。

### 实现原理

```javascript
// 保存原始 fetch
const _origFetch = window.fetch;

// 替换为 Hook 版本
window.fetch = async function(...args) {
  const response = await _origFetch.apply(this, args);

  // 检查 URL 是否匹配拦截模式
  if (matchPattern(args[0], pattern)) {
    const clone = response.clone();
    const body = await clone.text();
    // 存储捕获的数据
    captured.push({ url: args[0], body, headers: ... });
  }

  return response;
};

// 伪装 toString
window.fetch.toString = () => 'function fetch() { [native code] }';
```

### 隐蔽性设计

拦截器需要不被网站检测到：

1. **toString 伪装**：`fetch.toString()` 返回原生代码签名
2. **不可枚举存储**：捕获的数据存储在 `window` 的不可枚举属性中
3. **属性描述符伪装**：拦截器的属性描述符模拟原生行为

### 两种模式

| 模式 | 方法 | 行为 |
|------|------|------|
| 持续拦截 | `page.intercept(pattern)` | 持续捕获所有匹配的请求 |
| 单次捕获 | `page.tap(pattern)` | 捕获第一个匹配请求后自动移除拦截器 |

## 配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `OPENCLI_DAEMON_PORT` | `19825` | Daemon 监听端口 |
| `OPENCLI_DAEMON_TIMEOUT` | `14400000` (4h) | Daemon 空闲超时时间（毫秒） |
| `OPENCLI_VERBOSE` | - | 输出详细连接日志 |

## 关联文档

- [架构全景](./architecture) — 浏览器模块在整体架构中的位置
- [适配器策略](./adapter-strategies) — 策略如何决定是否使用浏览器
- [Pipeline 系统详解](./pipeline) — Pipeline 步骤如何调用 Page API
- [错误处理与排查](../advanced/error-handling) — 浏览器连接失败的排查方法
