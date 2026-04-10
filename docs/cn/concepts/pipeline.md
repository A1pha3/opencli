# Pipeline 系统详解

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 Pipeline 是什么，能读懂 YAML 适配器 |
| 进阶 | 能独立编写包含多种步骤类型的 Pipeline |
| 专家 | 理解模板引擎的求值机制和性能优化策略 |

## 什么是 Pipeline

**Pipeline（管道）** 是 OpenCLI 为 YAML 适配器设计的执行引擎。每个 YAML 适配器定义一组有序的步骤（steps），Pipeline 按顺序执行这些步骤，步骤之间通过 `data` 变量传递中间结果。

Pipeline 的核心思想来自 Unix 管道：**每个步骤接收上一步的输出，处理后传递给下一步**。

```
输入 (null)
  → fetch → data = [item1, item2, ...]
  → limit → data = data.slice(0, N)
  → map   → data = data.map(转换)
  → fetch → data = [detail1, detail2, ...]
  → 输出
```

## 为什么需要 Pipeline

在没有 Pipeline 之前，每个适配器都需要用 TypeScript 编写。这意味着：
- 开发者需要了解 TypeScript、Node.js 和 OpenCLI 的 API
- 每个适配器都需要编译、测试
- 代码重复率高（大部分适配器都是 fetch → 转换 → 输出的模式）

Pipeline 通过声明式的 YAML 定义消除了这些重复工作。一个典型的数据抓取场景只需要 10-30 行 YAML，而等价的 TypeScript 代码可能需要 50-100 行。

## Pipeline 的数据流

Pipeline 维护一个核心状态变量 `data`，它贯穿整个执行过程：

```
初始状态: data = null

步骤 1: fetch → data = [29237, 29236, 29235, ...]    // 原始 ID 列表
步骤 2: limit → data = [29237, 29236, ..., 29228]     // 截取前 10 个
步骤 3: map   → data = [{id:29237}, {id:29236}, ...]  // 转换为对象
步骤 4: fetch → data = [{id, title, ...}, ...]        // 获取详情
步骤 5: map   → data = [{rank, title, score}, ...]    // 提取需要的字段

最终输出: data  →  传递给输出渲染器
```

**关键规则**：
- 每个步骤接收当前的 `data` 作为输入
- 每个步骤的返回值成为新的 `data`
- 如果 `data` 是数组，某些步骤会对每个元素执行操作（如 `map`、`fetch`）

## 步骤类型

Pipeline 的步骤处理器在 `src/pipeline/registry.ts` 中注册，支持以下 16 种内置步骤：

### 数据获取类

#### `fetch` — HTTP 请求

发起 HTTP GET 请求，获取远程数据。

```yaml
# 基本用法：获取 JSON API
- fetch:
    url: https://api.example.com/data

# 对数组中每个元素发起请求（批量）
# 当 data 是数组时，fetch 会自动对每个 item 发起请求
- fetch:
    url: ${{ 'https://api.example.com/item/' + item.id + '.json' }}
```

**fetch 的两种模式**：

| 模式 | 条件 | 行为 |
|------|------|------|
| Node.js 直连 | `browser: false` 或策略为 `PUBLIC` | 使用 Node.js `undici` 直接请求 |
| 浏览器内请求 | 需要浏览器 | 在浏览器中执行 `fetch()`，自动携带 Cookie |

**性能优化**：当 `data` 是数组且需要对每个元素发起 `fetch` 时，Pipeline 会将所有请求**批量合并为一次浏览器 `evaluate()` 调用**，而不是逐个请求。这大幅减少了 IPC（进程间通信）开销。

#### `navigate` — 页面导航

在浏览器中导航到指定 URL。

```yaml
- navigate: https://www.example.com/search?q=${{ args.keyword }}
```

### DOM 操作类

#### `click` — 点击元素

```yaml
- click: button.search
```

#### `type` — 输入文本

```yaml
- type:
    selector: input.search
    text: ${{ args.keyword }}
```

#### `press` — 按键

```yaml
- press: Enter
```

#### `wait` — 等待

```yaml
# 等待指定时间（毫秒）
- wait: 2000

# 等待元素出现
- wait:
    selector: .result-item
    timeout: 5000
```

#### `snapshot` — DOM 快照

获取当前页面的 DOM 快照，生成类似可访问性树的结构。

```yaml
- snapshot: main
```

#### `evaluate` — 执行 JavaScript

在浏览器中执行自定义 JavaScript 代码。

```yaml
- evaluate: |
    document.querySelectorAll('.item').length
```

### 数据变换类

#### `map` — 字段映射

对 `data` 数组中的每个元素进行字段提取或转换。这是最常用的步骤之一。

```yaml
# 提取需要的字段
- map:
    rank: ${{ index + 1 }}
    title: ${{ item.title }}
    score: ${{ item.score || 0 }}
    author: ${{ item.by }}
```

**模板变量**：
- `item`：当前数组元素
- `index`：当前元素的索引（从 0 开始）
- `args`：用户传入的命令行参数
- `data`：当前完整的 data 对象

