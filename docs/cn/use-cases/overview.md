# 使用场景总览

## 学习目标

| 级别 | 目标 |
|------|------|
| 基础 | 了解 OpenCLI 能解决哪些实际问题 |
| 进阶 | 能根据具体需求选择合适的命令和策略 |
| 专家 | 能将 OpenCLI 集成到复杂的工作流中 |

## 场景一：内容创作与研究

### 热点追踪

快速获取各平台的热门内容，发现创作灵感。

```bash
# 各平台热门内容
opencli zhihu hot --limit 10              # 知乎热榜
opencli weibo hot --limit 10              # 微博热搜
opencli bilibili hot --limit 10           # B站热门
opencli hackernews top --limit 10         # Hacker News
opencli reddit hot --limit 10             # Reddit 热门
opencli douyin hot --limit 10             # 抖音热门
opencli producthunt today                 # Product Hunt 今日推荐

# 批量导出为 JSON 供分析
opencli zhihu hot --format json > zhihu_hot.json
opencli weibo hot --format json > weibo_hot.json
```

### 多平台搜索

跨平台搜索同一关键词，对比不同社区的反应。

```bash
KEYWORD="AI Agent"

opencli zhihu search "$KEYWORD" --format json > zhihu.json
opencli twitter search "$KEYWORD" --format json > twitter.json
opencli reddit search "$KEYWORD" --format json > reddit.json
opencli hackernews search "$KEYWORD" --format json > hn.json
opencli xiaohongshu search "$KEYWORD" --format json > xhs.json

# 合并分析
jq -s '.[0] + .[1] + .[2] + .[3] + .[4]' \
  zhihu.json twitter.json reddit.json hn.json xhs.json \
  | jq '[.[] | {title: .title, score: .score, platform: .platform}]'
```

### 文章素材收集

```bash
# 获取文章内容
opencli web read https://example.com/article --format markdown > article.md

# 下载相关资源
opencli bilibili subtitle BV1xxx              # 获取视频字幕
opencli youtube transcript VIDEO_ID           # 获取 YouTube 文字稿
```

## 场景二：数据分析

### 社交媒体数据采集

```bash
# 用户分析
opencli bilibili me --format json             # 自己的账号信息
opencli twitter profile @username --format json
opencli reddit user username --format json

# 内容趋势分析
opencli xueqiu hot-stock --format json | jq '.[].symbol'
opencli douban movie-hot --format csv > movies.csv
opencli douban top250 --format csv > top250.csv

# 股票数据
opencli xueqiu stock SH600519 --format json   # 茅台股票信息
opencli yahoo-finance quote AAPL --format json # 苹果股票报价
```

### 学术研究

```bash
# 论文搜索
opencli arxiv search "large language model" --limit 20 --format json

# Hacker News 讨论
opencli hackernews search "transformer architecture" --format json
```

### 数据管道

将 OpenCLI 的输出导入到数据分析工具中：

```bash
# 导出到 CSV 供 Excel 分析
opencli hackernews top --limit 100 --format csv > hn_top.csv

# 导出为 JSON 供 Python 分析
opencli reddit hot --limit 50 --format json | python3 analyze.py

# 定时采集（cron）
# 每小时采集一次 Hacker News 热榜
# 0 * * * * opencli hackernews top --limit 30 --format json >> /data/hn_$(date +\%Y\%m\%d).json
```

## 场景三：自动化工作流

### 求职辅助

```bash
# Boss 直聘批量操作
opencli boss search "前端开发" --location "上海" --format json
opencli boss recommend --format json            # 推荐职位
opencli boss greet <job_id>                     # 打招呼
opencli boss batchgreet                         # 批量打招呼

# 查看聊天消息
opencli boss chatlist --format json
opencli boss chatmsg <chat_id>
```

### 社交媒体管理

```bash
# 内容发布
opencli xiaohongshu publish --title "新文章" --content "内容"

# 互动管理
opencli twitter like <tweet_id>
opencli twitter bookmark <tweet_id>
opencli zhihu like <answer_id>
opencli reddit upvote <post_id>

# 粉丝管理
opencli twitter following --format json
opencli twitter followers --format json
opencli instagram followers --format json
```

### 文件管理

```bash
# 夸克网盘操作
opencli quark ls /                              # 列出根目录
opencli quark mkdir /新文件夹                    # 创建目录
opencli quark mv /file.txt /归档/               # 移动文件
opencli quark save <share_url>                  # 保存分享文件
```

