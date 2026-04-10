# YAML 适配器开发教程

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 YAML 适配器的结构，能修改现有适配器 |
| 进阶 | 能独立创建全新的 YAML 适配器，使用多种步骤类型 |
| 专家 | 能优化 Pipeline 性能，处理边界情况，编写健壮的适配器 |

## 前置知识

| 要求 | 说明 |
|------|------|
| YAML 基础 | 了解 YAML 的键值对、列表、字符串语法 |
| REST API 概念 | 理解 HTTP GET 请求、JSON 响应、URL 参数 |
| Pipeline 基础 | 阅读 [Pipeline 系统详解](../concepts/pipeline) 了解步骤类型 |

## 什么是 YAML 适配器

YAML 适配器是 OpenCLI 的**声明式适配器格式**。你不需要编写任何代码，只需要用 YAML 描述：
1. 命令的元信息（名称、描述、参数）
2. 数据获取的步骤序列（Pipeline）
3. 输出的列定义

与之对比，TypeScript 适配器需要编写完整的函数逻辑。YAML 适配器适用于大部分标准的数据抓取场景。

## 最小化示例

一个获取 HackerNews 用户信息的适配器：

```yaml
site: hackernews
name: user
description: Hacker News user profile
domain: news.ycombinator.com
strategy: public
browser: false

args:
  username:
    type: str
    required: true
    positional: true
    description: HN username

pipeline:
  - fetch:
      url: https://hacker-news.firebaseio.com/v0/user/${{ args.username }}.json

  - map:
      username: ${{ item.id }}
      karma: ${{ item.karma }}
      created: "${{ item.created ? new Date(item.created * 1000).toISOString().slice(0, 10) : '' }}"
      about: ${{ item.about }}

columns: [username, karma, created, about]
```

使用方式：

```bash
opencli hackernews user pgibson
```

## 完整结构详解

### 必需字段

```yaml
site: example          # 站点标识（命令前缀）
name: list             # 命令名称
description: 列出资源   # 命令描述
```

**命名规则**：
- `site` 使用小写英文，无空格
- `name` 使用小写英文，可用连字符分隔
- 最终命令为 `opencli <site> <name>`

### 策略和浏览器

```yaml
strategy: public       # 认证策略
browser: false         # 是否需要浏览器
```

| 组合 | 说明 |
|------|------|
| `strategy: public` + `browser: false` | 公开 API，无需浏览器（最快） |
| `strategy: cookie` + `browser: true`（默认） | 需要浏览器中的登录 Cookie |
| `strategy: intercept` + `browser: true` | 需要拦截浏览器网络请求 |

详细的策略选择指南参考 [适配器策略详解](../concepts/adapter-strategies)。

### 参数定义

```yaml
args:
  # 位置参数（必填）
  username:
    type: str
    required: true
    positional: true
    description: 目标用户名

  # 可选参数（有默认值）
  limit:
    type: int
    default: 20
    description: 返回结果数量

  # 选择参数（限定可选值）
  sort:
    type: str
    default: relevance
    choices: [relevance, date]
    description: 排序方式
```

**参数类型**：

| type | 说明 | 示例 |
|------|------|------|
| `str` | 字符串 | `"hello"` |
| `int` | 整数 | `20` |
| `bool` / `boolean` | 布尔值 | `true` |

**参数属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `type` | string | 参数类型 |
| `required` | boolean | 是否必填 |
| `positional` | boolean | 是否为位置参数（不需要 `--name`） |
| `default` | any | 默认值 |
| `choices` | string[] | 可选值列表 |
| `help` | string | 帮助文本 |

### Pipeline 步骤

Pipeline 是适配器的核心，定义了数据获取和处理的步骤序列。完整步骤参考见 [Pipeline 系统详解](../concepts/pipeline)。

### 输出列

```yaml
columns: [rank, title, score, author, comments]
```

定义表格输出时显示的列。列名对应 Pipeline 最终输出数据中的字段名。

## 实战：从零创建适配器

以 HackerNews 搜索功能为例，完整演示创建过程。

### 第一步：分析目标 API

HackerNews 使用 Algolia 的搜索 API：

```
GET https://hn.algolia.com/api/v1/search?query=openai&tags=story&hitsPerPage=20
```