#### `filter` — 过滤

保留符合条件的元素。

```yaml
# 使用布尔表达式过滤
- filter: item.title && !item.deleted && !item.dead
```

#### `sort` — 排序

```yaml
- sort:
    key: score
    order: desc
```

#### `limit` — 限制数量

截取数组的前 N 个元素。

```yaml
# 固定数量
- limit: 10

# 动态数量（使用参数）
- limit: ${{ args.limit }}
```

#### `select` — 字段选择

从每个元素中提取指定字段。

```yaml
- select: [title, url, score]
```

### 网络拦截类

#### `intercept` — 持续拦截

拦截浏览器中匹配 URL 模式的网络请求，持续收集响应数据。

```yaml
- intercept:
    pattern: /api/search
    timeout: 10000
```

#### `tap` — 单次捕获

拦截并等待第一个匹配的请求响应，然后停止拦截。

```yaml
- tap:
    pattern: /api/user/info
```

### 文件操作类

#### `download` — 文件下载

```yaml
- download:
    url: ${{ item.downloadUrl }}
    filename: ${{ item.title | sanitize }}
```

## 模板引擎

Pipeline 的模板引擎是整个系统的核心，负责解析 YAML 中 `${{ ... }}` 表达式。

### 基本语法

```yaml
# 变量引用
${{ item.title }}
${{ args.limit }}
${{ index }}

# 属性访问
${{ item.author.name }}
${{ item.stats.views }}

# 表达式
${{ index + 1 }}
${{ item.score || 0 }}
${{ Math.min(args.limit, 50) }}
```

### 管道过滤器

模板引擎支持类似 Linux 管道的过滤器语法，用 `|` 分隔：

```yaml
# 默认值
${{ item.description | default('No description') }}

# 大小写转换
${{ item.title | upper }}
${{ item.title | lower }}

# 截断
${{ item.content | truncate(100) }}

# 连接数组
${{ item.tags | join(', ') }}

# JSON 序列化
${{ item.metadata | json }}

# URL 编码
${{ item.query | urlencode }}

# 提取文件名
${{ item.url | basename }}

# 提取扩展名
${{ item.url | ext }}

# URL 友好 slug
${{ item.title | slugify }}

# 清理文件名
${{ item.title | sanitize }}
```

**完整过滤器列表**：

| 过滤器 | 用法 | 说明 |
|--------|------|------|
| `default(val)` | `${{ x \| default(0) }}` | 为 null/undefined/空字符串提供默认值 |
| `join(sep)` | `${{ x \| join(', ') }}` | 连接数组为字符串 |
| `upper` | `${{ x \| upper }}` | 转大写 |
| `lower` | `${{ x \| lower }}` | 转小写 |
| `trim` | `${{ x \| trim }}` | 去除首尾空白 |
| `truncate(n)` | `${{ x \| truncate(50) }}` | 截断过长字符串 |
| `replace(old,new)` | `${{ x \| replace(a, b) }}` | 全局替换 |
| `keys` | `${{ x \| keys }}` | 获取对象的键数组 |
| `length` | `${{ x \| length }}` | 获取数组或字符串长度 |
| `first` | `${{ x \| first }}` | 获取数组第一个元素 |
| `last` | `${{ x \| last }}` | 获取数组最后一个元素 |
| `json` | `${{ x \| json }}` | JSON 序列化 |
| `slugify` | `${{ x \| slugify }}` | 转换为 URL slug |
| `sanitize` | `${{ x \| sanitize }}` | 清理文件名非法字符 |
| `ext` | `${{ x \| ext }}` | 提取文件扩展名 |
| `basename` | `${{ x \| basename }}` | 提取文件名 |
| `urlencode` | `${{ x \| urlencode }}` | URL 编码 |
| `urldecode` | `${{ x \| urldecode }}` | URL 解码 |

### 求值机制

模板引擎的求值分为三个层次，按优先级从高到低：

```
1. 快速路径：字面量和简单路径
   ├─ 字符串字面量 → 直接返回
   ├─ 数字字面量 → Number()
   └─ 点分路径 → resolvePath() 直接查找

2. 管道过滤器：expr | filter1 | filter2
   └─ 逐级应用过滤器函数

3. VM 沙箱：兜底使用 node:vm 执行任意 JS 表达式
   ├─ 安全检查：禁止 constructor、process、require 等
   ├─ 深拷贝上下文：防止原型链攻击
   ├─ 超时限制：50ms
   └─ 编译缓存：LRU 256 条
```

**为什么有三级求值**：前两级是纯同步操作，极快。VM 沙箱虽然功能强大，但有创建上下文和编译的开销。通过缓存编译后的 `vm.Script` 对象，将重复表达式的求值开销降到最低。

### 安全模型

模板引擎在 VM 沙箱中执行用户表达式时，采取了多层防护：

