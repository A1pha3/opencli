# 核心源码分析

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解每个源文件的角色和职责 |
| 进阶 | 能跟踪一个命令从输入到输出的完整代码路径 |
| 专家 | 能评估代码架构的优缺点，参与核心模块的改进 |

## 源码概览

```
src/
  main.ts               # 入口点
  cli.ts                # Commander 启动
  registry.ts           # 命令注册表
  discovery.ts          # 适配器发现
  commanderAdapter.ts   # Commander 桥接
  execution.ts          # 命令执行调度
  output.ts             # 输出渲染
  errors.ts             # 错误类型定义
  hooks.ts              # 生命周期钩子
  capabilityRouting.ts  # 浏览器会话决策
  daemon.ts             # Daemon 守护进程
  interceptor.ts        # 网络拦截器
  electron-apps.ts      # Electron 应用注册表
  diagnostic.ts         # 诊断信息收集
  completion.ts         # Shell 补全
  logger.ts             # 日志系统
  constants.ts          # 常量定义
  runtime.ts            # 运行时工具
  update-check.ts       # 更新检查
  browser/              # 浏览器模块
    bridge.ts           # BrowserBridge
    page.ts             # Page 实现
    base-page.ts        # Page 抽象基类
    cdp.ts              # CDP 直连
    daemon-client.ts    # Daemon HTTP 客户端
    dom-snapshot.ts     # DOM 快照生成
    dom-helpers.ts      # DOM 操作 JS 生成
    stealth.ts          # 反检测 JS 生成
    errors.ts           # 浏览器错误类型
  pipeline/             # Pipeline 执行引擎
    registry.ts         # 步骤注册表
    executor.ts         # 步骤执行器
    template.ts         # 模板引擎
    index.ts            # Pipeline 入口
    steps/              # 各步骤实现
      browser.ts        # DOM 操作步骤
      fetch.ts          # HTTP 请求步骤
      transform.ts      # 数据变换步骤
      intercept.ts      # 网络拦截步骤
      tap.ts            # 单次捕获步骤
      download.ts       # 文件下载步骤
```

## 入口点：main.ts

`main.ts` 是整个 CLI 的入口点，负责启动初始化和命令路由。

```typescript
// 启动序列（按顺序执行）
await ensureUserCliCompatShims();  // 1. 创建模块兼容符号链接
await ensureUserAdapters();         // 2. 首次运行复制内置适配器
await discoverClis(BUILTIN_CLIS, USER_CLIS);  // 3. 发现并注册适配器
await discoverPlugins();            // 4. 发现并注册插件

// Shell 补全快速路径（在 Commander 解析前处理）
if (process.argv.includes('--get-completions')) {
  // 直接输出补全结果并退出，避免 Commander 初始化开销
  process.exit(0);
}

await emitHook('onStartup', ...);  // 5. 触发启动钩子
runCli(BUILTIN_CLIS, USER_CLIS);   // 6. 启动 Commander
```

**关键设计决策**：

1. **PATH 补全**：在模块导入之前，确保标准系统路径（`/usr/local/bin` 等）在 `PATH` 中。这解决了 GUI 应用终端、cron 等环境中 PATH 不完整的问题。

2. **补全快速路径**：`--get-completions` 在 Commander 解析之前处理。Shell 补全是高频操作（每次按 Tab 都会触发），直接从注册表生成补全列表比完整的 Commander 初始化快得多。

3. **更新检查异步化**：`checkForUpdateBackground()` 是非阻塞的，不会影响命令执行速度。

## 命令注册表：registry.ts

注册表是全局共享的数据结构，存储在 `globalThis.__opencli_registry__` 中。

### 为什么使用 globalThis

```typescript
// 使用 globalThis 而非模块级变量
declare global {
  var __opencli_registry__: Map<string, CliCommand> | undefined;
}
const _registry: Map<string, CliCommand> =
  globalThis.__opencli_registry__ ??= new Map<string, CliCommand>();
```

