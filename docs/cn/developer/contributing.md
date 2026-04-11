# 参与贡献

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 能成功搭建开发环境并运行测试 |
| 进阶 | 能创建符合规范的适配器或修复 Bug |
| 专家 | 能参与核心模块的改进和架构讨论 |

## 快速开始

### 环境搭建

```bash
# 1. Fork 并克隆仓库
git clone git@github.com:<your-username>/opencli.git
cd opencli

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 运行检查
npx tsc --noEmit       # 类型检查
npm test               # 核心单元测试
npm run test:adapter   # 适配器测试

# 5. 全局链接（可选，用于测试 opencli 命令）
npm link
```

### 编译过程

```bash
npm run build
# 实际执行四个步骤：
# 1. clean-dist    → 清理 dist/ 目录
# 2. tsc           → TypeScript 编译（src/ 和 clis/）
# 3. copy-yaml     → 复制 YAML 适配器到 dist/clis/
# 4. build-manifest → 扫描适配器生成 cli-manifest.json
```

### 本地运行与开发调试

很多新贡献者卡住的点，不是“怎么写代码”，而是不清楚“改完之后到底该怎么跑”。在这个仓库里，推荐把运行方式分成三类理解。

#### 1. 开发模式：直接运行源码

最适合日常开发，改完即可验证，不需要先构建。

```bash
# 查看帮助
npm run dev -- --help

# 运行公开命令
npm run dev -- hackernews top --limit 5

# 运行需要浏览器的命令
npm run dev -- bilibili feed

# 带命名参数的命令也一样，注意 npm run dev 后必须先写 --
npm run dev -- zhihu publish --title "测试标题" --file ./article.txt --execute
```

这里第一个 `--` 是 npm script 的参数分隔符，不是 OpenCLI 自己的参数。
如果省略它，npm 会把 `--title`、`--file`、`--execute` 这类选项当成 npm 配置项，实际传给源码入口的只剩位置参数，最后通常会报“缺少必填选项”一类的错误。

例如下面这种写法是错误的：

```bash
npm run dev zhihu publish --title "测试标题" --file ./article.txt --execute
```

它最终不会把 `--title` 正确传给 OpenCLI。

适用场景：

- 修改了 `src/` 下核心逻辑
- 修改了 `clis/` 下 TypeScript 适配器
- 修改了 YAML 适配器，想快速确认行为
- 需要频繁反复调试

#### 2. 产物模式：运行构建后的 dist

适合验证“构建产物是否能工作”，尤其是在提交前。

```bash
# 先构建
npm run build

# 通过 package.json 脚本运行
npm start -- --help
npm start -- hackernews top --limit 5

# 或直接执行入口
node dist/src/main.js --help
node dist/src/main.js hackernews top --limit 5
```

适用场景：

- 想确认 `dist/` 产物没有问题
- 排查某个问题是不是只在编译后出现
- 提交前做一次接近真实发布环境的验证

#### 3. 链接模式：将本地仓库暴露为 opencli 命令

如果你希望像正式安装那样直接输入 `opencli`，可以用：

```bash
npm link

opencli --help
opencli hackernews top --limit 5
```

这适合长期参与开发，但要注意：

- `opencli` 指向的是你当前仓库的构建产物
- 如果你修改了需要进入 `dist/` 的代码，通常要重新执行 `npm run build`
- 如果你只是想快速验证逻辑，`npm run dev -- ...` 往往更省事

### 新手推荐工作流

如果你第一次为项目做改动，按这条路径最稳妥：

```bash
# 1. 安装依赖
npm install

# 2. 先确认源码入口能跑
npm run dev -- --help

# 3. 修改代码后用开发模式验证
npm run dev -- <site> <command> [args...]

# 4. 提交前做类型检查和构建验证
npm run typecheck
npm run build

# 5. 如有对应测试，再跑测试
npm test
npm run test:adapter
```

一句话判断：

- 平时开发看效果，用 `npm run dev -- ...`
- 提交前验产物，用 `npm run build` 和 `npm start -- ...`
- 想把本地仓库当全局命令用，再执行 `npm link`
- 只要是通过 npm script 透传命令参数，都先写分隔符：`npm run dev -- ...`、`npm start -- ...`

## 添加新适配器

这是最常见的贡献类型。优先使用 YAML，只在需要时使用 TypeScript。

### YAML 适配器（推荐）

创建文件 `clis/<site>/<command>.yaml`：

```yaml
site: mysite
name: trending
description: Trending posts on MySite
domain: www.mysite.com
strategy: public
browser: false

args:
  query:
    positional: true
    type: str
    required: true
    description: Search keyword
  limit:
    type: int
    default: 20
    description: Number of items

pipeline:
  - fetch:
      url: https://api.mysite.com/trending

  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
      score: ${{ item.score }}
      url: ${{ item.url }}

  - limit: ${{ args.limit }}

columns: [rank, title, score, url]
```

参考 [YAML 适配器开发教程](./yaml-adapter) 了解完整的步骤和语法。

### TypeScript 适配器

创建文件 `clis/<site>/<command>.ts`：

