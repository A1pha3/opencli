# 架构全景

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 OpenCLI 的三层架构和核心模块划分 |
| 进阶 | 掌握命令从输入到输出的完整数据流 |
| 专家 | 理解每个设计决策背后的权衡，能评估架构扩展性 |

## 一句话概括

OpenCLI 是一个**适配器驱动的 CLI 框架**，通过 Chrome 扩展 + 本地 Daemon 的方式，让命令行程序能够复用浏览器的登录会话，自动化地操作网站和桌面应用。

## 整体架构

OpenCLI 由三个核心层构成：

```
┌─────────────────────────────────────────────────────────┐
│                      用户终端                            │
│                   opencli <site> <cmd>                    │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    CLI 核心层 (Node.js)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 命令发现  │→│ 命令注册  │→│ 命令执行  │→│ 输出渲染 │ │
│  └──────────┘  └──────────┘  └────┬─────┘  └─────────┘ │
│                                    │                     │
│  ┌──────────┐  ┌──────────┐       │                     │
│  │ 适配器   │  │ Pipeline │       │                     │
│  │ 注册表   │  │ 执行引擎 │       │                     │
│  └──────────┘  └──────────┘       │                     │
└───────────────────────────────────┼─────────────────────┘
                                    │
                     ┌──────────────┤
                     │              │
                     ▼              ▼
           ┌──────────────┐  ┌──────────────┐
           │  公开 API     │  │  Daemon      │
           │  直接调用     │  │  (HTTP/WS)   │
           └──────────────┘  └──────┬───────┘
                                    │ WebSocket
                                    ▼
                           ┌──────────────────┐
                           │  Chrome 扩展      │
                           │  (Manifest V3)    │
                           │                  │
                           │  ┌────────────┐  │
                           │  │ CDP 操作   │  │
                           │  ├────────────┤  │
                           │  │ 网络拦截   │  │
                           │  ├────────────┤  │
                           │  │ Cookie 管理│  │
                           │  └────────────┘  │
                           └──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │  Chrome 浏览器    │
                           │  (用户登录会话)   │
                           └──────────────────┘
```

### 三层职责

| 层 | 组件 | 职责 |
|----|------|------|
| **CLI 核心层** | Node.js 进程 | 命令解析、适配器发现与注册、执行编排、输出格式化 |
| **Daemon 层** | 本地 HTTP/WS 服务 | 中继 CLI 与 Chrome 扩展之间的通信，管理会话生命周期 |
| **扩展层** | Chrome Extension | 通过 CDP（Chrome DevTools Protocol）控制浏览器，执行 DOM 操作和网络拦截 |

## 核心模块详解

### 1. 命令注册表（Registry）

**位置**：`src/registry.ts`

注册表是 OpenCLI 的核心数据结构，存储在 `globalThis.__opencli_registry__` 中。使用 `globalThis` 而不是模块级变量的原因是为了**解决 npm link 或 monorepo 中多个包副本共享同一个注册表**的问题。

```typescript
// 全局注册表，确保跨模块共享
globalThis.__opencli_registry__ = new Map<string, CliCommand>()
```

每个适配器通过 `cli()` 函数注册自己：

```typescript
import { cli } from '@jackwener/opencli/registry'

cli({
  site: 'bilibili',       // 站点名 → 命令前缀
  name: 'feed',            // 命令名
  strategy: Strategy.COOKIE, // 认证策略
  args: { ... },           // 参数定义
  columns: ['title', 'author'], // 表格输出列
  func: async (page, kwargs) => { ... } // 执行函数
})
```

**注册表存储的 `CliCommand` 包含**：
- `site` + `name`：命令命名空间，最终变为 `opencli <site> <name>`
- `strategy`：决定是否需要浏览器会话以及认证方式
- `args`：参数定义（类型、默认值、校验规则）
- `columns`：表格输出时显示的列
- `func` 或 `pipeline`：执行逻辑（TypeScript 函数或 YAML 步骤链）
- `browser`：是否强制使用浏览器
- `domain`：目标网站域名（用于预导航）

### 2. 命令发现（Discovery）

**位置**：`src/discovery.ts`

