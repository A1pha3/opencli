# 错误处理与排查指南

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 能根据错误消息和退出码判断问题类型 |
| 进阶 | 能使用诊断模式定位问题根因 |
| 专家 | 能理解自修复系统的工作原理并编写健壮的适配器 |

## 错误类型体系

OpenCLI 定义了一套类型化的错误层次结构，每种错误对应唯一的退出码和友好的提示信息。

### 退出码表

OpenCLI 遵循 Unix `sysexits.h` 规范：

| 退出码 | 常量 | 错误类型 | 含义 |
|--------|------|----------|------|
| 0 | `SUCCESS` | — | 成功 |
| 1 | `GENERIC_ERROR` | `CommandExecutionError` / `SelectorError` | 通用执行错误 |
| 2 | `USAGE_ERROR` | `ArgumentError` | 参数使用错误 |
| 66 | `EX_NOINPUT` | `EmptyResultError` | 无数据 / 未找到 |
| 69 | `EX_UNAVAILABLE` | `BrowserConnectError` / `AdapterLoadError` | 服务不可用 |
| 75 | `EX_TEMPFAIL` | `TimeoutError` | 临时失败（可重试） |
| 77 | `EX_NOPERM` | `AuthRequiredError` | 需要认证 |
| 78 | `EX_CONFIG` | `ConfigError` | 配置错误 |
| 130 | — | — | Ctrl+C 中断 |

### 错误层级

```
CliError（基类）
  ├── BrowserConnectError   — 浏览器连接失败
  ├── AdapterLoadError       — 适配器加载失败
  ├── CommandExecutionError  — 命令执行错误
  ├── ConfigError            — 配置错误
  ├── AuthRequiredError      — 需要登录
  ├── TimeoutError           — 超时
  ├── ArgumentError          — 参数错误
  ├── EmptyResultError       — 空结果
  └── SelectorError          — 选择器失效
```

每个错误包含三个信息：
- **code**：机器可读的错误码（如 `BROWSER_CONNECT`、`AUTH_REQUIRED`）
- **message**：人类可读的错误描述
- **hint**：修复建议

### 错误图标

CLI 输出中每种错误有对应的图标，方便快速识别：

| 图标 | 错误码 | 含义 |
|------|--------|------|
| 🔒 | `AUTH_REQUIRED` | 需要登录 |
| 🔌 | `BROWSER_CONNECT` | 浏览器连接问题 |
| ⏱ | `TIMEOUT` | 操作超时 |
| ❌ | `ARGUMENT` | 参数错误 |
| 📭 | `EMPTY_RESULT` | 无数据返回 |
| 🔍 | `SELECTOR` | DOM 选择器失效 |
| 💥 | `COMMAND_EXEC` | 执行错误 |
| 📦 | `ADAPTER_LOAD` | 适配器加载失败 |
| 🌐 | `NETWORK` | 网络错误 |
| 🚫 | `API_ERROR` | API 错误 |
| ⏳ | `RATE_LIMITED` | 频率限制 |
| 🔄 | `PAGE_CHANGED` | 页面结构变化 |
| ⚙️ | `CONFIG` | 配置错误 |

## 常见错误排查

### 🔌 BrowserConnectError — 浏览器连接失败

**典型错误消息**：

```
🔌 Daemon is running but the Browser Extension is not connected.
Please install and enable the opencli Browser Bridge extension in Chrome or Chromium.
```

**排查步骤**：

1. **确认 Chrome 扩展已安装**：打开 `chrome://extensions/`，查找 OpenCLI 扩展
2. **确认扩展已启用**：扩展开关应为开启状态
3. **确认 Daemon 正在运行**：访问 `http://localhost:19825/ping`，应返回 `ok`
4. **重启扩展**：在 `chrome://extensions/` 中关闭再启用扩展
5. **重启 Chrome**：某些情况下需要完全退出并重新打开 Chrome
6. **检查端口**：确认端口 19825 未被其他程序占用

**常见原因**：

| 原因 | 解决方法 |
|------|----------|
| 扩展未安装 | 安装 OpenCLI Chrome 扩展 |
| 扩展被禁用 | 在 `chrome://extensions/` 中启用 |
| Chrome 未打开 | 打开 Chrome 浏览器 |
| 端口被占用 | 设置 `OPENCLI_DAEMON_PORT` 使用其他端口 |
| 防火墙拦截 | 允许 localhost 连接 |

---

### 🔒 AuthRequiredError — 需要登录

**典型错误消息**：

```
🔒 Not logged in to bilibili.com
   Please open Chrome or Chromium and log in to https://www.bilibili.com
```

**排查步骤**：

