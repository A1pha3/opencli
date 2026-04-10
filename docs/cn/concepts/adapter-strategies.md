# 适配器策略体系

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 了解 5 种策略的名称和基本含义 |
| 进阶 | 能根据目标网站特征选择合适的策略 |
| 专家 | 理解每种策略的内部实现原理和性能差异 |

## 什么是适配器策略

**策略（Strategy）** 是 OpenCLI 对"如何获取数据"的分类。不同的网站有不同的数据获取方式——有的提供公开 API，有的需要登录后才能访问，有的数据藏在浏览器的网络请求中。

策略决定了两个关键问题：
1. **是否需要浏览器**：能否直接通过 HTTP 请求获取数据，还是必须在浏览器中操作
2. **如何处理认证**：匿名访问、Cookie 携带、Header 注入，还是网络拦截

## 5 种策略一览

| 策略 | 需要浏览器 | 需要登录 | 典型场景 | 性能 |
|------|-----------|---------|----------|------|
| **PUBLIC** | 否 | 否 | 公开 API（HackerNews、GitHub Trending） | 最快 |
| **COOKIE** | 是 | 是 | 需要登录的 API（Bilibili、知乎） | 快 |
| **HEADER** | 是 | 是 | 需要自定义请求头的 API | 快 |
| **INTERCEPT** | 是 | 是 | SPA 应用（Twitter、小红书） | 中等 |
| **UI** | 是 | 是 | 纯 DOM 操作（复杂交互页面） | 最慢 |

## 策略详细分析

### PUBLIC — 公开 API

**定义**：目标网站提供无需认证的公开 API，OpenCLI 直接通过 Node.js 发起 HTTP 请求获取数据。

**为什么这是最优选择**：
- 不需要启动浏览器和 Daemon，冷启动时间为毫秒级
- 不占用浏览器资源
- 数据格式统一（通常是 JSON），解析简单

**触发条件**：适配器声明 `strategy: public` 且 `browser: false`。

**内部实现**：Pipeline 的 `fetch` 步骤检测到不需要浏览器时，直接使用 Node.js 的 `undici` HTTP 客户端发起请求，跳过整个浏览器栈。

**示例**：HackerNews Top Stories

```yaml
site: hackernews
name: top
strategy: public
browser: false

pipeline:
  - fetch:
      url: https://hacker-news.firebaseio.com/v0/topstories.json
  - limit: "${{ Math.min((args.limit ? args.limit : 20) + 10, 50) }}"
  - map:
      id: ${{ item }}
  - fetch:
      url: https://hacker-news.firebaseio.com/v0/item/${{ item.id }}.json
  # ...后续处理
```

**适用场景**：
- 目标网站有公开 REST API（如 HackerNews、Wikipedia、Weather）
- 数据不需要任何认证
- API 响应是结构化 JSON

---

### COOKIE — Cookie 携带

**定义**：目标网站有需要登录的 API，OpenCLI 通过浏览器内的 `fetch()` 携带用户的 Cookie 来调用这些 API。

**工作原理**：

```
1. OpenCLI 通过 Daemon 让扩展导航到目标网站（如 bilibili.com）
2. 浏览器自动加载用户已有的 Cookie（因为用户曾在此网站登录过）
3. 适配器在浏览器内执行 fetch(url, { credentials: 'include' })
4. 浏览器自动附带 Cookie 发起请求
5. API 返回数据，适配器获取结果
```

**为什么选择 COOKIE 而不是直接发送 Cookie**：
- Cookie 由浏览器管理，OpenCLI 不直接接触敏感凭据
- 浏览器自动处理 Cookie 的域、路径、过期时间等规则
- 某些网站有复杂的签名算法（如 Bilibili 的 WBI 签名），在浏览器内执行可以复用网站自己的 JS 逻辑

**触发条件**：适配器声明 `strategy: cookie`（或未指定 `strategy` 且未设置 `browser: false`）。

**内部实现**：
1. `execution.ts` 通过 `shouldUseBrowserSession()` 判断需要浏览器
2. `BrowserBridge` 创建浏览器会话
3. 根据 `navigateBefore` 配置预导航到 `domain` 指定的域名
4. 适配器的 `func(page, kwargs)` 中通过 `page.evaluate()` 在浏览器内执行 `fetch()`

**示例**：Bilibili Feed（TypeScript 适配器）

```typescript
cli({
  site: 'bilibili',
  name: 'feed',
  strategy: Strategy.COOKIE,
  domain: 'www.bilibili.com',
  // ... 在 func 中通过 page.evaluate() 调用 Bilibili API
})
```

**适用场景**：
- 目标网站有 API 但需要认证
- API 的认证通过 Cookie 实现
- 用户在浏览器中已登录目标网站

---

### HEADER — 自定义请求头

**定义**：与 COOKIE 类似，但适配器需要在 HTTP 请求中注入自定义 Header（如 Authorization、Referer 等）。

**与 COOKIE 的区别**：COOKIE 策略依赖浏览器自动携带 Cookie，HEADER 策略则需要适配器主动构造特定的请求头。这通常用于：
- 需要 Authorization Bearer Token 的 API
- 需要特定 Referer 或 Origin 的反爬检测
- 需要自定义签名头的 API

**适用场景**：
- API 需要特定的认证 Header
- 网站有基于 Header 的反爬机制
- 需要模拟特定客户端的请求格式

---

### INTERCEPT — 网络拦截

**定义**：不直接调用 API，而是通过拦截浏览器内部的网络请求来获取数据。OpenCLI 在页面中注入 JavaScript，Hook `window.fetch` 和 `XMLHttpRequest`，捕获符合条件的请求和响应。