发现机制负责在启动时找到并加载所有适配器。它有两条路径：

```
启动
  │
  ├─ 快速路径：读取 cli-manifest.json（编译时预生成）
  │   ├─ YAML 适配器：直接内联，无需文件 I/O
  │   └─ TS 适配器：注册为懒加载桩，首次执行时才导入
  │
  └─ 回退路径：文件系统扫描
      ├─ 扫描 clis/ 目录下的 YAML/TS 文件
      └─ TS 文件通过正则匹配 `cli(` 模式确认是适配器
```

**为什么需要快速路径？** 当适配器数量增长到 80+ 时，文件系统扫描和动态导入的冷启动延迟会变得不可接受。预编译的 `cli-manifest.json` 将启动时间从数秒降低到毫秒级。

适配器来源有三个目录：

| 来源 | 路径 | 说明 |
|------|------|------|
| 内置适配器 | `dist/clis/` | 编译后的内置适配器 |
| 用户适配器 | `~/.opencli/clis/` | 用户自定义的适配器 |
| 插件适配器 | `~/.opencli/plugins/` | 通过插件系统安装的适配器 |

### 3. 命令执行（Execution）

**位置**：`src/execution.ts`

这是命令执行的总调度器，负责串联参数校验、浏览器会话管理和适配器调用：

```
命令执行流程：
  1. 参数校验 → coerceAndValidateArgs()
  2. 判断是否需要浏览器 → shouldUseBrowserSession()
  3. [如需浏览器] 创建浏览器会话 → browserSession()
  4. [如有预导航] 导航到目标域名
  5. [懒加载] 动态导入 TS 适配器模块
  6. 执行适配器逻辑 → cmd.func() 或 Pipeline
  7. 超时控制 → runWithTimeout()
  8. 生命周期钩子 → onBeforeExecute / onAfterExecute
```

**浏览器会话决策**的逻辑：如果 `strategy` 为 `COOKIE`、`INTERCEPT`、`HEADER` 或 `UI`，或者 `browser` 标志为 `true`，或者 Pipeline 中包含需要浏览器的步骤，则创建浏览器会话。

### 4. Pipeline 执行引擎

**位置**：`src/pipeline/`

Pipeline 是 YAML 适配器的执行引擎。每个 YAML 适配器定义一组有序的步骤（steps），Pipeline 按顺序执行，步骤之间通过 `data` 变量传递数据。

```
YAML 适配器                Pipeline 执行
───────────               ────────────
pipeline:                 step 1: fetch
  - fetch: ...            → data = [...items]
  - limit: 10             step 2: limit
  - map: ...                data = data.slice(0, 10)
  - fetch: ...            step 3: map
  - filter: ...             data = data.map(...)
  - map: ...              step 4: fetch (per-item)
                            data = await Promise.all(...)
                          step 5: filter
                            data = data.filter(...)
```

**内置步骤类型**：

| 类别 | 步骤 | 说明 |
|------|------|------|
| 数据获取 | `fetch` | HTTP 请求（支持浏览器内带 Cookie 和 Node.js 直连） |
| | `navigate` | 浏览器页面导航 |
| | `snapshot` | DOM 快照 |
| DOM 操作 | `click`、`type`、`press`、`select` | 模拟用户交互 |
| | `wait` | 等待元素或时间 |
| | `evaluate` | 执行自定义 JavaScript |
| 数据变换 | `map`、`filter`、`sort`、`limit` | 类 SQL 的数据操作 |
| 网络拦截 | `intercept`、`tap` | 捕获浏览器 API 请求和响应 |

### 5. 浏览器模块（Browser Module）

**位置**：`src/browser/`

浏览器模块是 OpenCLI 最核心的差异化能力，采用三层架构：

| 层 | 组件 | 通信方式 |
|----|------|----------|
| CLI → Daemon | `BrowserBridge` | HTTP POST `http://127.0.0.1:19825/command` |
| Daemon → Extension | Daemon WebSocket 转发 | WebSocket `ws://127.0.0.1:19825/ext` |
| Extension → Chrome | CDP (Chrome DevTools Protocol) | `chrome.debugger` API |

**为什么采用这种三层架构？**

直接从 Node.js 通过 CDP 连接 Chrome 是可行的（Puppeteer 就是这么做的），但这有几个问题：
1. 需要以特殊参数启动 Chrome（`--remote-debugging-port`）
2. 无法复用用户已有的浏览器会话和登录状态
3. 每个 CDP 连接需要独占一个调试端口

通过 Chrome 扩展作为中间层，OpenCLI 可以：
- 在用户正常的 Chrome 实例中工作
- 利用扩展的 `chrome.cookies` 和 `chrome.debugger` API
- 通过 Daemon 管理多个并发的自动化会话

### 6. Daemon 守护进程

**位置**：`src/daemon.ts`

Daemon 是一个轻量级 HTTP/WS 服务，运行在 `127.0.0.1:19825`：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/ping` | GET | 健康检查 |
| `/status` | GET | 获取诊断信息 |
| `/command` | POST | 执行浏览器命令 |
| `/shutdown` | POST | 关闭 Daemon |
| `/logs` | GET | 获取日志 |
| `/ext` | WebSocket | Chrome 扩展连接 |

Daemon 的安全措施：
- 仅监听 `127.0.0.1`（本地回环）
- Origin 检查：只允许 `chrome-extension://` 来源
- 自定义 `X-OpenCLI` Header 验证
- 不设置 CORS Header
- 请求体限制 1MB
- 空闲 4 小时自动退出（可通过 `OPENCLI_DAEMON_TIMEOUT` 配置）

### 7. Chrome 扩展

**位置**：`extension/`

Manifest V3 扩展，使用 Service Worker 作为后台脚本。

**核心能力**：
- **CDP 操作**：通过 `chrome.debugger` API 附加到标签页，执行 `Runtime.evaluate`、截图、网络捕获
- **网络拦截**：监听 `Network.requestWillBeSent` / `Network.responseReceived` CDP 事件
- **Cookie 管理**：通过 `chrome.cookies` API 读取和管理 Cookie
- **自动化窗口**：为每个工作区创建独立的 Chrome 窗口，30 秒空闲自动关闭

**连接机制**：
1. 扩展启动时探测 `http://localhost:19825/ping`
2. Daemon 可达后通过 WebSocket 连接到 `ws://localhost:19825/ext`
3. 断开后指数退避重连（2 秒基础，最多 6 次）
4. 重连失败后切换到周期性探测（约 24 秒间隔）

### 8. 输出渲染

**位置**：`src/output.ts`

将适配器返回的数据渲染为用户指定的格式：

| 格式 | 用途 | 触发方式 |
|------|------|----------|
| Table | 终端浏览 | 默认（TTY 环境） |
| JSON | 程序消费 | `--format json` |
| YAML | 配置/数据 | `--format yaml` 或非 TTY 自动降级 |
| CSV | 数据分析 | `--format csv` |
| Markdown | 文档 | `--format markdown` |

### 9. 错误体系

**位置**：`src/errors.ts`

OpenCLI 定义了一套类型化的错误层次结构，每种错误对应唯一的 Unix 退出码：

```
CliError (exit 1) — 基础错误
  ├─ BrowserConnectError (exit 3) — 浏览器连接失败
  ├─ AuthRequiredError (exit 4) — 需要登录
  ├─ TimeoutError (exit 5) — 超时
  ├─ SelectorError (exit 6) — DOM 选择器失败
  ├─ EmptyResultError (exit 7) — 空结果
  ├─ ArgumentError (exit 2) — 参数错误
  ├─ AdapterLoadError (exit 8) — 适配器加载失败
  └─ CommandExecutionError (exit 1) — 执行错误
```

## 完整数据流

以 `opencli bilibili feed` 为例，展示命令从输入到输出的完整路径：

```
1. 用户在终端输入
   opencli bilibili feed
       │
2. Node.js 启动 CLI 进程 (src/main.ts)
       │
3. 启动初始化
   ├─ ensureUserCliCompatShims()  → 创建符号链接确保模块解析
   ├─ ensureUserAdapters()        → 首次运行复制内置适配器
   ├─ discoverClis()              → 读取 manifest 或扫描文件系统
   └─ discoverPlugins()           → 扫描用户插件
       │
4. Commander 解析命令 (src/commanderAdapter.ts)
   bilibili feed → 查找注册表 → 找到对应 CliCommand
       │
5. 执行引擎接管 (src/execution.ts)
   ├─ coerceAndValidateArgs()     → 校验参数
   ├─ shouldUseBrowserSession()   → true (COOKIE 策略)
   └─ browserSession()            → 创建浏览器会话
       │
6. 浏览器会话建立 (src/browser/bridge.ts)
   ├─ 检查 Daemon 是否运行
   ├─ [未运行] 自动启动 Daemon 进程
   ├─ 等待 Chrome 扩展通过 WebSocket 连接
   └─ 创建 Page 对象
       │
7. 预导航到 bilibili.com
   CLI → HTTP POST → Daemon → WebSocket → Extension
   Extension 通过 CDP 创建新标签页并导航
       │
8. 执行适配器逻辑
   动态导入 clis/bilibili/feed.ts
   调用 cmd.func(page, kwargs)
       │
9. 适配器内部执行 (clis/bilibili/feed.ts)
   apiGet(page, '/x/polymer/web-dynamic/v1/feed/all')
   ↓
   page.evaluate('fetch(...)') → 通过 CDP 在浏览器内执行 fetch
   ↓
   浏览器带着用户的 Cookie 发起请求 → 返回 JSON
       │
10. 结果返回与渲染
    JSON 数据 → commanderAdapter → renderOutput()
    → 格式化为表格 → 输出到终端
```

## 技术栈

| 类别 | 技术 | 用途 |
|------|------|------|
| 语言 | TypeScript (ES2022) | 全项目统一语言 |
| 运行时 | Node.js >= 20 | CLI 核心运行环境 |
| CLI 框架 | Commander.js | 命令解析和路由 |
| HTTP 客户端 | undici | Node.js 原生高性能 HTTP |
| WebSocket | ws | CLI-Daemon-Extension 通信 |
| YAML 解析 | js-yaml | YAML 适配器解析 |
| HTML 转换 | turndown | HTML → Markdown 转换 |
| 输出格式化 | chalk + cli-table3 | 终端彩色表格输出 |
| 浏览器扩展 | Chrome Manifest V3 | Service Worker + CDP |
| 构建工具 | tsc + Vite | TypeScript 编译 + 扩展构建 |
| 测试 | Vitest | 单元 / 集成 / E2E 测试 |

## 设计哲学

### 1. 适配器优于内置功能

OpenCLI 的核心只有约 10 个模块，但通过 80+ 适配器覆盖了大量网站。每个适配器是独立的、可热插拔的。这种设计使得：
- 添加新网站支持不需要修改核心代码
- 适配器可以独立开发和测试
- 用户可以自定义适配器而不影响内置功能

### 2. 会话复用优于认证管理

OpenCLI 从不要求用户输入密码，也不自己管理认证状态。它复用浏览器中已有的登录会话。这个决策基于以下考量：
- **安全性**：密码和 Cookie 由浏览器管理，OpenCLI 不接触
- **可靠性**：不需要处理验证码、二次验证、Token 刷新等复杂流程
- **用户友好**：不需要额外的登录步骤

### 3. 声明式优于命令式

YAML 适配器是纯声明式的，不需要编写代码。大部分数据抓取场景可以通过 YAML 配置完成，只有复杂逻辑才需要 TypeScript。这种分层设计降低了 80% 适配器的开发门槛。

### 4. CLI 原生优于 GUI

所有输出都面向终端和管道设计，默认表格格式适合人类阅读，JSON/YAML 格式适合程序消费。这使得 OpenCLI 的输出可以自然地与 Unix 工具链（`jq`、`grep`、`awk`、管道）配合使用。

## 关联文档

- [适配器策略详解](./adapter-strategies) — 5 种策略的工作原理和选择指南
- [Pipeline 系统详解](./pipeline) — YAML 适配器执行引擎的深入分析
- [浏览器模块详解](./browser-module) — Bridge/Daemon/Extension 通信协议
- [核心源码分析](../source/core-source) — 逐文件阅读源码
