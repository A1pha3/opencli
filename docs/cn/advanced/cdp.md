# CDP 远程调试

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 CDP 连接的概念和适用场景 |
| 进阶 | 能配置 SSH 隧道或反向代理连接远程 Chrome |
| 专家 | 能在无头服务器环境中搭建完整的 OpenCLI 远程访问方案 |

## 什么是 CDP 远程调试

CDP（Chrome DevTools Protocol）是 Chrome 浏览器提供的调试协议。OpenCLI 可以直接通过 CDP 连接 Chrome，不依赖 Browser Bridge 扩展和 Daemon 进程。

### 适用场景

| 场景 | 说明 |
|------|------|
| 远程服务器 | 在没有 GUI 的服务器上运行 OpenCLI，控制远程的 Chrome |
| CI/CD 环境 | 在自动化测试流水线中使用 OpenCLI |
| Android Chrome | 通过 ADB 连接手机上的 Chrome |
| Electron 应用 | 直连桌面应用的 CDP 端口 |

**不适用场景**：如果 OpenCLI 和 Chrome 在同一台机器上，推荐使用 Browser Bridge 扩展，体验更流畅。

## 三阶段流程

CDP 远程连接分为三个阶段：

```
阶段一：本地准备 → 启动带 CDP 的 Chrome
阶段二：网络隧道 → 将 CDP 端口暴露给远程服务器
阶段三：远程执行 → 在服务器上运行 OpenCLI
```

## 阶段一：本地准备

在本地机器上启动 Chrome 并开启远程调试端口。

### macOS

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile" \
  --remote-allow-origins="*"
```

### Linux

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/chrome-debug-profile" \
  --remote-allow-origins="*"
```

### Windows

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%USERPROFILE%\chrome-debug-profile" ^
  --remote-allow-origins="*"
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `--remote-debugging-port=9222` | 在端口 9222 上开启 CDP 监听 |
| `--user-data-dir=...` | 使用独立的用户数据目录，避免影响日常浏览 |
| `--remote-allow-origins="*"` | 允许跨域 CDP WebSocket 连接（现代 Chrome 必需） |

Chrome 启动后，**登录你需要使用的目标网站**（如 bilibili.com、zhihu.com），确保 Cookie 会被保存。

## 阶段二：网络隧道

CDP 默认绑定到 `localhost`，远程服务器无法直接访问。需要通过网络隧道暴露端口。

### 方法 A：SSH 隧道（推荐）

如果你的本地机器可以通过 SSH 连接到远程服务器，这是最安全的方式。

在**本地机器**上运行：

```bash
ssh -R 9222:localhost:9222 your-server-user@your-server-ip
```

这条命令将远程服务器的端口 9222 转发回本地的端口 9222。保持 SSH 会话不要关闭。

**工作原理**：

```
远程服务器 localhost:9222
       │ SSH 反向隧道
       ▼
本地机器 localhost:9222
       │ CDP WebSocket
       ▼
Chrome 浏览器
```

### 方法 B：反向代理（ngrok / frp / socat）

如果本地机器无法直接 SSH 到远程服务器（如 NAT、防火墙限制），可以使用内网穿透工具。

在**本地机器**上运行：

```bash
ngrok http 9222
```

ngrok 会输出一个公网 URL，如 `https://abcdef.ngrok.app`。**复制这个 URL**。

**安全提示**：ngrok 会将你的 CDP 端口暴露到公网。虽然 CDP 端口没有认证机制，但 URL 是随机生成的，猜测难度较高。建议：
- 仅在需要时启动 ngrok
- 使用完毕后关闭 ngrok
- 考虑使用 ngrok 的认证功能

## 阶段三：远程执行

在**远程服务器**上设置 CDP 端点并运行 OpenCLI。

### SSH 隧道模式

```bash
export OPENCLI_CDP_ENDPOINT="http://localhost:9222"
opencli doctor                    # 验证连接
opencli bilibili hot --limit 5    # 测试命令
```

### ngrok 模式

```bash
# 使用 ngrok 提供的 URL
export OPENCLI_CDP_ENDPOINT="https://abcdef.ngrok.app"
opencli doctor                    # 验证连接
opencli bilibili hot --limit 5    # 测试命令
```

### 持久化配置

如果需要频繁使用，将环境变量写入 Shell 配置：

```bash
# 在 ~/.bashrc 或 ~/.zshrc 中添加
export OPENCLI_CDP_ENDPOINT="http://localhost:9222"
```

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `OPENCLI_CDP_ENDPOINT` | CDP 端点地址（HTTP/HTTPS/WS） | `http://localhost:9222` |
| `OPENCLI_CDP_TARGET` | 目标选择过滤器（标签页标题或 URL 子串） | `twitter`、`chatgpt` |

### 目标选择

当 CDP 端点上有多个标签页或窗口时，OpenCLI 会自动选择最合适的目标。你也可以手动指定：

```bash
# 通过标题/URL 子串指定
OPENCLI_CDP_TARGET="twitter" opencli twitter trending

# 直接使用 WebSocket 地址精确连接
OPENCLI_CDP_ENDPOINT=ws://localhost:9222/devtools/page/3941 opencli ...
```

## 验证连接

### 检查 CDP 端点

```bash
curl http://localhost:9222/json
```

成功时返回标签页列表：

```json
[
  {
    "id": "3941",
    "title": "Hacker News",
    "type": "page",
    "url": "https://news.ycombinator.com",
    "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/3941"
  }
]
```

### 使用 doctor 命令

```bash
opencli doctor
```

`doctor` 命令会检查：
1. CDP 端点是否可达
2. 是否有可用的标签页
3. 登录状态是否正常

## 与 Browser Bridge 的对比

| 特性 | Browser Bridge | CDP 直连 |
|------|---------------|---------|
| 需要 Chrome 扩展 | 是 | 否 |
| Daemon 进程 | 自动启动 | 不需要 |
| 适用环境 | 本地桌面 | 远程/无头/CI |
| Cookie 来源 | 桌面浏览器 | 目标 Chrome 实例 |
| 设置复杂度 | 低（安装扩展即可） | 中（需要配置隧道） |
| 多标签页管理 | 完整 | 基础 |

## 常见问题

### `curl localhost:9222/json` 返回空数组

Chrome 没有打开任何标签页，或者 `--remote-debugging-port` 参数未生效。确认 Chrome 以正确的参数启动。

### 连接成功但命令报 `(no data)`

目标网站需要登录。在 Chrome 中打开目标网站并登录，然后重新运行命令。

### `--remote-allow-origins` 报错

这是现代 Chrome（119+）的安全要求。如果没有这个参数，CDP WebSocket 连接可能被拒绝。

### SSH 隧道断开

长时间空闲后 SSH 连接可能断开。可以在 SSH 命令中添加保活参数：

```bash
ssh -o ServerAliveInterval=60 -R 9222:localhost:9222 user@server
```

## 关联文档

- [Android Chrome](./android-chrome) — 通过 ADB 连接 Android 设备
- [Electron 应用 CLI 化](./electron-apps) — 直连 Electron 桌面应用
- [浏览器模块详解](../concepts/browser-module) — CDP 在浏览器模块中的实现
- [错误处理与排查](./error-handling) — CDP 连接问题的排查方法
