# TypeScript 适配器开发教程

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 TypeScript 适配器的结构，能修改现有适配器 |
| 进阶 | 能独立创建带认证和复杂逻辑的适配器 |
| 专家 | 能编写可复用的工具模块，处理边界情况，优化性能 |

## 前置知识

| 要求 | 说明 |
|------|------|
| TypeScript 基础 | 了解类型注解、异步函数、模块导入 |
| OpenCLI 架构 | 阅读 [架构全景](../concepts/architecture) 了解核心概念 |
| 适配器策略 | 阅读 [适配器策略详解](../concepts/adapter-strategies) 了解策略选择 |

## 为什么需要 TypeScript 适配器

YAML 适配器适用于标准的数据抓取场景，但以下情况需要 TypeScript：

| 场景 | 原因 |
|------|------|
| API 有复杂签名算法 | 如 Bilibili 的 WBI 签名，需要 MD5、密钥变换等逻辑 |
| 多步 DOM 交互 | 需要根据前一步的结果决定下一步操作 |
| 复杂状态管理 | 需要维护跨请求的状态（如分页 token、游标） |
| SPA 数据拦截 | 需要 `intercept` 或 `tap` 配合页面交互 |
| 数据后处理 | 需要复杂的 JavaScript 逻辑来转换数据 |

## 最小化示例

```typescript
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'example',
  name: 'list',
  description: 'List items from example.com',
  strategy: Strategy.COOKIE,
  domain: 'www.example.com',
  args: [
    { name: 'limit', type: 'int', default: 20, help: 'Number of results' },
  ],
  columns: ['rank', 'title', 'url'],
  func: async (page, kwargs) => {
    const { limit = 20 } = kwargs;

    // 在浏览器中执行 fetch，自动携带 Cookie
    const data = await page.evaluate(`
      async () => {
        const res = await fetch('https://www.example.com/api/items?limit=${limit}', {
          credentials: 'include'
        });
        return await res.json();
      }
    `);

    return data.items.map((item: any, i: number) => ({
      rank: i + 1,
      title: item.title,
      url: item.url,
    }));
  },
});
```

## 核心 API

### `cli()` — 注册命令

```typescript
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  // 必需字段
  site: string,              // 站点名
  name: string,              // 命令名

  // 可选字段
  description: string,       // 命令描述
  strategy: Strategy,        // 认证策略
  browser: boolean,          // 是否需要浏览器
  domain: string,            // 目标域名（用于预导航）
  args: Arg[],               // 参数定义
  columns: string[],         // 输出列定义
  func: async (page, kwargs) => any[],  // 执行函数
  timeoutSeconds: number,    // 超时时间（秒）
  navigateBefore: boolean | string,  // 预导航配置
  defaultFormat: string,     // 默认输出格式
  deprecated: boolean | string,      // 废弃标记
  replacedBy: string,        // 替代命令
});
```

### `func(page, kwargs)` — 执行函数

这是适配器的核心逻辑。它接收两个参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | `IPage` | 浏览器页面操作接口（仅浏览器模式可用） |
| `kwargs` | `Record<string, any>` | 用户传入的命令行参数（已校验和类型转换） |

返回值应该是数组或对象，会被输出渲染器格式化。

### `IPage` API

`IPage` 是操作浏览器的核心接口，定义在 `src/types.ts` 中。

#### 数据获取

```typescript
// 在浏览器中执行 JavaScript
const result = await page.evaluate(`
  async () => {
    const res = await fetch('https://api.example.com/data', {
      credentials: 'include'
    });
    return await res.json();
  }
`);

// 等价于传入函数（会自动序列化）
const result = await page.evaluate(async () => {
  const res = await fetch('https://api.example.com/data', {
    credentials: 'include'
  });
  return await res.json();
});
```

#### DOM 操作

```typescript
// 点击元素
await page.click('[6]');          // 通过快照索引
await page.click('button.search'); // 通过 CSS 选择器

// 输入文本
await page.type('[7]', 'hello');

// 按键
await page.press('Enter');

// 滚动
await page.scroll('down');

// 等待元素
await page.wait('.result-item', 5000);
```