1. **在 Chrome 中打开目标网站**：如 `https://www.bilibili.com`
2. **确认已登录**：检查页面右上角是否有用户头像/名称
3. **重新登录**：如果登录已过期，重新登录
4. **重新运行命令**：登录后再次执行命令

**为什么会发生**：
- 从未在 Chrome 中登录过目标网站
- 登录会话过期
- 使用了无痕模式（无痕模式不保留 Cookie）

---

### ⏱ TimeoutError — 超时

**典型错误消息**：

```
⏱ Command timed out after 30s
   Try again, or increase timeout with OPENCLI_BROWSER_COMMAND_TIMEOUT env var
```

**排查步骤**：

1. **重试**：可能是临时网络问题
2. **增加超时时间**：设置环境变量

```bash
# 将超时时间设为 60 秒
OPENCLI_BROWSER_COMMAND_TIMEOUT=60000 opencli bilibili feed
```

3. **检查网络连接**：确认可以正常访问目标网站
4. **检查目标网站是否正常**：在浏览器中手动访问确认

---

### 📭 EmptyResultError — 空结果

**典型错误消息**：

```
📭 bilibili feed returned no data
   The page structure may have changed, or you may need to log in
```

**排查步骤**：

1. **确认登录状态**：在 Chrome 中确认已登录目标网站
2. **调整查询参数**：可能查询条件过于严格
3. **检查网站是否改版**：适配器可能需要更新
4. **报告问题**：如果是网站改版导致，提交 Issue

---

### 🔍 SelectorError — 选择器失效

**典型错误消息**：

```
🔍 Could not find element: button.search
   The page UI may have changed. Please report this issue.
```

**原因**：目标网站的 HTML 结构发生了变化，适配器中硬编码的 CSS 选择器或 DOM 快照索引不再有效。

**解决方法**：
- 更新适配器中的选择器
- 如果是内置适配器，提交 Issue 或 PR 修复

---

### 📦 AdapterLoadError — 适配器加载失败

**典型错误消息**：

```
📦 Failed to load adapter bilibili/feed
```

**常见原因**：

| 原因 | 解决方法 |
|------|----------|
| YAML 语法错误 | 检查 YAML 缩进和格式 |
| TypeScript 编译错误 | 运行 `npm run build` 查看错误 |
| 导入路径错误 | 确认 `import` 路径使用 `.js` 扩展名 |

---

### ⚙️ ConfigError — 配置错误

**典型错误消息**：

```
⚙️ Unknown pipeline step "customStep" at index 3.
   Check the YAML pipeline step name or register the custom step before execution.
```

**常见原因**：
- YAML Pipeline 中使用了不存在的步骤名
- 自定义步骤未注册

## 诊断模式

OpenCLI 提供诊断模式用于深入排查问题。

### 启用诊断

```bash
OPENCLI_DIAGNOSTIC=1 opencli <site> <command>
```

### 诊断输出内容

诊断模式会在命令执行失败时收集以下信息：

| 信息 | 说明 |
|------|------|
| 当前 URL | 页面导航到了哪里 |
| DOM 快照 | 页面的当前 DOM 结构 |
| 控制台日志 | 浏览器控制台的错误信息 |
| 网络请求 | 最近的 HTTP 请求和响应 |
| 截图 | 页面截图（base64） |

这些信息对于理解适配器失败的原因非常有用——你可以看到页面实际加载的内容，而不是假设它应该是什么。

### 使用诊断信息的场景

**场景一：适配器返回空数据**

```bash
OPENCLI_DIAGNOSTIC=1 opencli bilibili feed 2>&1 | less
```

通过 DOM 快照可以确认：
- 页面是否正确加载
- 是否有登录提示弹窗
- 数据是否确实不存在

**场景二：选择器失效**

```bash
OPENCLI_DIAGNOSTIC=1 opencli example list 2>&1
```

通过截图和 DOM 快照可以：
- 确认页面结构是否发生变化
- 找到新的元素位置
- 更新选择器

## 详细日志

### 启用详细日志

```bash
OPENCLI_VERBOSE=1 opencli <site> <command>
```

详细日志会输出：
- Daemon 启动过程
- Extension 连接等待
- Pipeline 步骤执行细节

### Pipeline 步骤调试

结合诊断模式和详细日志：

```bash
OPENCLI_DIAGNOSTIC=1 OPENCLI_VERBOSE=1 opencli hackernews top --limit 5
```

输出示例：

```
⏳ Starting daemon...
[step 1/7] fetch → https://hacker-news.firebaseio.com/v0/topstories.json
  → 500 items
[step 2/7] limit → 30
  → 30 items
[step 3/7] map → (id)
  → 30 items
...
```

