# Android Chrome 远程调试

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 理解 OpenCLI 如何通过 ADB 控制 Android Chrome |
| 进阶 | 能独立配置 ADB 连接并执行命令 |
| 专家 | 能实现多设备并发和自动化测试 |

## 工作原理

Android Chrome 支持[通过 CDP 进行远程调试](https://developer.chrome.com/docs/devtools/remote-debugging/)。设备会暴露一个本地 Unix Socket，ADB 将其转发为本机的 TCP 端口，OpenCLI 的 `CDPBridge` 通过该端口建立 CDP WebSocket 连接。

```
OpenCLI (CDPBridge)
    │  WebSocket (CDP)
    ▼
localhost:9222                ← ADB 端口转发
    │  adb forward
    ▼
Android 设备
  chrome_devtools_remote      ← Chrome 的 Unix 调试 Socket
```

整个过程不依赖 Chrome 扩展，也不需要启动 Daemon 进程，是一条直接的 CDP WebSocket 连接。

## 前置条件

### Android 设备端

1. **开启开发者选项**：设置 → 关于手机 → 连续点击「版本号」7 次
2. **开启 USB 调试**：设置 → 开发者选项 → 开启 USB 调试
3. **启用远程调试**：在 Chrome 地址栏输入 `chrome://flags`，搜索 `DevTools remote debugging` 并启用（Chrome 119+）；旧版本在 USB 调试开启后默认可用

### 电脑端

- 已安装 [ADB（Android Debug Bridge）](https://developer.android.com/tools/adb) 并加入 `PATH`
- 已安装 OpenCLI（`npm install -g @jackwener/opencli`）

验证 ADB 安装：

```bash
adb version
# Android Debug Bridge version x.x.x
```

## 操作步骤

### 第一步：确认设备连接

```bash
adb devices
```

正常输出：

```
List of devices attached
R5CT443TRDM    device
```

如果设备显示为 `unauthorized`，请在手机上查看并点击「允许 USB 调试」弹窗。

### 第二步：转发 CDP 端口

```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

这条命令将手机的 Chrome 调试 Socket 映射到电脑的 TCP 端口 9222。

### 第三步：验证连接

```bash
curl http://localhost:9222/json
```

返回当前打开的标签页列表即为成功：

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

### 第四步：执行 OpenCLI 命令

```bash
export OPENCLI_CDP_ENDPOINT=http://localhost:9222
opencli hackernews top --limit 5
```

## 指定特定标签页

多个标签页同时打开时，`CDPBridge` 会通过打分算法自动选择最合适的目标（优先选 `type=page`、有实际 URL 的标签）。

手动指定目标：

```bash
# 通过标题或 URL 子串过滤
OPENCLI_CDP_TARGET="twitter" opencli twitter trending

# 直接使用 WebSocket 地址精确连接
OPENCLI_CDP_ENDPOINT=ws://localhost:9222/devtools/page/3941 opencli ...
```

## 使用需要登录的适配器

使用 `COOKIE` 策略的适配器（大多数社交和内容类网站）需要在 Android 设备上先完成登录。OpenCLI 通过 CDP 自动读取手机 Chrome 中的 Cookie，无需额外配置。

查看某个适配器是否需要登录：

```bash
opencli zhihu hot --help
# 输出中包含 Strategy: cookie | Browser: yes | Domain: www.zhihu.com
```

看到 `Strategy: cookie` 时，先在手机上登录对应网站，再执行命令。

## 断开连接

使用完毕后，移除端口转发：

```bash
# 移除指定端口
adb forward --remove tcp:9222

# 移除所有转发
adb forward --remove-all
```

## 与桌面 Chrome 的对比

| 特性 | 桌面 Chrome（Browser Bridge） | Android Chrome（CDPBridge） |
|------|-----------------------------|-----------------------------|
| 需要 Chrome 扩展 | 是 | 否 |
| Daemon 进程 | 是（自动启动） | 否 |
| 多标签页管理 | 完整支持 | 基础支持 |
| Cookie 来源 | 桌面浏览器的 Cookie | 手机浏览器的 Cookie |
| 触摸事件 | 不涉及 | 不需要（CDP 使用 DOM 事件） |

## 多设备并发

同时连接多台 Android 设备时，为每台分配不同的本地端口：

```bash
# 设备 1
adb -s <设备1序列号> forward tcp:9222 localabstract:chrome_devtools_remote

# 设备 2
adb -s <设备2序列号> forward tcp:9223 localabstract:chrome_devtools_remote

# 分别执行命令
OPENCLI_CDP_ENDPOINT=http://localhost:9222 opencli twitter trending
OPENCLI_CDP_ENDPOINT=http://localhost:9223 opencli twitter trending
```

查看设备序列号：

```bash
adb devices
# List of devices attached
# R5CT443TRDM    device
# ABCD1234      device
```

## 常见问题排查

### `adb devices` 没有输出

- 检查 USB 数据线是否支持数据传输（部分充电线不支持）
- 在设备上撤销 USB 调试授权后重新授权
- 尝试更换 USB 接口

### `curl http://localhost:9222/json` 返回空数组 `[]`

- 手机 Chrome 未打开，或没有活动标签页——打开一个标签页后重试
- `chrome://flags` 中的远程调试开关未启用

### `curl http://localhost:9222/json` 提示连接被拒绝

- 端口转发可能已断开（部分 ROM 锁屏后会断开）——重新执行 `adb forward`
- 某些定制 ROM 可能限制 ADB 功能

### 适配器返回 `(no data)`

- 该站点的 API 需要登录，先在手机 Chrome 中登录对应网站
- 使用 `--verbose` 参数查看哪一步 Pipeline 返回了空数据

### 连接不稳定，频繁断开

- 部分 ROM 在锁屏后会断开 ADB 连接
- 保持手机屏幕常亮：设置 → 开发者选项 → 不锁屏
- 使用高质量的 USB 数据线

## 关联文档

- [CDP 远程调试](./cdp) — CDP 连接的通用说明
- [Electron 应用 CLI 化](./electron-apps) — 另一种 CDP 直连场景
- [浏览器模块详解](../concepts/browser-module) — CDPBridge 的实现细节
- [适配器策略详解](../concepts/adapter-strategies) — COOKIE 策略的工作原理
