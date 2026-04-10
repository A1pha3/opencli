# Electron 应用 CLI 化

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 OpenCLI 如何控制 Electron 桌面应用 |
| 进阶 | 能为新的 Electron 应用创建完整的适配器 |
| 专家 | 能处理受控组件、快捷键等复杂交互模式 |

## 适用场景

当目标应用满足以下条件时，使用本方案：

- 应用基于 **Electron** 框架
- 可以通过 `--remote-debugging-port=<port>` 启动
- 需要控制的是**桌面应用本身**，而不是它背后的公开 API

**不适用场景**：如果应用不是 Electron，或者不暴露 CDP 端口，不要强走此方案。

## 工作原理

Electron 应用内嵌 Chromium 渲染引擎，支持通过 CDP（Chrome DevTools Protocol）进行调试。OpenCLI 直接通过 CDP WebSocket 连接到应用，不需要 Chrome 扩展或 Daemon。

```
OpenCLI (CDPBridge)
    │ CDP WebSocket
    ▼
Electron 应用 (:9222)
    │
    ▼
Chromium 渲染引擎 (应用的 UI)
```

这与 Browser Bridge 的区别：

| 特性 | Browser Bridge | Electron CDP |
|------|---------------|-------------|
| 需要 Chrome 扩展 | 是 | 否 |
| Daemon 进程 | 是 | 否 |
| 连接方式 | HTTP → Daemon → WS → Extension → CDP | 直接 CDP WebSocket |
| Cookie 管理 | Chrome 的 Cookie | 应用内部的 Cookie |
| 通信层级 | 三层 | 一层 |

## 已支持的 Electron 应用

OpenCLI 内置了以下 Electron 应用的适配器：

| 应用 | CDP 端口 | 命令数 | 说明 |
|------|----------|--------|------|
| **Cursor** | 3000 | 12 | AI IDE，支持 composer、代码提取 |
| **Codex** | 3000 | 9 | OpenAI Codex CLI Agent |
| **Antigravity** | 41884 | 8 | Antigravity Ultra |
| **ChatGPT** | 41884 | 6 | ChatGPT 桌面应用 |
| **ChatWise** | 3000 | 9 | 多模型客户端 |
| **Notion** | 2121 | 8 | 笔记和知识管理 |
| **Discord** | 41884 | 7 | 即时通讯 |
| **Doubao** | 41884 | 8 | 豆包桌面应用 |

## 使用方法

### 第一步：确认应用是 Electron

macOS 下检查：

```bash
ls /Applications/AppName.app/Contents/Frameworks/Electron\ Framework.framework
```

如果目录存在，通常是 Electron 应用。

### 第二步：带 CDP 端口启动应用

```bash
# macOS
/Applications/Cursor.app/Contents/MacOS/Cursor --remote-debugging-port=3000

# Linux
cursor --remote-debugging-port=3000

# Windows
"C:\Users\<user>\AppData\Local\Programs\Cursor\Cursor.exe" --remote-debugging-port=3000
```

### 第三步：设置环境变量

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:3000"
```

### 第四步：运行命令

```bash
# 验证连接
opencli cursor status

# 发送消息
opencli cursor ask "实现一个快速排序算法"

# 读取回复
opencli cursor read
```

## 为新 Electron 应用创建适配器

### 推荐的 5 命令基线

一个新 Electron 适配器建议先实现这 5 个命令，打通核心能力后再扩展：

| 命令 | 目的 | 验证的能力 |
|------|------|-----------|
| `status` | 确认 CDP 连通 | 连接、标签页选择 |
| `dump` | 导出 DOM/Snapshot | 页面读取、结构分析 |
| `read` | 读取当前上下文 | 定向数据提取 |
| `send` | 输入并发送内容 | 输入、提交 |
| `new` | 新建会话/标签 | 状态重置 |

**为什么先做这 5 个**：它们覆盖了"能连上、能看见、能读、能写、能重置"这 5 件核心能力。如果这 5 个不稳定，不要继续扩展。

### 开发顺序详解

#### 第一步：做 `status`

目标是证明：
- CDP 确实连接上了
- 连到了正确的窗口/标签页
- 应用页面可读

```typescript
// clis/myapp/status.ts
import { cli } from '@jackwener/opencli/registry';