## 场景四：AI Agent 集成

OpenCLI 专为 AI Agent 设计，输出格式可以直接被 AI 消费。

### Claude Code 集成

OpenCLI 提供了专门的 Skills 供 Claude Code 使用：

```bash
# 智能搜索（自动选择最佳数据源）
# Claude Code 会根据问题选择合适的 opencli 命令
# 例如："最近有什么 AI 新闻？" → 搜索多个平台

# 网站探索与适配器生成
# Claude Code 可以自动分析网站结构并生成适配器
```

### Agent 工作流

```bash
# 步骤 1：获取热点
TOPICS=$(opencli zhihu hot --limit 5 --format json)

# 步骤 2：搜索详细内容
opencli zhihu search "$(echo $TOPICS | jq -r '.[0].title')" --format json

# 步骤 3：获取相关讨论
opencli twitter search "$(echo $TOPICS | jq -r '.[0].title')" --format json
```

### 桌面应用控制

通过 CDP 控制 Electron 应用，实现 AI Agent 与桌面软件的交互：

```bash
# Cursor IDE
opencli cursor ask "实现一个快速排序算法"

# ChatGPT
opencli chatgpt ask "解释量子计算的基本原理"

# Notion
opencli notion search "项目计划"
opencli notion new --title "会议记录"
```

## 场景五：信息聚合

### 个人信息中心

```bash
# 每日信息摘要脚本
#!/bin/bash
echo "=== 每日信息摘要 ==="
echo ""
echo "--- 科技新闻 ---"
opencli hackernews top --limit 5 --format plain
echo ""
echo "--- 知乎热榜 ---"
opencli zhihu hot --limit 5 --format plain
echo ""
echo "--- 股票行情 ---"
opencli xueqiu hot-stock --limit 5 --format plain
echo ""
echo "--- 天气 ---"
opencli sinafinance news --limit 3
```

### 多源对比

```bash
# 同一新闻在不同平台的表现
NEWS="OpenAI"

echo "=== Hacker News ==="
opencli hackernews search "$NEWS" --limit 3 --format plain

echo "=== Reddit ==="
opencli reddit search "$NEWS" --limit 3 --format plain

echo "=== Twitter ==="
opencli twitter search "$NEWS" --limit 3 --format plain

echo "=== 知乎 ==="
opencli zhihu search "$NEWS" --limit 3 --format plain
```

## 场景六：学习与研究

```bash
# 技术学习
opencli stackoverflow hot --limit 10           # 热门技术问题
opencli devto top --tag javascript             # JavaScript 热文
opencli arxiv search "neural network" --limit 20

# 英语学习
opencli dictionary search "serendipity"         # 查词
opencli dictionary synonyms "happy"             # 同义词
opencli dictionary examples "ubiquitous"        # 例句

# 阅读资源
opencli wikipedia summary "Machine learning"    # 维基百科摘要
opencli bbc news --limit 5                     # BBC 新闻（英语阅读）
```

## 场景七：电商与购物

```bash
# 商品搜索与比价
opencli amazon search "mechanical keyboard" --format json
opencli jd item <product_id>
opencli 1688 search "手机壳" --format json
opencli xianyu search "二手相机" --format json
opencli coupang search "laptop" --format json

# 优惠信息
opencli smzdm search "耳机" --format json       # 什么值得买
```

## 自定义场景

如果以上场景没有覆盖你的需求，可以通过以下方式扩展：

1. **开发 YAML 适配器**：对于有公开 API 的网站，10 分钟内可以创建新适配器
2. **开发 TypeScript 适配器**：对于需要登录或复杂操作的网站
3. **编写 Shell 脚本**：组合多个命令实现自动化流程
4. **集成到 AI Agent**：让 AI 自动选择和执行合适的命令

参考 [YAML 适配器开发](../developer/yaml-adapter) 和 [TypeScript 适配器开发](../developer/ts-adapter) 开始创建自己的适配器。

## 关联文档

- [快速入门](../guide/getting-started) — 安装和基本使用
- [适配器目录](../adapters/) — 完整的站点和命令列表
- [输出格式](../guide/getting-started#输出格式) — 不同输出格式的使用场景
- [YAML 适配器开发](../developer/yaml-adapter) — 为新网站创建适配器