响应格式（简化）：

```json
{
  "hits": [
    {
      "title": "OpenAI announces GPT-5",
      "points": 342,
      "author": "pgibson",
      "num_comments": 87,
      "url": "https://...",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### 第二步：定义元信息和参数

```yaml
site: hackernews
name: search
description: Search Hacker News stories
domain: news.ycombinator.com
strategy: public
browser: false

args:
  query:
    type: str
    required: true
    positional: true
    description: Search query
  limit:
    type: int
    default: 20
    description: Number of results
  sort:
    type: str
    default: relevance
    choices: [relevance, date]
    description: Sort by relevance or date
```

### 第三步：编写 Pipeline

```yaml
pipeline:
  # 步骤 1：发起搜索请求
  # 注意 URL 中使用了条件表达式来选择 API 端点
  - fetch:
      url: "https://hn.algolia.com/api/v1/${{ args.sort === 'date' ? 'search_by_date' : 'search' }}"
      params:
        query: ${{ args.query }}
        tags: story
        hitsPerPage: ${{ args.limit }}

  # 步骤 2：从响应中提取 hits 数组
  - select: hits

  # 步骤 3：映射为统一格式
  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
      score: ${{ item.points }}
      author: ${{ item.author }}
      comments: ${{ item.num_comments }}
      url: ${{ item.url }}

  # 步骤 4：限制输出数量
  - limit: ${{ args.limit }}

columns: [rank, title, score, author, comments, url]
```

### 第四步：测试

将 YAML 文件保存到 `~/.opencli/clis/hackernews/search.yaml`（内置适配器目录）或 `~/.opencli/clis/hackernews/search.yaml`（用户适配器目录），然后运行：

```bash
# 基本搜索
opencli hackernews search openai

# 按日期排序
opencli hackernews search openai --sort date

# 限制结果数量
opencli hackernews search openai --limit 5
```

## fetch 步骤详解

`fetch` 是最常用的步骤，有两种用法：

### 单次请求

```yaml
- fetch:
    url: https://api.example.com/data
```

当 `data` 为 `null` 或非数组时，发起单个请求，结果成为新的 `data`。

### 批量请求（数组遍历）

```yaml
# 先获取 ID 列表
- fetch:
    url: https://api.example.com/ids
# data = [1, 2, 3, 4, 5]

# 对每个元素发起请求
- fetch:
    url: https://api.example.com/item/${{ item }}.json
# data = [{detail1}, {detail2}, ...]
```

当 `data` 是数组时，`fetch` 自动对每个元素发起请求。`${{ item }}` 引用当前元素。

**性能提示**：当需要浏览器的批量 fetch 时，Pipeline 会将所有请求合并为一次 `evaluate()` 调用，大幅减少 IPC 开销。

### 带参数的请求

```yaml
- fetch:
    url: https://api.example.com/search
    params:
      q: ${{ args.query }}
      limit: ${{ args.limit }}
      page: 1
```

`params` 会被编码为 URL 查询字符串。

## 模板表达式

Pipeline 中的 `${{ ... }}` 是模板表达式，支持以下变量和操作：

### 变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `item` | object | 当前遍历的数组元素 |
| `index` | number | 当前元素的索引（从 0 开始） |
| `args` | object | 用户传入的命令行参数 |
| `data` | any | 当前完整的 data 值 |

### 属性访问

```yaml
${{ item.title }}            # 简单属性
${{ item.author.name }}      # 嵌套属性
${{ item.stats.views }}      # 深层嵌套
```

### 表达式

```yaml
${{ index + 1 }}                         # 算术运算
${{ item.score || 0 }}                   # 默认值
${{ Math.min(args.limit, 50) }}          # 数学函数
${{ args.sort === 'date' ? 'b' : 'a' }}  # 条件表达式
```

### 管道过滤器

```yaml
${{ item.title | truncate(50) }}        # 截断
${{ item.description | default('N/A') }} # 默认值
${{ item.tags | join(', ') }}            # 连接数组
${{ item.title | upper }}                # 大写
${{ item.url | basename }}              # 提取文件名
```

完整过滤器列表参考 [Pipeline 系统详解](../concepts/pipeline#管道过滤器)。

## 常见模式

### 模式一：获取列表 → 获取详情

```yaml
pipeline:
  - fetch:
      url: https://api.example.com/list
  - limit: ${{ args.limit }}
  - map:
      id: ${{ item }}
  - fetch:
      url: https://api.example.com/detail/${{ item.id }}
  - map:
      title: ${{ item.title }}
      content: ${{ item.body }}