#### 导航

```typescript
// 导航到 URL
await page.navigate('https://www.example.com/search');
```

#### 网络拦截

```typescript
// 安装拦截器
await page.intercept('/api/search');

// 触发页面操作（如点击搜索按钮）
await page.click('button.search');
await page.wait(2000);

// 读取拦截到的数据
const data = await page.readIntercepted();
```

#### 截图

```typescript
const screenshot = await page.screenshot();
// screenshot 是 base64 编码的 PNG
```

#### Cookie

```typescript
const cookies = await page.cookies('https://www.example.com');
```

### `Arg` — 参数定义

```typescript
interface Arg {
  name: string;           // 参数名（命令行 --name）
  type?: string;          // 类型：'str' | 'int' | 'bool'
  default?: unknown;      // 默认值
  required?: boolean;     // 是否必填
  positional?: boolean;   // 是否为位置参数
  help?: string;          // 帮助文本
  choices?: string[];     // 可选值列表
}
```

### 策略枚举

```typescript
import { Strategy } from '@jackwener/opencli/registry';

Strategy.PUBLIC     // 公开 API，不需要浏览器
Strategy.COOKIE     // 需要浏览器的 Cookie
Strategy.HEADER     // 需要自定义请求头
Strategy.INTERCEPT  // 需要拦截网络请求
Strategy.UI         // 纯 DOM 操作
```

### 错误类型

```typescript
import {
  AuthRequiredError,      // 需要登录
  EmptyResultError,       // 空结果
  TimeoutError,           // 超时
  SelectorError,          // 选择器失败
  ArgumentError,          // 参数错误
  BrowserConnectError,    // 浏览器连接失败
  AdapterLoadError,       // 适配器加载失败
  CommandExecutionError,  // 命令执行错误
  ConfigError,            // 配置错误
} from '@jackwener/opencli/errors';
```

## 实战：Bilibili Feed 适配器

以 Bilibili 的关注动态适配器为例，展示完整的 TypeScript 适配器开发流程。

### 分析需求

1. Bilibili 的动态 API（`/x/polymer/web-dynamic/v1/feed/all`）需要登录
2. API 返回的数据结构嵌套较深，需要提取不同类型的动态内容
3. 需要 COOKIE 策略在浏览器中发起请求

### 创建工具模块

`utils.ts` — 封装共用的 API 调用逻辑：

```typescript
import type { IPage } from '@jackwener/opencli/types';
import { AuthRequiredError } from '@jackwener/opencli/errors';

// 在浏览器中发起带 Cookie 的 JSON 请求
export async function fetchJson(page: IPage, url: string): Promise<any> {
  const urlJs = JSON.stringify(url);
  return page.evaluate(`
    async () => {
      const res = await fetch(${urlJs}, { credentials: "include" });
      return await res.json();
    }
  `);
}

// 封装 API GET 请求
export async function apiGet(
  page: IPage,
  path: string,
  opts: { params?: Record<string, any> } = {},
): Promise<any> {
  const baseUrl = 'https://api.bilibili.com';
  const params = opts.params ?? {};
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
  const url = `${baseUrl}${path}?${qs}`;
  return fetchJson(page, url);
}

// 获取当前登录用户的 UID
export async function getSelfUid(page: IPage): Promise<string> {
  const nav = await page.evaluate(`
    async () => {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        credentials: 'include'
      });
      return await res.json();
    }
  `);
  const mid = nav?.data?.mid;
  if (!mid) throw new AuthRequiredError('bilibili.com');
  return String(mid);
}

// 清理 HTML 标签
export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

// 提取 payload 中的 data 字段
export function payloadData(payload: any): any {
  return payload?.data ?? payload;
}
```

### 创建适配器

`feed.ts` — 关注动态适配器：

