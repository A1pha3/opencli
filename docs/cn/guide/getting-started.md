# 快速入门

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 安装 OpenCLI 并成功运行第一条命令 |
| 进阶 | 理解输出格式和 Shell 补全的配置方法 |
| 专家 | 掌握浏览器桥接的启动流程，能独立排查连接问题 |

## 前置条件

| 要求 | 说明 |
|------|------|
| Node.js | >= 20.0.0 |
| 操作系统 | macOS、Linux 或 Windows（WSL） |
| 浏览器（可选） | Chrome 或 Chromium，用于需要登录的网站 |

验证 Node.js 版本：

```bash
node --version
# v20.x.x 或更高
```

## 安装

全局安装 OpenCLI：

```bash
npm install -g @jackwener/opencli
```

安装完成后，验证是否成功：

```bash
opencli --version
```

如果终端提示 `command not found`，请确认 npm 全局 bin 目录在系统 `PATH` 中：

```bash
npm config get prefix
# 输出类似 /usr/local
# 确认 <输出路径>/bin 在 PATH 中
```

## 运行第一条命令

安装完成后，不需要任何配置，直接运行不需要登录的公开命令：

```bash
# 查看 Hacker News 热门文章
opencli hackernews top

# 查看 GitHub 趋势仓库
opencli github trending

# 查看实时天气（默认北京）
opencli weather current
```

这些命令使用 `PUBLIC` 策略，直接调用公开 API，无需浏览器。

## 运行需要登录的命令

要访问需要登录的网站（如 Bilibili、知乎、Twitter），OpenCLI 需要借助浏览器桥接（Browser Bridge）复用你已有的登录会话。

### 为什么需要浏览器桥接

OpenCLI 的设计原则是**不触碰用户密码**。它不会要求你输入账号密码，而是通过一个 Chrome 扩展，直接在已登录的浏览器中执行操作。这意味着：

- 你只需要在 Chrome 中正常登录过目标网站
- OpenCLI 通过扩展自动复用该登录状态
- 整个过程中密码和 Cookie 由浏览器管理，OpenCLI 不直接接触

### 安装浏览器桥接

1. **安装 Chrome 扩展**：从 Chrome Web Store 安装 OpenCLI 扩展（或本地加载 `extension/` 目录）

2. **启动 Daemon**：第一次运行需要浏览器的命令时，Daemon 会自动启动：

```bash
# 运行需要登录的命令，Daemon 会自动启动
opencli bilibili feed
```

3. **确认扩展连接**：当 Daemon 启动后，Chrome 扩展会自动连接。如果扩展图标显示连接状态正常，即可使用。

> **提示**：如果连接失败，请参考 [错误处理与排查](../advanced/error-handling)。

## 命令格式

OpenCLI 的命令遵循统一的格式：

```bash
opencli <site> <command> [args...] [options]
```

| 部分 | 说明 | 示例 |
|------|------|------|
| `site` | 目标网站或应用名 | `bilibili`、`twitter`、`hackernews` |
| `command` | 具体操作 | `feed`、`search`、`top` |
| `args` | 位置参数 | `opencli bilibili user <uid>` |
| `options` | 命名选项 | `--limit 10`、`--format json` |

### 查看帮助

每个命令都内置帮助信息：

```bash
# 查看全局帮助
opencli --help

# 查看某个站点的可用命令
opencli bilibili --help

# 查看某个命令的参数说明
opencli bilibili search --help
```

## 输出格式

OpenCLI 支持多种输出格式，通过 `--format` 选项指定：

```bash
# 默认：表格格式（终端友好）
opencli hackernews top --limit 5

# JSON 格式（程序消费）
opencli hackernews top --limit 5 --format json

# YAML 格式
opencli hackernews top --limit 5 --format yaml

# Markdown 格式
opencli hackernews top --limit 5 --format markdown

# CSV 格式（数据分析）
opencli hackernews top --limit 5 --format csv
```

**为什么需要多种格式？**

- **表格**：适合人类在终端中快速浏览
- **JSON**：适合程序消费，例如 jq 处理或作为脚本输入
- **CSV**：适合导入 Excel 等数据分析工具
- **Markdown**：适合写入文档或笔记