```

### 模式二：搜索 → 过滤 → 格式化

```yaml
pipeline:
  - fetch:
      url: https://api.example.com/search
      params:
        q: ${{ args.query }}
  - select: results
  - filter: item.active && item.score > 0
  - map:
      rank: ${{ index + 1 }}
      name: ${{ item.name }}
      score: ${{ item.score }}
  - limit: ${{ args.limit }}
```

### 模式三：多字段合并

```yaml
pipeline:
  - fetch:
      url: https://api.example.com/data
  - map:
      title: ${{ item.title }}
      url: ${{ 'https://example.com/post/' + item.slug }}
      date: "${{ new Date(item.created_at).toLocaleDateString() }}"
      author: ${{ item.user.name | default('Anonymous') }}
```

## 调试技巧

### 启用诊断模式

```bash
OPENCLI_DIAGNOSTIC=1 opencli hackernews search test
```

诊断模式会显示每个 Pipeline 步骤的执行过程：

```
[step 1/4] fetch → https://hn.algolia.com/api/v1/search?query=test...
  → 20 items
[step 2/4] select → hits
  → 20 items
[step 3/4] map → (rank, title, score, author, comments, url)
  → 20 items
[step 4/4] limit → 20
  → 20 items
```

### 查看 JSON 原始数据

```bash
# 输出 JSON 格式查看原始数据结构
opencli hackernews search test --format json | jq '.[0]'
```

### 分步验证

如果 Pipeline 失败，可以创建一个只包含前几步的简化版本来定位问题：

```yaml
# 只测试 fetch 步骤
pipeline:
  - fetch:
      url: https://api.example.com/data
```

## 文件位置

| 类型 | 路径 |
|------|------|
| 内置适配器 | `clis/<site>/<name>.yaml` |
| 用户适配器 | `~/.opencli/clis/<site>/<name>.yaml` |
| 插件适配器 | `~/.opencli/plugins/<plugin>/clis/<site>/<name>.yaml` |

内置适配器在安装时会被复制到 `~/.opencli/clis/`。用户自定义的适配器应放在 `~/.opencli/clis/` 下。

## 何时使用 YAML vs TypeScript

| 场景 | 推荐 |
|------|------|
| 调用公开 REST API | YAML |
| 需要登录但 API 简单 | YAML（`strategy: cookie`） |
| API 有复杂签名算法 | TypeScript |
| 需要复杂的状态管理 | TypeScript |
| 需要多步 DOM 交互 | TypeScript |
| SPA 应用数据拦截 | TypeScript（`strategy: intercept`） |

如果 YAML 能满足需求，优先使用 YAML。只有当 YAML 的声明式能力不够时才使用 TypeScript。

## 常见问题

### YAML 文件没有被识别

确认文件名格式为 `<name>.yaml`，位于正确的 `<site>/` 子目录下。运行 `opencli <site> --help` 检查命令是否被注册。

### Pipeline 步骤报 "Unknown pipeline step"

检查步骤名称是否正确拼写。支持的步骤列表参考 [Pipeline 系统详解](../concepts/pipeline#步骤类型)。如果使用了自定义步骤，确认对应的插件已安装。

### fetch 返回空数据

1. 检查 API URL 是否正确
2. 使用 `--format json` 查看原始响应
3. 如果是带参数的 fetch，确认参数名和格式与 API 文档一致
4. 确认 API 不需要认证（或已正确设置策略）

## 下一步

- [TypeScript 适配器开发](./ts-adapter) — 当 YAML 不够用时，学习用 TS 编写复杂适配器
- [Pipeline 系统详解](../concepts/pipeline) — 深入理解模板引擎和所有步骤类型
- [适配器策略详解](../concepts/adapter-strategies) — 选择正确的策略
- [参与贡献](./contributing) — 将你的适配器贡献给项目