```typescript
import { cli, Strategy } from '@jackwener/opencli/registry';
import { apiGet, payloadData, stripHtml } from './utils.js';

cli({
  site: 'bilibili',
  name: 'feed',
  description: '关注的人的动态时间线',
  domain: 'www.bilibili.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'limit', type: 'int', default: 20, help: 'Number of results' },
    { name: 'type', default: 'all', help: 'Filter: all, video, article' },
  ],
  columns: ['rank', 'author', 'title', 'type', 'url'],
  func: async (page, kwargs) => {
    const { limit = 20, type = 'all' } = kwargs;

    // 调用 Bilibili 动态 API
    const payload = await apiGet(page, '/x/polymer/web-dynamic/v1/feed/all', {
      params: {
        timezone_offset: -480,
        type: type === 'video' ? 'video' : type === 'article' ? 'article' : 'all',
        page: 1,
      },
    });

    const items: any[] = payloadData(payload)?.items ?? [];
    const rows: any[] = [];

    for (let i = 0; i < Math.min(items.length, Number(limit)); i++) {
      const item = items[i];
      const modules = item.modules ?? {};
      const authorModule = modules.module_author ?? {};
      const dynamicModule = modules.module_dynamic ?? {};
      const major = dynamicModule.major ?? {};

      let title = '';
      let url = '';
      let itemType = '';

      // 不同类型的动态有不同的数据结构
      if (major.archive) {
        title = major.archive.title ?? '';
        url = major.archive.jump_url ? `https:${major.archive.jump_url}` : '';
        itemType = 'video';
      } else if (major.article) {
        title = major.article.title ?? '';
        url = major.article.jump_url ? `https:${major.article.jump_url}` : '';
        itemType = 'article';
      } else if (dynamicModule.desc) {
        title = stripHtml(dynamicModule.desc.text ?? '').slice(0, 60);
        url = item.id_str ? `https://t.bilibili.com/${item.id_str}` : '';
        itemType = 'dynamic';
      }

      if (!title) continue;

      rows.push({
        rank: rows.length + 1,
        author: authorModule.name ?? '',
        title,
        type: itemType,
        url,
      });
    }

    return rows;
  },
});
```

### 关键模式解析

#### 模式一：在浏览器中 fetch

```typescript
// page.evaluate() 中的代码在浏览器中执行
// credentials: 'include' 确保携带 Cookie
const data = await page.evaluate(`
  async () => {
    const res = await fetch('https://api.bilibili.com/...', {
      credentials: 'include'
    });
    return await res.json();
  }
`);
```

**为什么用 `page.evaluate()` 而不是 Node.js 的 `fetch()`**：
- 浏览器自动管理 Cookie（域、路径、过期时间）
- 浏览器执行在目标域的上下文中，满足 CORS 要求
- 不需要手动提取和传递 Cookie

#### 模式二：登录状态检测

```typescript
// 检查用户是否已登录
const nav = await page.evaluate(`
  async () => {
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      credentials: 'include'
    });
    return await res.json();
  }
`);

if (!nav?.data?.mid) {
  throw new AuthRequiredError('bilibili.com');
  // 错误消息：Not logged in to bilibili.com
  // 提示：Please open Chrome and log in to https://www.bilibili.com
}
```

使用 `AuthRequiredError` 可以生成友好的提示，引导用户登录。

#### 模式三：工具模块复用

同一站点的多个适配器通常共享 API 调用逻辑。最佳实践是创建 `utils.ts` 文件：

```
clis/bilibili/
  ├── utils.ts      # 共享工具函数
  ├── feed.ts       # 动态列表
  ├── search.ts     # 搜索
  ├── user.ts       # 用户信息
  └── ...           # 其他适配器