在 npm link 或 monorepo 场景中，一个包可能有多个模块副本。如果注册表是模块级变量，每个副本会有自己的 Map，导致注册的命令互相不可见。`globalThis` 确保所有模块副本共享同一个注册表。

### `cli()` 函数

`cli()` 是每个适配器调用的注册函数，负责参数默认化和命令注册：

```typescript
export function cli(opts: CliOptions): CliCommand {
  // 策略推导：未指定 browser: false 时默认 COOKIE
  const strategy = opts.strategy ?? (opts.browser === false ? Strategy.PUBLIC : Strategy.COOKIE);
  // 浏览器需求推导：非 PUBLIC 策略需要浏览器
  const browser = opts.browser ?? (strategy !== Strategy.PUBLIC);

  const cmd: CliCommand = {
    site: opts.site,
    name: opts.name,
    strategy,
    browser,
    // ...其他字段
  };

  registerCommand(cmd);  // 注册到全局 Map
  return cmd;
}
```

**推导逻辑的意义**：大部分适配器只需要指定 `site`、`name` 和 `func`，策略和浏览器需求会自动推导。这降低了适配器开发的认知负担。

### 命令键和别名

注册表使用 `site/name` 作为键，支持别名：

```typescript
function registerCommand(cmd: CliCommand): void {
  const canonicalKey = fullName(cmd);  // "bilibili/feed"
  _registry.set(canonicalKey, cmd);

  // 注册别名（如果有）
  for (const alias of aliases) {
    _registry.set(`${cmd.site}/${alias}`, cmd);  // "bilibili/f"
  }
}
```

同一个 `CliCommand` 对象可能对应多个键（规范名 + 别名），但它们指向同一个对象。

## 适配器发现：discovery.ts

发现机制在启动时找到所有可用的适配器。它有两条路径：

### 快速路径（Manifest）

```typescript
// 编译时生成的 manifest 文件
const manifest = JSON.parse(fs.readFileSync('cli-manifest.json', 'utf-8'));

for (const entry of manifest) {
  if (entry.type === 'yaml') {
    // YAML 适配器：直接内联，无需额外 I/O
    cli(entry.options);
  } else if (entry.type === 'ts') {
    // TS 适配器：注册为懒加载桩
    registerLazyCommand(entry);
  }
}
```

**懒加载的设计理由**：TypeScript 适配器通常有大量 `import` 和初始化逻辑。如果启动时加载所有 80+ 个适配器，冷启动时间会从毫秒级膨胀到秒级。懒加载只在命令实际执行时才导入模块。

### 回退路径（文件系统扫描）

当 manifest 不可用时（如开发模式），扫描文件系统：

```typescript
// 扫描适配器目录
for (const file of fs.readdir(dir)) {
  if (file.endsWith('.yaml')) {
    const yaml = parseYaml(fs.readFileSync(file));
    cli(yaml);
  } else if (file.endsWith('.ts') || file.endsWith('.js')) {
    // 检查文件是否包含 cli() 调用
    const content = fs.readFileSync(file, 'utf-8');
    if (/cli\s*\(/.test(content)) {
      registerLazyCommand(file);
    }
  }
}
```

**正则检查的作用**：适配器目录中可能有工具模块（如 `utils.ts`），它们不包含 `cli()` 调用。通过正则预检，避免将非适配器文件误注册为命令。

## 命令执行：execution.ts

`execution.ts` 是命令执行的总调度器，串联了参数校验、浏览器会话、适配器调用的完整流程。

### 核心流程

