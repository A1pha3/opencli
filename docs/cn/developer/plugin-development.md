# 插件开发指南

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解插件系统的安装和使用 |
| 进阶 | 能独立开发并发布插件 |
| 专家 | 能开发 Monorepo 多插件包，利用生命周期钩子 |

## 插件系统概述

OpenCLI 的插件系统允许社区开发和分发第三方适配器。插件与内置适配器使用相同的格式（YAML 或 TypeScript），安装后自动在启动时被发现和注册。

**插件与内置适配器的区别**：

| 特性 | 内置适配器 | 插件 |
|------|-----------|------|
| 位置 | `clis/<site>/` | `~/.opencli/plugins/<name>/` |
| 安装方式 | 随 npm 包安装 | `opencli plugin install` |
| 更新方式 | `npm update` | `opencli plugin update` |
| 格式 | YAML / TypeScript | YAML / TypeScript（相同） |
| 命令使用 | 完全相同 | 完全相同 |

## 安装和管理插件

### 安装

```bash
# 从 GitHub 安装
opencli plugin install github:user/repo

# 安装 Monorepo 中的指定子插件
opencli plugin install github:user/repo/subplugin

# 从 URL 安装
opencli plugin install https://github.com/user/repo
```

安装时 OpenCLI 会自动：
1. 克隆仓库到 `~/.opencli/plugins/<name>/`
2. 安装插件自身的依赖
3. 将宿主 `@jackwener/opencli` 链接到插件的 `node_modules/`，确保导入路径正确

**仓库名处理**：如果仓库名带 `opencli-plugin-` 前缀，本地目录名会自动去掉这个前缀。例如 `opencli-plugin-hot-digest` 变成 `hot-digest`。

### 管理

```bash
# 列出已安装插件
opencli plugin list

# 更新单个插件
opencli plugin update <name>

# 更新全部插件
opencli plugin update --all

# 卸载插件
opencli plugin uninstall <name>
```

### 使用

安装后，插件的命令与内置命令完全相同：

```bash
opencli <plugin-name> <command>
```

## 开发 YAML 插件

最简单的插件只需要一个 YAML 文件。

### 目录结构

```
my-plugin/
  └── hot.yaml
```

### 示例

```yaml
site: my-plugin
name: hot
description: Example plugin command
strategy: public
browser: false

pipeline:
  - evaluate: |
      () => [{ title: 'hello', url: 'https://example.com' }]

columns: [title, url]
```

YAML 插件的语法与内置 YAML 适配器完全相同，参考 [YAML 适配器开发教程](./yaml-adapter)。

## 开发 TypeScript 插件

TypeScript 插件需要 `package.json` 来声明模块类型。

### 目录结构

```
my-plugin/
  ├── index.ts
  └── package.json
```

### package.json

```json
{
  "name": "opencli-plugin-my-plugin",
  "type": "module"
}
```

**关键配置**：`"type": "module"` 是必需的，因为 OpenCLI 使用 ES Modules。

### 示例

```typescript
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'my-plugin',
  name: 'hot',
  description: 'Example TS plugin command',
  strategy: Strategy.PUBLIC,
  browser: false,
  columns: ['title', 'url'],
  func: async () => [
    { title: 'hello', url: 'https://example.com' }
  ],
});
```

### 使用宿主 API

TypeScript 插件通过 `@jackwener/opencli/*` 路径导入宿主的模块：

```typescript
// 核心注册
import { cli, Strategy } from '@jackwener/opencli/registry';

// 类型定义
import type { IPage } from '@jackwener/opencli/types';

// 错误类型
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';

// Pipeline 自定义步骤
import { registerStep } from '@jackwener/opencli/pipeline';
```

安装时，OpenCLI 会自动将宿主包链接到插件的 `node_modules/`，确保这些导入路径有效。

### 需要浏览器的插件

```typescript
import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';

cli({
  site: 'my-plugin',
  name: 'search',
  description: 'Search with login',
  strategy: Strategy.COOKIE,
  domain: 'www.example.com',
  columns: ['title', 'url'],
  func: async (page: IPage, kwargs) => {
    const data = await page.evaluate(`
      async () => {
        const res = await fetch('https://www.example.com/api/search?q=${kwargs.query}', {
          credentials: 'include'
        });
        return await res.json();
      }
    `);
    return data.results.map((item: any) => ({
      title: item.title,
      url: item.url,
    }));
  },
});
```

## 插件清单