```

## WBI 签名模式

某些网站（如 Bilibili）使用动态签名算法保护 API。OpenCLI 的解决方案是在浏览器中直接执行签名逻辑：

```typescript
async function wbiSign(page: IPage, params: Record<string, any>): Promise<Record<string, string>> {
  // 从浏览器获取签名密钥
  const nav = await page.evaluate(`
    async () => {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        credentials: 'include'
      });
      return await res.json();
    }
  `);

  const imgKey = (nav?.data?.wbi_img?.img_url ?? '').split('/').pop().split('.')[0];
  const subKey = (nav?.data?.wbi_img?.sub_url ?? '').split('/').pop().split('.')[0];

  // 计算签名...
  const mixinKey = getMixinKey(imgKey, subKey);
  const wts = Math.floor(Date.now() / 1000);
  // ...签名算法
}
```

**为什么在浏览器中获取签名密钥**：
- 签名密钥可能定期更新
- 浏览器可以获取到最新密钥而无需硬编码
- 签名逻辑与网站保持同步

## Intercept 策略模式

对于 SPA 应用，使用 intercept 策略拦截网络请求：

```typescript
cli({
  site: 'twitter',
  name: 'search',
  strategy: Strategy.INTERCEPT,
  domain: 'x.com',
  func: async (page, kwargs) => {
    // 1. 安装拦截器
    await page.intercept('/SearchTimeline');

    // 2. 触发搜索（通过 DOM 操作或 SPA 路由）
    await page.navigate('https://x.com/search?q=' + encodeURIComponent(kwargs.query));

    // 3. 等待拦截到数据
    await page.wait(3000);
    const data = await page.readIntercepted();

    // 4. 处理拦截到的数据
    return data.map(item => ({
      title: item.content?.itemContent?.full_text ?? '',
      // ...
    }));
  },
});
```

## 最佳实践

### 1. 参数命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 位置参数 | 名词 | `username`、`keyword`、`uid` |
| 可选参数 | 描述性 | `--limit`、`--sort`、`--format` |

### 2. 错误处理

```typescript
// 好的做法：使用类型化错误
if (!data) {
  throw new EmptyResultError('bilibili feed', 'You may not follow anyone yet.');
}

// 避免：抛出通用 Error
// throw new Error('No data');  // 不利于用户排查
```

### 3. 输出列设计

```typescript
// 列名使用 snake_case 或 camelCase（保持同一站点内一致）
columns: ['rank', 'title', 'author', 'score', 'comments']

// 包含 rank 列方便用户定位
rows.push({ rank: i + 1, ... });
```

### 4. 超时设置

对于可能较慢的操作，设置合理的超时：

```typescript
cli({
  // ...
  timeoutSeconds: 30,  // 默认超时 30 秒
});
```

### 5. 废弃标记

当命令被替代时，标记为废弃：

```typescript
cli({
  // ...
  deprecated: 'Use `opencli bilibili search` instead.',
  replacedBy: 'bilibili/search',
});
```

## 文件位置与导入

### 目录结构

```
clis/<site>/
  ├── utils.ts        # 共享工具模块
  ├── <command>.ts    # 各个命令
  └── <command>.yaml  # 也可以混用 YAML
```

### 导入路径

```typescript
// 核心模块
import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';

// 同站点的工具模块
import { apiGet, fetchJson } from './utils.js';
```

**注意**：导入同目录的模块使用 `.js` 扩展名（Node.js ESM 要求），即使源文件是 `.ts`。

### 编译

TypeScript 适配器在项目构建时自动编译：

```bash
npm run build
```

构建过程：
1. `tsc` 编译所有 `clis/**/*.ts` 和 `src/**/*.ts`
2. `copy-yaml` 复制 YAML 文件到 `dist/`
3. `build-manifest` 生成 `cli-manifest.json` 用于快速发现

## 常见问题

### `Cannot find module '@jackwener/opencli/registry'`

这是路径解析问题。OpenCLI 在安装时会创建一个符号链接 `~/.opencli/node_modules/@jackwener/opencli` 指向安装目录。如果链接丢失，运行：

```bash
npm install -g @jackwener/opencli
```

### `func` 中的 `this` 指向什么

`func` 是普通的箭头函数，`this` 不指向任何对象。所有操作通过 `page` 参数完成。

### TypeScript 严格模式

项目使用 TypeScript 严格模式。适配器中可以使用 `any` 类型处理来自 API 的非结构化数据，但应尽量为输出数据定义类型。

## 下一步

- [YAML 适配器开发](./yaml-adapter) — 对于简单场景，YAML 可能就足够了
- [插件开发](./plugin-development) — 将适配器打包为可分发的插件
- [参与贡献](./contributing) — 将适配器贡献给 OpenCLI 项目
- [核心源码分析](../source/core-source) — 深入理解 `cli()` 和 `func` 的底层机制