```typescript
async function executeCommand(cmd: CliCommand, kwargs: CommandArgs) {
  // 1. 参数校验和类型转换
  kwargs = coerceAndValidateArgs(cmd.args, kwargs);

  // 2. 决定是否需要浏览器
  const needBrowser = shouldUseBrowserSession(cmd);

  // 3. 创建浏览器会话（如果需要）
  const page = needBrowser ? await browserSession(cmd) : null;

  // 4. 预导航（对于 COOKIE/HEADER 策略）
  if (page && cmd.navigateBefore !== false && cmd.domain) {
    await page.navigate(`https://${cmd.domain}`);
  }

  // 5. 懒加载 TS 模块
  if (cmd._lazy) {
    const module = await import(cmd._modulePath);
    // 模块导入时 cli() 调用会更新注册表
  }

  // 6. 执行适配器逻辑
  const result = await runWithTimeout(async () => {
    if (cmd.func) {
      return cmd.func(page, kwargs, debug);
    } else if (cmd.pipeline) {
      return executePipeline(page, cmd.pipeline, { args: kwargs });
    }
  }, timeout);

  return result;
}
```

### 参数校验

`coerceAndValidateArgs()` 负责类型转换和校验：

```typescript
export function coerceAndValidateArgs(cmdArgs: Arg[], kwargs: CommandArgs) {
  for (const argDef of cmdArgs) {
    // 检查必填参数
    if (argDef.required && !kwargs[argDef.name]) {
      throw new ArgumentError(`Argument "${argDef.name}" is required.`);
    }

    // 类型转换
    if (argDef.type === 'int') {
      kwargs[argDef.name] = Number(kwargs[argDef.name]);
    } else if (argDef.type === 'boolean') {
      kwargs[argDef.name] = ['true', '1'].includes(String(kwargs[argDef.name]).toLowerCase());
    }

    // 选择值校验
    if (argDef.choices && !argDef.choices.includes(String(kwargs[argDef.name]))) {
      throw new ArgumentError(`Invalid value for "${argDef.name}"`);
    }
  }
}
```

## Commander 桥接：commanderAdapter.ts

`commanderAdapter.ts` 将注册表中的命令注册到 Commander.js 框架：

```typescript
function registerAllCommands(program: Command) {
  // 按 site 分组
  const sites = new Map<string, CliCommand[]>();
  for (const cmd of getRegistry().values()) {
    // 去重（别名指向同一个 cmd 对象）
    const list = sites.get(cmd.site) ?? [];
    if (!list.includes(cmd)) list.push(cmd);
    sites.set(cmd.site, list);
  }

  // 为每个 site 创建子命令
  for (const [site, commands] of sites) {
    const siteCmd = program.command(site);
    for (const cmd of commands) {
      registerCommandToProgram(siteCmd, cmd);
    }
  }
}
```

**去重的必要性**：因为别名机制，同一个 `CliCommand` 可能通过多个键存在于注册表中。按 `site` 分组时需要去重，避免同一个命令被注册两次。

## Pipeline 执行器：pipeline/executor.ts

Pipeline 执行器按顺序执行步骤，通过 `data` 变量串联：

```typescript
async function executePipeline(
  page: IPage | null,
  pipeline: unknown[],
  ctx: PipelineContext,
): Promise<unknown> {
  let data: unknown = null;

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    for (const [op, params] of Object.entries(step)) {
      const handler = getStep(op);
      if (!handler) {
        throw new ConfigError(`Unknown pipeline step "${op}"`);
      }
      data = await executeStepWithRetry(handler, page, params, data, args, op, ctx);
    }
  }

  return data;
}
```

### 重试机制

只有浏览器相关步骤会重试：

```typescript
async function executeStepWithRetry(handler, page, params, data, args, op, retries) {
  const maxRetries = retries ?? (BROWSER_ONLY_STEPS.has(op) ? 2 : 0);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await handler(page, params, data, args);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      if (!isTransientBrowserError(err)) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
```

重试的条件：
1. 是浏览器相关步骤（navigate、click、type 等）
2. 错误是瞬态错误（不是配置错误或参数错误）
3. 还有重试次数剩余

### 失败清理

如果 Pipeline 执行失败，会尝试关闭自动化窗口：

```typescript
try {
  // 执行步骤...
} catch (err) {
  if (page?.closeWindow) {
    try { await page.closeWindow(); } catch { /* ignore */ }
  }
  throw err;
}
```

## 输出渲染：output.ts

输出渲染器支持 6 种格式，根据环境和参数选择：

```typescript
function renderOutput(data: unknown[], format: string) {
  switch (format) {
    case 'table':    return renderTable(data);     // cli-table3
    case 'json':     return JSON.stringify(data);
    case 'yaml':     return YAML.stringify(data);
    case 'csv':      return renderCSV(data);
    case 'markdown': return renderMarkdown(data);
    case 'plain':    return renderPlain(data);
  }
}
```

**TTY 感知**：当标准输出不是终端（如管道 `|` 或重定向 `>`）时，默认降级为 YAML 格式。这确保管道消费方总能得到可解析的数据。

## 生命周期钩子：hooks.ts

OpenCLI 支持三个生命周期钩子，允许插件在命令执行前后执行自定义逻辑：

```typescript
type HookName = 'onStartup' | 'onBeforeExecute' | 'onAfterExecute';
```

钩子同样使用 `globalThis` 存储，确保跨模块共享：

```typescript
declare global {
  var __opencli_hooks__: Map<string, Function[]> | undefined;
}
```

插件通过 `onStartup` 可以在 CLI 启动时执行初始化，通过 `onBeforeExecute` / `onAfterExecute` 可以在命令执行前后插入自定义逻辑（如日志、指标收集）。

## Electron 应用注册表：electron-apps.ts

注册了支持 CDP 直连的 Electron 应用：

```typescript
const ELECTRON_APPS = {
  cursor:     { cdpPort: 3000, processName: 'Cursor' },
  codex:      { cdpPort: 3000, processName: 'codex' },
  chatwise:   { cdpPort: 3000, processName: 'ChatWise' },
  notion:     { cdpPort: 2121, processName: 'Notion' },
  discord:    { cdpPort: 41884, processName: 'Discord' },
  doubao:     { cdpPort: 41884, processName: 'Doubao' },
  chatgpt:    { cdpPort: 41884, processName: 'ChatGPT' },
  antigravity:{ cdpPort: 41884, processName: 'Antigravity' },
};
```

每个应用有：
- **cdpPort**：CDP 监听端口（应用需要以 `--remote-debugging-port` 参数启动）
- **processName**：进程名（用于检测应用是否在运行）

## 数据流总结

以 `opencli hackernews top --limit 5` 为例的完整代码路径：

```
main.ts
  │
  ├─ ensureUserCliCompatShims()    → 创建 ~/.opencli/node_modules 符号链接
  ├─ ensureUserAdapters()           → 复制内置适配器到 ~/.opencli/clis/
  ├─ discoverClis()                 → 从 manifest 加载适配器（快速路径）
  │   └─ hackernews/top 注册到 globalThis.__opencli_registry__
  └─ runCli()
      │
      └─ commanderAdapter.ts
          ├─ registerAllCommands()   → 创建 "hackernews" 子命令和 "top" 子命令
          └─ program.parse()         → 解析命令行参数

      → 用户输入匹配 "hackernews top --limit 5"
      │
      └─ execution.ts
          ├─ coerceAndValidateArgs() → limit=5 (int)
          ├─ shouldUseBrowserSession() → false (PUBLIC 策略)
          ├─ page = null
          └─ executePipeline(page, pipeline, {args: {limit: 5}})
              │
              └─ pipeline/executor.ts
                  ├─ step 1: fetch → undici GET topstories.json → [29237, ...]
                  ├─ step 2: limit → data.slice(0, 15)
                  ├─ step 3: map   → [{id:29237}, ...]
                  ├─ step 4: fetch → 批量 GET item/29237.json → [{title, score, ...}]
                  ├─ step 5: filter → 过滤无效项
                  ├─ step 6: map   → [{rank:1, title:"...", ...}]
                  └─ step 7: limit → data.slice(0, 5)

      → [{rank:1, title:"...", score:342, author:"...", comments:87}, ...]
      │
      └─ output.ts
          └─ renderTable() → 格式化为终端表格
```

## 关联文档

- [架构全景](../concepts/architecture) — 模块间的整体关系
- [Pipeline 系统详解](../concepts/pipeline) — Pipeline 步骤和模板引擎
- [浏览器模块详解](../concepts/browser-module) — 浏览器模块的源码
- [Chrome 扩展源码分析](./extension-source) — 扩展的源码详解