```typescript
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'mysite',
  name: 'search',
  description: 'Search MySite',
  domain: 'www.mysite.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: 'Search query' },
    { name: 'limit', type: 'int', default: 10, help: 'Max results' },
  ],
  columns: ['title', 'url', 'date'],
  func: async (page, kwargs) => {
    const { query, limit = 10 } = kwargs;
    const data = await page.evaluate(`
      async () => {
        const res = await fetch('/api/search?q=${encodeURIComponent('${query}')}', {
          credentials: 'include'
        });
        return (await res.json()).results;
      }
    `);
    return data.slice(0, Number(limit)).map((item: any) => ({
      title: item.title,
      url: item.url,
      date: item.created_at,
    }));
  },
});
```

参考 [TypeScript 适配器开发教程](./ts-adapter) 了解完整的 API 和模式。

### 验证适配器

```bash
# 编译
npm run build

# 开发模式直接运行源码（推荐先用这个）
npm run dev -- <site> <command> --limit 3 --format json

# 测试命令
opencli <site> <command> --limit 3 --format json

# 详细模式调试
opencli <site> <command> --limit 3 -v

# YAML 语法验证
opencli validate
```

## 参数设计规范

### 位置参数 vs 命名参数

| 参数类型 | 使用 `positional: true` | 示例 |
|----------|------------------------|------|
| 主要目标（query、symbol、id、url、username） | 是 | `search '关键词'`、`stock SH600519` |
| 配置选项（limit、format、sort、page、filters） | 否 | `--limit 10`、`--format json` |

**判断标准**：想象用户如何输入命令。`opencli xueqiu stock SH600519` 比 `opencli xueqiu stock --symbol SH600519` 更自然。

YAML 示例：

```yaml
args:
  query:
    positional: true     # 主要参数，直接输入
    type: str
    required: true
  limit:
    type: int            # 配置参数，用 --limit
    default: 20
```

TypeScript 示例：

```typescript
args: [
  { name: 'query', positional: true, required: true, help: 'Search query' },
  { name: 'limit', type: 'int', default: 10, help: 'Max results' },
]
```

## 测试

### 测试结构

OpenCLI 使用 Vitest，分为四个测试项目：

| 项目 | 范围 | 命令 |
|------|------|------|
| 单元测试 | `src/**/*.test.ts` | `npm test` |
| 适配器测试 | `clis/**/*.test.ts` | `npm run test:adapter` |
| E2E 测试 | `tests/e2e/` | `npx vitest run tests/e2e/` |
| 冒烟测试 | 快速验证 | `npx vitest run tests/smoke/` |

### 编写适配器测试

```typescript
// clis/mysite/search.test.ts
import { describe, it, expect } from 'vitest';

describe('mysite search', () => {
  it('should return results', async () => {
    // 测试逻辑
  });
});
```

### 运行特定测试

```bash
# 运行所有测试
npx vitest run

# 运行特定文件的测试
npx vitest run clis/hackernews/top.test.ts

# 监视模式（开发时使用）
npx vitest watch
```

## 代码风格

| 规则 | 说明 |
|------|------|
| TypeScript 严格模式 | 避免不必要的 `any` |
| ES Modules | 导入使用 `.js` 扩展名 |
| 文件命名 | `kebab-case` |
| 变量/函数 | `camelCase` |
| 类型/类 | `PascalCase` |
| 导出 | 使用命名导出，不使用默认导出 |

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
feat(twitter): add thread command
fix(browser): handle CDP timeout gracefully
docs: update CONTRIBUTING.md
test(reddit): add e2e test for save command
chore: bump vitest to v4
```

常用的 scope：
- **站点名**：`twitter`、`reddit`、`bilibili`、`zhihu`
- **模块名**：`browser`、`pipeline`、`engine`、`daemon`

## 提交 Pull Request

### 流程

1. 创建功能分支：`git checkout -b feat/mysite-trending`
2. 编写代码和测试
3. 运行检查：

```bash
npx tsc --noEmit           # 类型检查
npm test                   # 单元测试
npm run test:adapter       # 适配器测试
opencli validate           # YAML 验证
```

4. 提交代码（使用 Conventional Commits 格式）
5. 推送并创建 Pull Request

### PR 描述模板

```markdown
## Summary
- 添加了 xxx 适配器
- 支持 yyy 和 zzz 命令

## Test Plan
- [ ] `opencli <site> <command> --limit 5` 正常返回数据
- [ ] `--format json` 输出格式正确
- [ ] `--help` 显示正确的参数说明
```

## 常用开发命令

```bash
# 开发模式运行源码
npm run dev -- --help
npm run dev -- hackernews top --limit 5
npm run dev -- zhihu publish --title "测试标题" --file ./article.txt --execute

# 编译
npm run build

# 运行构建产物
npm start -- --help
npm start -- hackernews top --limit 5

# 类型检查（不编译）
npx tsc --noEmit

# 或使用 package.json 脚本
npm run typecheck

# 运行测试
npm test
npm run test:adapter

# 全局链接（用于测试 CLI 命令）
npm link

# 验证 YAML 适配器
opencli validate

# 网站探索（辅助适配器开发）
opencli explore <url>
```

## 许可证

通过贡献代码，你同意你的贡献将在 [Apache-2.0 License](https://github.com/jackwener/opencli/blob/main/LICENSE) 下授权。

## 关联文档

- [YAML 适配器开发教程](./yaml-adapter) — 详细教程和完整示例
- [TypeScript 适配器开发教程](./ts-adapter) — API 参考和高级模式
- [适配器策略详解](../concepts/adapter-strategies) — 策略选择指南
- [架构全景](../concepts/architecture) — 理解项目架构
- [错误处理与排查](../advanced/error-handling) — 适配器测试和调试
