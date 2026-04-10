# OpenCLI 中文文档

---

layout: home

hero:
  name: "OpenCLI"
  text: "万物皆可 CLI"
  tagline: "将任何网站、Electron 应用或本地 CLI 变成命令行接口，由 AI 驱动的 80+ 内置适配器"
  actions:
    - theme: brand
      text: 快速入门
      link: /cn/guide/getting-started
    - theme: alt
      text: 架构全景
      link: /cn/concepts/architecture
    - theme: alt
      text: 开发适配器
      link: /cn/developer/yaml-adapter

features:
  - title: "80+ 内置适配器"
    details: "覆盖 Bilibili、知乎、小红书、Twitter、Reddit、YouTube 等主流平台，一个命令即可获取数据"
  - title: "账号安全"
    details: "复用 Chrome/Chromium 已有登录会话，无需输入密码，不触碰凭据"
  - title: "AI Agent 友好"
    details: "专为 Claude Code、Cursor 等 AI Agent 设计，结构化输出可直接被程序消费"
  - title: "两种适配器格式"
    details: "YAML 声明式定义零代码适配器，TypeScript 编写复杂逻辑适配器，覆盖从简单到高级的全部场景"
  - title: "浏览器自动化"
    details: "Chrome 扩展 + 本地 Daemon 架构，支持点击、输入、截图、网络拦截等完整 DOM 操作"
  - title: "插件生态"
    details: "支持社区插件安装、开发和分发，通过 monorepo 模式轻松管理"

---

## 文档导航

### 入门指南

适合刚接触 OpenCLI 的用户，从零开始学习安装和基本使用。

| 文档 | 说明 |
|------|------|
| [快速入门](./guide/getting-started) | 安装、验证、第一条命令、输出格式、Shell 补全 |
| [安装指南](./guide/installation) | npm 安装、源码编译、版本更新、环境验证 |

### 核心概念

适合希望深入理解 OpenCLI 工作原理的用户。

| 文档 | 说明 |
|------|------|
| [架构全景](./concepts/architecture) | 整体架构、模块划分、数据流、技术栈、设计哲学 |
| [适配器策略](./concepts/adapter-strategies) | 5 种适配器策略（PUBLIC / COOKIE / HEADER / INTERCEPT / UI）详解 |
| [Pipeline 系统](./concepts/pipeline) | YAML 适配器的执行引擎，步骤类型、模板引擎、数据流 |
| [浏览器模块](./concepts/browser-module) | Bridge / Daemon / Extension 三层架构与通信协议 |

### 开发扩展

适合想要开发适配器或插件的开发者。

| 文档 | 说明 |
|------|------|
| [YAML 适配器开发](./developer/yaml-adapter) | 零代码创建数据抓取适配器，从分析 API 到编写 YAML |
| [TypeScript 适配器开发](./developer/ts-adapter) | 编写复杂逻辑适配器，API 参考、高级模式、最佳实践 |
| [插件开发](./developer/plugin-development) | 插件生命周期、钩子系统、分发流程 |

### 高级主题

适合遇到复杂场景或需要深度定制的用户。

| 文档 | 说明 |
|------|------|
| [错误处理与排查](./advanced/error-handling) | 错误类型体系、诊断模式、自修复系统、常见问题解决 |
| [CDP 远程调试](./advanced/cdp) | 通过 CDP 连接远程或无头 Chrome |
| [Android Chrome](./advanced/android-chrome) | 通过 ADB 连接 Android 设备上的 Chrome |
| [Electron 应用 CLI 化](./advanced/electron-apps) | 将 Cursor、ChatGPT、Discord 等 Electron 应用变成 CLI |

### 源码分析

适合想要深入源码、参与核心开发的贡献者。

| 文档 | 说明 |
|------|------|
| [核心源码分析](./source/core-source) | 逐模块深度分析注册表、发现、执行、输出等核心模块 |
| [Chrome 扩展源码分析](./source/extension-source) | Manifest V3 扩展架构、CDP 操作、网络拦截实现 |

### 使用场景

适合寻找 OpenCLI 实际应用方向的读者。

| 文档 | 说明 |
|------|------|
| [使用场景总览](./use-cases/overview) | 内容创作、数据分析、自动化工作流、AI Agent 集成等典型场景 |

## 学习路径

### 路径一：用户路径

适合只想使用 OpenCLI 获取数据的用户，不需要编写代码。

```
快速入门 → 安装指南 → 适配器策略（理解即可）→ 使用场景 → 错误处理与排查
```

### 路径二：开发者路径

适合想要开发适配器或为项目贡献代码的开发者。

```
快速入门 → 架构全景 → YAML 适配器开发 → TypeScript 适配器开发 → 核心源码分析
```

### 路径三：进阶路径

适合希望深度定制或参与核心开发的高级用户。

```
架构全景 → 浏览器模块 → Pipeline 系统 → 核心源码分析 → Chrome 扩展源码分析
```