## 自修复系统

OpenCLI 内置了自修复（Self-Repair）系统，可以在适配器失败时自动尝试修复。

### 工作原理

```
适配器执行失败
  │
  ├─ 收集诊断信息
  │   ├─ 当前 URL
  │   ├─ DOM 快照
  │   ├─ 控制台日志
  │   └─ 网络请求
  │
  ├─ 分析失败原因
  │   ├─ 页面结构是否变化
  │   ├─ API 是否返回错误
  │   └─ 选择器是否失效
  │
  └─ 尝试修复（如果可能）
      ├─ 更新选择器
      ├─ 调整参数
      └─ 重试
```

### 触发条件

自修复系统在以下条件下自动触发：
- 适配器抛出 `SelectorError`
- 适配器抛出 `EmptyResultError` 且诊断模式显示页面结构变化
- 适配器执行时 DOM 快照不匹配预期结构

### 手动触发

对于 TypeScript 适配器，可以使用 AI Agent 配合 `opencli-autofix` Skill 进行修复：

1. 运行失败命令并收集诊断信息
2. 分析目标网站的当前结构
3. 更新适配器代码
4. 验证修复结果

## 环境变量参考

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `OPENCLI_DIAGNOSTIC` | `0` | 启用诊断模式（收集详细的失败上下文） |
| `OPENCLI_VERBOSE` | `0` | 启用详细日志（连接过程、步骤详情） |
| `OPENCLI_DAEMON_PORT` | `19825` | Daemon 监听端口 |
| `OPENCLI_DAEMON_TIMEOUT` | `14400000` | Daemon 空闲超时（毫秒，默认 4 小时） |
| `OPENCLI_BROWSER_COMMAND_TIMEOUT` | `30000` | 浏览器命令超时（毫秒，默认 30 秒） |

## 编写健壮的适配器

### 使用类型化错误

```typescript
// 好的做法
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';

if (!isLoggedIn) {
  throw new AuthRequiredError('example.com');
}

if (items.length === 0) {
  throw new EmptyResultError('example list', 'No items found. Try different filters.');
}

// 避免
throw new Error('Something went wrong');  // 无结构化信息
```

### 设置合理的超时

```typescript
cli({
  // ...
  timeoutSeconds: 30,  // 对于复杂操作，设置更长的超时
});
```

### 提供有用的 hint

```typescript
throw new EmptyResultError(
  'bilibili search',
  'No results found. Try: 1) Check your login status 2) Use different keywords'
);
```

### 优雅地处理 API 变化

```typescript
// 防御性编程
const title = item.title ?? item.name ?? item.text ?? '(untitled)';
const score = item.score ?? item.points ?? 0;
```

## 在脚本中处理错误

### Bash

```bash
opencli hackernews top --limit 5

case $? in
  0)   echo "Success" ;;
  2)   echo "Bad arguments" ;;
  66)  echo "No results" ;;
  69)  echo "Browser unavailable" ;;
  75)  echo "Timeout - retry later" ;;
  77)  echo "Login required" ;;
  *)   echo "Error: $?" ;;
esac
```

### Node.js

```javascript
import { execSync } from 'child_process';

try {
  const output = execSync('opencli hackernews top --format json');
  const data = JSON.parse(output);
} catch (err) {
  const exitCode = err.status;
  if (exitCode === 77) {
    console.log('Need to login first');
  }
}
```

## 常见问题

### 如何获取更详细的错误信息

使用 `OPENCLI_VERBOSE=1` 和 `OPENCLI_DIAGNOSTIC=1`：

```bash
OPENCLI_VERBOSE=1 OPENCLI_DIAGNOSTIC=1 opencli bilibili feed 2>debug.log
```

### 为什么每次都提示 "Waiting for browser..."

Daemon 启动后需要等待 Chrome 扩展连接。如果每次都出现这个等待，说明：
1. 扩展未安装或未启用
2. Chrome 未打开
3. 扩展与 Daemon 之间的 WebSocket 连接建立缓慢

### 命令偶尔成功偶尔失败

可能是网络不稳定或目标网站间歇性问题。可以：
1. 使用 `OPENCLI_BROWSER_COMMAND_TIMEOUT` 增加超时
2. 在脚本中添加重试逻辑

## 关联文档

- [架构全景](../concepts/architecture) — 理解错误在架构各层中的传播
- [浏览器模块详解](../concepts/browser-module) — 浏览器连接问题的底层原因
- [适配器策略](../concepts/adapter-strategies) — 不同策略的错误特征
- [TypeScript 适配器开发](../developer/ts-adapter) — 在适配器中使用类型化错误
