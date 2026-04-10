# 安装指南

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 成功安装 OpenCLI 并验证安装 |
| 进阶 | 理解不同的安装方式和适用场景 |
| 专家 | 能解决安装过程中的环境问题 |

## 前置条件

| 要求 | 说明 | 验证命令 |
|------|------|----------|
| Node.js >= 20 | 运行时环境 | `node --version` |
| npm | 包管理器（随 Node.js 安装） | `npm --version` |
| macOS / Linux / Windows (WSL) | 操作系统 | `uname -a` |

## 安装方式

### 方式一：npm 全局安装（推荐）

最简单的安装方式，适合大部分用户。

```bash
npm install -g @jackwener/opencli
```

安装完成后验证：

```bash
opencli --version
# 输出版本号，如 1.6.8
```

### 方式二：从源码编译

适合想要参与开发或使用最新未发布功能的用户。

```bash
# 克隆仓库
git clone https://github.com/jackwener/opencli.git
cd opencli

# 安装依赖
npm install

# 编译
npm run build

# 全局链接（开发模式）
npm link
```

编译完成后，`opencli` 命令指向本地源码，修改源码后运行 `npm run build` 即可生效。

**编译过程**：

```bash
npm run build
# 实际执行：
# 1. clean-dist    — 清理 dist/ 目录
# 2. tsc           — TypeScript 编译
# 3. copy-yaml     — 复制 YAML 适配器到 dist/
# 4. build-manifest — 生成 cli-manifest.json
```

### 方式三：npx 临时运行

不需要全局安装，适合一次性使用。

```bash
npx @jackwener/opencli hackernews top
```

**注意**：每次运行都会检查并下载最新版本，首次运行较慢。

## 版本更新

### npm 全局安装的更新

```bash
npm update -g @jackwener/opencli
```

或指定版本：

```bash
npm install -g @jackwener/opencli@latest
```

### 源码安装的更新

```bash
cd opencli
git pull origin main
npm install
npm run build
```

### 自动更新提示

OpenCLI 在后台异步检查更新。如果发现新版本，会在命令执行完成后显示更新提示（不影响命令执行）。

## 安装后设置

### Shell 补全

OpenCLI 在 npm 全局安装时自动尝试配置 Shell 补全。如果自动配置未生效，可手动安装。

#### Zsh

```bash
# 创建补全函数目录（如果不存在）
mkdir -p ~/.zfunc

# 生成补全脚本
opencli --get-completions zsh > ~/.zfunc/_opencli

# 确保 ~/.zfunc 在 fpath 中
# 在 ~/.zshrc 中添加：
# fpath=(~/.zfunc $fpath)
# autoload -U compinit && compinit
```

#### Bash

```bash
# 生成补全脚本
opencli --get-completions bash > ~/.opencli-completion.bash

# 在 ~/.bashrc 中添加：
# source ~/.opencli-completion.bash
```

#### Fish

```bash
# 生成补全脚本
opencli --get-completions fish > ~/.config/fish/completions/opencli.fish
```

配置完成后，重启终端或 `source` 配置文件，然后输入 `opencli <Tab>` 测试补全。

### 浏览器扩展安装

如果需要使用需要浏览器的命令（如 Bilibili、Twitter 等），需要安装 Chrome 扩展：

1. 打开 Chrome Web Store
2. 搜索 "OpenCLI Browser Bridge"
3. 点击"添加到 Chrome"
4. 安装完成后，扩展会自动连接到本地 Daemon

**验证扩展连接**：

```bash
# 运行任意需要浏览器的命令
opencli bilibili me
# 如果扩展已正确连接，会自动启动 Daemon 并执行命令
# 如果连接失败，会提示 "Waiting for Chrome/Chromium extension to connect..."
```

## 环境验证

安装完成后，按顺序验证每个组件：

```bash
# 1. 验证 CLI 安装
opencli --version

# 2. 验证公开命令（不需要浏览器）
opencli hackernews top --limit 3

# 3. 验证浏览器命令（需要扩展）
opencli bilibili hot --limit 3

# 4. 验证 Shell 补全
# 输入 opencli 后按 Tab，应显示所有可用站点
```

## 常见安装问题

### `command not found: opencli`

**原因**：npm 全局 bin 目录不在 `PATH` 中。

**解决方法**：

```bash
# 查看 npm 全局安装路径
npm config get prefix
# 输出类似 /usr/local

# 将 <prefix>/bin 添加到 PATH
# 在 ~/.zshrc 或 ~/.bashrc 中添加：
export PATH="$(npm config get prefix)/bin:$PATH"

# 重新加载配置
source ~/.zshrc  # 或 source ~/.bashrc
```

### `EACCES: permission denied`

**原因**：npm 全局目录需要管理员权限。

**解决方法**（选择其一）：

```bash
# 方案一：修改 npm 全局目录权限
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# 方案二：使用 nvm 管理 Node.js（推荐）
# 安装 nvm 后重新安装 Node.js 和 OpenCLI
nvm install 20
npm install -g @jackwener/opencli
```

### `Unsupported engine` 警告

**原因**：Node.js 版本低于 20。

**解决方法**：

```bash
# 检查当前版本
node --version

# 升级 Node.js（使用 nvm）
nvm install 20
nvm use 20
```

### TypeScript 编译错误（源码安装）

**原因**：TypeScript 版本不匹配或依赖缺失。

**解决方法**：

```bash
# 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 关联文档

- [快速入门](./getting-started) — 安装后的第一步操作
- [错误处理与排查](../advanced/error-handling) — 安装后遇到问题的排查方法
- [参与贡献](../developer/contributing) — 从源码开发参与贡献