cli({
  site: 'myapp',
  name: 'status',
  description: 'Check connection status',
  strategy: Strategy.PUBLIC,
  browser: true,
  columns: ['connected', 'url', 'title'],
  func: async (page) => {
    const url = await page.evaluate(`document.location.href`);
    const title = await page.evaluate(`document.title`);
    return [{ connected: true, url, title }];
  },
});
```

如果 `status` 都不稳定，先不要继续。

#### 第二步：做 `dump`

**不要猜选择器。** 先导出 DOM 结构，再分析：

```typescript
cli({
  site: 'myapp',
  name: 'dump',
  description: 'Export DOM snapshot',
  // ...
  func: async (page) => {
    // 导出完整 HTML
    const html = await page.evaluate(`document.body.innerHTML`);

    // 导出可访问性快照
    const snapshot = await page.snapshot();

    return [{ html: html.slice(0, 5000), snapshot: String(snapshot) }];
  },
});
```

通过 dump 结果分析：
- 消息列表的容器在哪个元素
- 输入框的选择器是什么
- 发送按钮在哪里
- 当前会话的结构是什么

#### 第三步：做 `read`

只读真正需要的区域，不要把整个页面文本都塞出来：

```typescript
func: async (page) => {
  const messages = await page.evaluate(`
    (() => {
      const items = document.querySelectorAll('[data-testid="message"]');
      return Array.from(items).map(el => ({
        role: el.getAttribute('data-role'),
        content: el.textContent,
      }));
    })()
  `);
  return messages;
},
```

#### 第四步：做 `send`

Electron 应用的输入框通常是 React 控制组件，直接改 `.value` 往往无效。更稳妥的方式：

```typescript
func: async (page, kwargs) => {
  // 1. 聚焦输入区域
  await page.click('[contenteditable="true"]');

  // 2. 使用 execCommand 插入文本（比设置 .value 更可靠）
  await page.evaluate(`
    document.execCommand('insertText', false, ${JSON.stringify(kwargs.text)})
  `);

  // 3. 用真实按键提交
  await page.press('Enter');  // 或 Meta+Enter
},
```

#### 第五步：做 `new`

很多桌面应用的新建操作更适合走快捷键：

```typescript
func: async (page) => {
  const isMac = process.platform === 'darwin';
  await page.press(isMac ? 'Meta+N' : 'Control+N');
  await page.wait(1000);
},
```

### 文件结构

```
clis/<app>/
  ├── utils.ts        # 共享工具（选择器、辅助函数）
  ├── status.ts       # 连接状态
  ├── dump.ts         # DOM 导出
  ├── read.ts         # 读取内容
  ├── send.ts         # 发送消息
  └── new.ts          # 新建会话
```

基础能力稳定后，再扩展：
- `ask` — 发送 + 等待回复
- `history` — 历史记录
- `model` — 切换模型
- `screenshot` — 截图
- `export` — 导出数据

## 在应用注册表中注册

新应用需要在 `src/electron-apps.ts` 中注册：

```typescript
const ELECTRON_APPS = {
  // ... 现有应用
  myapp: {
    cdpPort: 3000,
    processName: 'MyApp',
  },
};
```

这样 OpenCLI 可以自动检测应用是否在运行。

## 常见问题

### CDP 能连，但命令不稳定

常见原因：
- **连错窗口/标签页**：使用 `OPENCLI_CDP_TARGET` 指定目标
- **页面没渲染完**：在操作前加 `await page.wait(1000)`
- **选择器是猜的**：先用 `dump` 命令获取真实的 DOM 结构
- **受控组件**：直接赋值 `.value` 不生效，用 `document.execCommand('insertText')`

### 应用启动后 CDP 端口没有响应

- 确认 `--remote-debugging-port` 参数正确
- 某些应用需要先完全启动后才响应 CDP
- 检查端口是否被其他进程占用：`lsof -i :9222`

### 看起来像 Chromium，但 CDP 不工作

有些应用虽然嵌了 Chromium，但并不暴露可用的 CDP 接口。这种情况不要强走 Electron 方案。

### 应用也有网页版，还要做 Electron 适配器吗

如果网页版已经足够稳定，浏览器适配器通常更简单。只有当**桌面应用才是真正的集成面**时，才优先做 Electron 适配器。

## 与 CDP 远程调试的关系

Electron 应用适配器使用的是同一个 CDP 直连机制，区别在于：

| 特性 | CDP 远程调试 | Electron 适配器 |
|------|-------------|----------------|
| 目标 | 远程 Chrome 浏览器 | 本地 Electron 应用 |
| 需要隧道 | 可能需要 | 不需要（本地连接） |
| 自动检测 | 手动设置 `OPENCLI_CDP_ENDPOINT` | 应用注册表自动配置 |
| 适配器类型 | 使用浏览器适配器 | 专用桌面适配器 |

## 关联文档

- [CDP 远程调试](./cdp) — CDP 连接的底层原理
- [Android Chrome](./android-chrome) — 另一种 CDP 直连场景
- [TypeScript 适配器开发](../developer/ts-adapter) — 适配器的完整 API 参考
- [浏览器模块详解](../concepts/browser-module) — CDPBridge 的实现细节
- [核心源码分析](../source/core-source) — electron-apps.ts 的源码分析