1. **表达式长度限制**：超过 2000 字符的表达式直接拒绝
2. **关键字黑名单**：禁止 `constructor`、`__proto__`、`prototype`、`globalThis`、`process`、`require`、`import`、`eval`
3. **上下文深拷贝**：通过 `JSON.parse(JSON.stringify(...))` 切断原型链
4. **代码生成禁用**：`codeGeneration: { strings: false, wasm: false }`
5. **执行超时**：`timeout: 50` 毫秒
6. **沙箱白名单**：只暴露 `JSON`、`Math`、`Number`、`String`、`Boolean`、`Array`、`Date`、`encodeURIComponent`、`decodeURIComponent`

## 执行引擎

### 顺序执行

Pipeline 中的步骤按定义顺序执行，不支持并行或条件分支：

```typescript
// src/pipeline/executor.ts 核心逻辑
for (let i = 0; i < pipeline.length; i++) {
  const step = pipeline[i];
  for (const [op, params] of Object.entries(step)) {
    const handler = getStep(op);
    data = await handler(page, params, data, args);
  }
}
return data;
```

### 错误重试

浏览器相关的步骤（navigate、click、type、wait、press、snapshot、evaluate、intercept、tap）默认最多重试 2 次，其他步骤不重试。只有瞬态浏览器错误（transient browser error）才会触发重试。

```typescript
const maxRetries = BROWSER_ONLY_STEPS.has(op) ? 2 : 0;
```

重试间隔为 1 秒。如果所有重试用尽仍然失败，Pipeline 会尝试关闭自动化窗口并抛出错误。

### 调试模式

设置 `OPENCLI_DIAGNOSTIC=1` 环境变量可以启用调试输出，显示每个步骤的执行过程和结果：

```
[step 1/6] fetch → https://api.example.com/data
  → 20 items
[step 2/6] limit → 10
  → 10 items
[step 3/6] map → (rank, title, score, author, comments)
  → 10 items
```

## 完整示例

### HackerNews Top Stories

这个适配器展示了 Pipeline 的典型用法：

```yaml
site: hackernews
name: top
description: Hacker News top stories
domain: news.ycombinator.com
strategy: public
browser: false

args:
  limit:
    type: int
    default: 20
    description: Number of stories

pipeline:
  # 步骤 1：获取热门故事 ID 列表
  - fetch:
      url: https://hacker-news.firebaseio.com/v0/topstories.json
  # data = [29237, 29236, 29235, ...]

  # 步骤 2：多取一些（+10 作为 buffer），但不超过 50
  - limit: "${{ Math.min((args.limit ? args.limit : 20) + 10, 50) }}"
  # data = [29237, ..., 29228]（30 个）

  # 步骤 3：将每个 ID 转为对象
  - map:
      id: ${{ item }}
  # data = [{id: 29237}, {id: 29236}, ...]

  # 步骤 4：对每个对象获取详情（自动批量请求）
  - fetch:
      url: https://hacker-news.firebaseio.com/v0/item/${{ item.id }}.json
  # data = [{id, title, score, by, ...}, ...]

  # 步骤 5：过滤掉已删除和已死亡的帖子
  - filter: item.title && !item.deleted && !item.dead

  # 步骤 6：提取需要的字段
  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
      score: ${{ item.score }}
      author: ${{ item.by }}
      comments: ${{ item.descendants }}
      url: ${{ item.url }}

  # 步骤 7：截取到用户请求的数量
  - limit: ${{ args.limit }}

columns: [rank, title, score, author, comments]
```

### 数据流追踪

以上适配器执行 `opencli hackernews top --limit 5` 时的数据流：

```
步骤 1 fetch → [29237, 29236, 29235, 29234, 29233, 29232, 29231, 29230, ...]  (500 个 ID)
步骤 2 limit → [29237, 29236, 29235, 29234, 29233, 29232, 29231, 29230, ...]  (15 个 ID)
步骤 3 map   → [{id:29237}, {id:29236}, {id:29235}, ...]                       (15 个对象)
步骤 4 fetch → [{id:29237, title:"...", score:342, ...}, ...]                   (15 个详情)
步骤 5 filter → [{id:29237, title:"...", ...}, ...]                             (过滤后)
步骤 6 map   → [{rank:1, title:"...", score:342, author:"...", comments:87}, ...]
步骤 7 limit → [{rank:1, ...}, {rank:2, ...}, {rank:3, ...}, {rank:4, ...}, {rank:5, ...}]
```

## 扩展 Pipeline

OpenCLI 支持通过插件注册自定义 Pipeline 步骤：

```typescript
import { registerStep } from '@jackwener/opencli/pipeline';

registerStep('myCustomStep', async (page, params, data, args) => {
  // 自定义逻辑
  return transformedData;
});
```

注册后即可在 YAML 适配器中使用：

```yaml
pipeline:
  - fetch:
      url: https://api.example.com/data
  - myCustomStep:
      option1: value1
```

## 关联文档

- [架构全景](./architecture) — Pipeline 在整体架构中的位置
- [适配器策略](./adapter-strategies) — 策略如何影响 Pipeline 的 fetch 行为
- [YAML 适配器开发](../developer/yaml-adapter) — 实际编写 YAML 适配器的教程
- [浏览器模块详解](./browser-module) — 浏览器步骤的底层实现