在仓库根目录放置 `opencli-plugin.json` 声明元数据：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "opencli": ">=1.0.0",
  "description": "我的插件"
}
```

| 字段 | 说明 | 必需 |
|------|------|------|
| `name` | 插件名称（覆盖从仓库名推导的名称） | 否 |
| `version` | 语义化版本 | 否 |
| `opencli` | 所需的 OpenCLI 版本范围（如 `>=1.0.0`） | 否 |
| `description` | 描述 | 否 |
| `plugins` | Monorepo 子插件声明 | 否 |

清单文件是可选的——没有它的插件也可以正常工作。

## Monorepo 多插件包

一个仓库可以通过 `plugins` 字段包含多个插件：

### 清单文件

```json
{
  "version": "1.0.0",
  "opencli": ">=1.0.0",
  "description": "我的插件合集",
  "plugins": {
    "polymarket": {
      "path": "packages/polymarket",
      "description": "预测市场分析",
      "version": "1.2.0"
    },
    "defi": {
      "path": "packages/defi",
      "description": "DeFi 协议数据",
      "version": "0.8.0"
    },
    "experimental": {
      "path": "packages/experimental",
      "disabled": true
    }
  }
}
```

### 目录结构

```
opencli-plugins/
  ├── opencli-plugin.json
  ├── packages/
  │   ├── polymarket/
  │   │   └── ...
  │   ├── defi/
  │   │   └── ...
  │   └── experimental/
  │       └── ...
  └── package.json
```

### 安装 Monorepo 插件

```bash
# 安装全部子插件
opencli plugin install github:user/opencli-plugins

# 安装指定子插件
opencli plugin install github:user/opencli-plugins/polymarket
```

**Monorepo 管理机制**：
- Monorepo 只克隆一次到 `~/.opencli/monorepos/<repo>/`
- 每个子插件通过符号链接出现在 `~/.opencli/plugins/<name>/`
- 更新任何子插件会拉取整个 Monorepo 并刷新所有子插件
- 卸载最后一个子插件时，Monorepo 目录会被自动清理

## 生命周期钩子

插件可以利用 OpenCLI 的生命周期钩子在特定时机执行自定义逻辑：

```typescript
import { onHook } from '@jackwener/opencli/hooks';

// CLI 启动时执行
onHook('onStartup', (ctx) => {
  console.log('Plugin loaded!');
});

// 命令执行前
onHook('onBeforeExecute', (ctx) => {
  // ctx.command: 当前命令
  // ctx.args: 命令参数
});

// 命令执行后
onHook('onAfterExecute', (ctx) => {
  // ctx.command: 当前命令
  // ctx.result: 执行结果
});
```

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| `onStartup` | CLI 启动完成 | 插件初始化 |
| `onBeforeExecute` | 命令执行前 | 日志记录、参数修改 |
| `onAfterExecute` | 命令执行后 | 日志记录、指标收集 |

## 自定义 Pipeline 步骤

插件可以注册自定义的 Pipeline 步骤，供 YAML 适配器使用：

```typescript
import { registerStep } from '@jackwener/opencli/pipeline';

registerStep('myTransform', async (page, params, data, args) => {
  // params: YAML 中的步骤参数
  // data: 上一步的输出
  // args: 命令行参数
  return data.map(item => ({
    ...item,
    customField: computeValue(item),
  }));
});
```

在 YAML 适配器中使用：

```yaml
pipeline:
  - fetch:
      url: https://api.example.com/data
  - myTransform:
      field: score
```

## 版本追踪

OpenCLI 将已安装插件的版本信息记录在 `~/.opencli/plugins.lock.json` 中：

```json
{
  "github-trending": {
    "source": "github:ByteYue/opencli-plugin-github-trending",
    "commit": "a1b2c3d",
    "installedAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-01-15T10:30:00Z"
  }
}
```

`opencli plugin list` 会显示短 commit hash 和版本信息。

## 发布插件

### 推荐的仓库命名

`opencli-plugin-<name>` 格式，例如：
- `opencli-plugin-github-trending`
- `opencli-plugin-hot-digest`

### 推荐的 README 内容

1. 插件功能和命令列表
2. 安装命令
3. 使用示例
4. 环境变量说明（如果需要）
5. 与 `opencli-plugin.json` 一致的版本和兼容性信息

### 现有插件参考

| 插件 | 说明 |
|------|------|
| `opencli-plugin-github-trending` | GitHub Trending 仓库 |
| `opencli-plugin-hot-digest` | 多平台热点聚合（知乎、微博、B站、V2EX、StackOverflow、Reddit、Linux-Do） |
| `opencli-plugin-juejin` | 稀土掘金热榜、分类和文章流 |
| `opencli-plugin-rubysec` | RubySec 漏洞归档 |

## 排查问题

### TS 插件 import 报错

```
Cannot find module '@jackwener/opencli/registry'
```

这是宿主符号链接失效导致的。重新安装插件即可：

```bash
opencli plugin uninstall my-plugin
opencli plugin install github:user/opencli-plugin-my-plugin
```

### 安装后命令未出现

安装或卸载插件后，重新打开终端确保命令被重新发现。

### 插件命令与内置命令冲突

如果插件的 `site/name` 与内置命令相同，插件命令会覆盖内置命令。这是设计行为，允许用户用社区版本替换不满意的内置实现。

## 关联文档

- [YAML 适配器开发](./yaml-adapter) — 插件的 YAML 格式语法
- [TypeScript 适配器开发](./ts-adapter) — 插件的 TypeScript 格式语法
- [Pipeline 系统详解](../concepts/pipeline) — 自定义 Pipeline 步骤
- [架构全景](../concepts/architecture) — 插件在架构中的位置