当输出不在终端（如管道 `|` 或重定向 `>`）中时，OpenCLI 自动降级为 YAML 格式，保证数据可解析性。

### 配合其他工具使用

```bash
# 用 jq 筛选标题包含 "AI" 的文章
opencli hackernews top --format json | jq '.[] | select(.title | test("AI"; "i"))'

# 导出为 CSV 供分析
opencli hackernews top --limit 50 --format csv > hn_top.csv

# 只获取标题列表
opencli hackernews top --format json | jq -r '.[].title'
```

## Shell 补全

OpenCLI 在安装时自动配置 Bash、Zsh 和 Fish 的 Tab 补全。如果自动配置未生效，可以手动安装：

```bash
# Bash
opencli --get-completions bash > ~/.opencli-completion.bash
echo 'source ~/.opencli-completion.bash' >> ~/.bashrc

# Zsh
opencli --get-completions zsh > ~/.zfunc/_opencli
# 确保 ~/.zfunc 在 fpath 中

# Fish
opencli --get-completions fish > ~/.config/fish/completions/opencli.fish
```

补全安装后，输入 `opencli <Tab>` 即可看到所有可用的站点和命令。

## 退出码

OpenCLI 使用标准 Unix 退出码（参考 sysexits.h）表示执行结果：

| 退出码 | 常量 | 含义 | 典型场景 |
|--------|------|------|----------|
| 0 | `SUCCESS` | 成功 | 命令正常执行并返回数据 |
| 1 | `GENERIC_ERROR` | 通用错误 | 未分类的执行失败、DOM 选择器失效 |
| 2 | `USAGE_ERROR` | 参数错误 | 缺少必要参数、参数类型不匹配 |
| 66 | `EX_NOINPUT` | 空结果 | 命令执行成功但无返回数据 |
| 69 | `EX_UNAVAILABLE` | 服务不可用 | Daemon 未启动、扩展未连接、适配器加载失败 |
| 75 | `EX_TEMPFAIL` | 临时失败 | 命令超时，可稍后重试 |
| 77 | `EX_NOPERM` | 认证失败 | 目标网站需要登录但未检测到登录状态 |
| 78 | `EX_CONFIG` | 配置错误 | YAML 语法错误、Pipeline 步骤不存在 |
| 130 | — | 中断 | 用户按 Ctrl+C 中断 |

在脚本中可以根据退出码进行条件判断：

```bash
if opencli hackernews top --limit 5; then
  echo "成功获取数据"
else
  echo "执行失败，退出码: $?"
fi
```

## 下一步

完成快速入门后，建议按以下顺序继续学习：

1. **[适配器策略](../concepts/adapter-strategies)** — 理解 5 种策略的区别，选择合适的命令
2. **[架构全景](../concepts/architecture)** — 了解 OpenCLI 的整体架构和工作原理
3. **[错误处理与排查](../advanced/error-handling)** — 遇到问题时如何诊断和修复
4. **[YAML 适配器开发](../developer/yaml-adapter)** — 如果需要抓取 OpenCLI 尚未适配的网站

## 常见问题

### 安装后提示 command not found

这通常意味着 npm 全局 bin 目录不在 `PATH` 中。运行 `npm config get prefix` 找到安装路径，然后将 `<路径>/bin` 添加到 `PATH`。

### 浏览器命令卡在 "Waiting for browser..."

Daemon 已启动但 Chrome 扩展未连接。请确认：
1. Chrome 扩展已安装并启用
2. 扩展设置中的 Daemon 地址为 `ws://localhost:19825/ext`
3. 没有防火墙或安全软件拦截本地连接

### 命令执行后显示 "Empty result"

可能原因：
1. 目标网站结构发生变化（适配器需要更新）
2. 登录状态过期（重新登录目标网站）
3. 查询条件过滤掉了所有结果（调整参数）

### 支持哪些网站

运行 `opencli --help` 查看所有已注册的站点。完整列表参考 [适配器目录](../adapters/)。