**为什么需要 INTERCEPT**：
有些网站（特别是 SPA 应用）的前端通过复杂的 JavaScript 逻辑构造 API 请求。这些请求可能包含：
- 动态生成的签名参数
- 加密的请求体
- 复杂的 CSRF Token
- 服务端渲染的初始状态

直接调用这些 API 需要逆向工程网站的签名算法，成本极高且容易失效。INTERCEPT 策略让浏览器自己发起请求，OpenCLI 只需要"旁听"获取结果。

**工作原理**：

```
1. OpenCLI 在目标页面注入拦截器 JS
2. 拦截器 Hook window.fetch 和 XMLHttpRequest
3. 用户操作（或适配器模拟操作）触发页面 JavaScript 发起请求
4. 拦截器捕获匹配 URL 模式的请求和响应
5. 存储在 window 的隐藏属性中
6. 适配器读取捕获的数据
```

**拦截器的隐蔽设计**：
- Hook 后的 `fetch.toString()` 返回原始的 `function fetch() { [native code] }`
- 捕获的数据存储在 `window` 的不可枚举属性中
- 防止被网站的检测代码发现

**适用场景**：
- SPA 应用（Twitter、小红书、Instagram）
- API 签名算法复杂且频繁更新
- 数据仅在用户交互时才加载

---

### UI — DOM 操作

**定义**：通过直接操作浏览器 DOM 来获取数据。这是最"暴力"但也最通用的策略，适用于无法通过 API 获取数据的场景。

**为什么 UI 是最后的选择**：
- 性能最差：需要加载完整页面、等待渲染、执行 JavaScript
- 脆弱性最高：页面结构的任何变化都可能导致适配器失效
- 速度最慢：每次操作需要等待 DOM 更新

**适用场景**：
- 目标网站没有 API
- 数据仅在 DOM 中呈现
- 需要模拟复杂的用户交互流程（如多步表单、拖拽操作）

## 策略选择决策树

```
目标网站有公开 API？
├─ 是 → PUBLIC
└─ 否 → 有需要认证的 API？
         ├─ 是 → 能在浏览器中直接 fetch 吗？
         │       ├─ 是，带 Cookie 即可 → COOKIE
         │       └─ 需要自定义 Header → HEADER
         └─ 否 → API 签名能逆向吗？
                  ├─ 太复杂 → INTERCEPT（让浏览器自己请求，旁听数据）
                  └─ 没有API → UI（直接操作 DOM）
```

## 策略在源码中的实现

策略的定义位于 `src/registry.ts`：

```typescript
export enum Strategy {
  PUBLIC = 'public',
  COOKIE = 'cookie',
  HEADER = 'header',
  INTERCEPT = 'intercept',
  UI = 'ui',
}
```

**默认策略推导逻辑**（`cli()` 函数）：

```typescript
const strategy = opts.strategy ?? (opts.browser === false ? Strategy.PUBLIC : Strategy.COOKIE);
const browser = opts.browser ?? (strategy !== Strategy.PUBLIC);
```

这意味着：
- 如果显式设置 `browser: false`，默认策略为 `PUBLIC`
- 否则，默认策略为 `COOKIE`，默认需要浏览器

**浏览器会话决策**（`src/capabilityRouting.ts`）：

```typescript
export function shouldUseBrowserSession(cmd: CliCommand): boolean {
  if (!cmd.browser) return false;           // browser: false → 不需要
  if (cmd.func) return true;                // TS 函数 → 需要
  if (!cmd.pipeline || cmd.pipeline.length === 0) return true;
  if (cmd.strategy !== Strategy.PUBLIC) return true; // 非PUBLIC策略 → 需要
  return pipelineNeedsBrowserSession(cmd.pipeline); // 检查步骤
}
```

## 性能对比

以获取 20 条数据为基准，不同策略的大致性能特征：

| 策略 | 冷启动 | 数据获取 | 稳定性 | 维护成本 |
|------|--------|---------|--------|---------|
| PUBLIC | <100ms | <1s | 极高 | 极低 |
| COOKIE | 2-5s（Daemon + 扩展连接） | 1-3s | 高 | 低 |
| HEADER | 2-5s | 1-3s | 高 | 低 |
| INTERCEPT | 2-5s | 3-10s（需等待页面交互） | 中 | 中 |
| UI | 2-5s | 5-30s（需等待渲染） | 低 | 高 |

## 常见问题

### 可以混合使用策略吗？

TypeScript 适配器中可以自由组合不同策略的元素。例如在 COOKIE 策略的适配器中使用 `page.intercept()` 来捕获部分请求。但在 YAML 适配器中，策略是单一的。

### 为什么有些适配器没有显式声明策略？

`cli()` 函数会根据 `browser` 参数自动推导策略。如果未指定 `browser: false`，默认使用 `COOKIE` 策略。这是为了保持与大多数需要浏览器场景的兼容性。

### 策略可以从 YAML 中指定吗？

可以。YAML 适配器中的 `strategy: public` 或 `strategy: cookie` 等字段会被解析并传递给注册表。

## 关联文档

- [架构全景](./architecture) — 策略在整个架构中的位置
- [Pipeline 系统详解](./pipeline) — YAML 适配器如何使用策略
- [浏览器模块详解](./browser-module) — 浏览器会话的建立过程
- [YAML 适配器开发](../developer/yaml-adapter) — 在 YAML 中声明策略
- [TypeScript 适配器开发](../developer/ts-adapter) — 在 TS 中使用策略
