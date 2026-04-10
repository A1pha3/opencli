# 适配器目录

运行 `opencli --help` 查看当前注册的所有站点和命令。

## 浏览器适配器

需要通过 Chrome 扩展在浏览器中操作的适配器。确保已安装 OpenCLI Browser Bridge 扩展并已登录目标网站。

| 站点 | 命令 | 模式 |
|------|------|------|
| **twitter** | `trending` `bookmarks` `profile` `search` `timeline` `thread` `following` `followers` `notifications` `post` `reply` `delete` `like` `likes` `article` `follow` `unfollow` `bookmark` `unbookmark` `download` `accept` `reply-dm` `block` `unblock` `hide-reply` | 🔐 Browser |
| **reddit** | `hot` `frontpage` `popular` `search` `subreddit` `read` `user` `user-posts` `user-comments` `upvote` `save` `comment` `subscribe` `saved` `upvoted` | 🔐 Browser |
| **bilibili** | `hot` `search` `me` `favorite` `history` `feed` `subtitle` `dynamic` `ranking` `following` `user-videos` `download` | 🔐 Browser |
| **zhihu** | `hot` `search` `question` `download` `follow` `like` `favorite` `comment` `answer` | 🔐 Browser |
| **xiaohongshu** | `search` `notifications` `feed` `user` `note` `comments` `download` `publish` `creator-notes` `creator-note-detail` `creator-notes-summary` `creator-profile` `creator-stats` | 🔐 Browser |
| **youtube** | `search` `video` `transcript` | 🔐 Browser |
| **weibo** | `hot` `search` `feed` `user` `me` `post` `comments` | 🔐 Browser |
| **douyin** | `profile` `videos` `user-videos` `activities` `collections` `hashtag` `location` `stats` `publish` `draft` `drafts` `delete` `update` | 🔐 Browser |
| **tieba** | `hot` `posts` `search` `read` | 🔐 Browser |
| **hupu** | `hot` `search` `detail` `mentions` `reply` `like` `unlike` | 🌐 / 🔐 |
| **linkedin** | `search` `timeline` | 🔐 Browser |
| **facebook** | `feed` `profile` `search` `friends` `groups` `events` `notifications` `memories` `add-friend` `join-group` | 🔐 Browser |
| **instagram** | `explore` `profile` `search` `user` `followers` `following` `follow` `unfollow` `like` `unlike` `comment` `save` `unsave` `saved` | 🔐 Browser |
| **tiktok** | `explore` `search` `profile` `user` `following` `follow` `unfollow` `like` `unlike` `comment` `save` `unsave` `live` `notifications` `friends` | 🔐 Browser |
| **medium** | `feed` `search` `user` | 🔐 Browser |
| **pixiv** | `ranking` `search` `user` `illusts` `detail` `download` | 🔐 Browser |
| **douban** | `search` `top250` `subject` `photos` `download` `marks` `reviews` `movie-hot` `book-hot` | 🔐 Browser |
| **weread** | `shelf` `search` `book` `ranking` `notebooks` `highlights` `notes` | 🔐 Browser |
| **v2ex** | `hot` `latest` `topic` `node` `user` `member` `replies` `nodes` `daily` `me` `notifications` | 🌐 / 🔐 |
| **36kr** | `news` `hot` `search` `article` | 🌐 / 🔐 |
| **google** | `news` `search` `suggest` `trends` | 🌐 / 🔐 |
| **boss** | `search` `detail` `recommend` `joblist` `greet` `batchgreet` `send` `chatlist` `chatmsg` `invite` `mark` `exchange` `resume` `stats` | 🔐 Browser |
| **jike** | `feed` `search` `post` `topic` `user` `create` `comment` `like` `repost` `notifications` | 🔐 Browser |
| **xueqiu** | `feed` `hot-stock` `hot` `search` `stock` `comments` `watchlist` `earnings-date` `fund-holdings` `fund-snapshot` | 🔐 Browser |
| **quark** | `ls` `mkdir` `mv` `rename` `rm` `save` `share-tree` | 🔐 Browser |
| **notebooklm** | `status` `list` `open` `current` `get` `source-list` `source-get` `source-fulltext` `source-guide` `history` `note-list` `notes-get` `summary` | 🔐 Browser |
| **doubao** | `status` `new` `send` `read` `ask` `history` `detail` `meeting-summary` `meeting-transcript` | 🔐 Browser |
| **gemini** | `new` `ask` `image` `deep-research` `deep-research-result` | 🔐 Browser |
| **grok** | `ask` | 🔐 Browser |
| **yuanbao** | `new` `ask` | 🔐 Browser |
| **bloomberg** | `main` `markets` `economics` `industries` `tech` `politics` `businessweek` `opinions` `feeds` `news` | 🌐 / 🔐 |
| **imdb** | `search` `title` `top` `trending` `person` `reviews` | 🌐 / 🔐 |
| **producthunt** | `posts` `today` `hot` `browse` | 🌐 / 🔐 |
| **bluesky** | `search` `profile` `user` `feeds` `followers` `following` `thread` `trending` `starter-packs` | 🌐 Public |
| **xiaoe** | `courses` `detail` `catalog` `play-url` `content` | 🔐 Browser |
| **smzdm** | `search` | 🔐 Browser |
| **reuters** | `search` | 🔐 Browser |
| **ctrip** | `search` | 🔐 Browser |
| **coupang** | `search` `add-to-cart` | 🔐 Browser |
| **sinablog** | `hot` `search` `article` `user` | 🔐 Browser |
| **substack** | `feed` `search` `publication` | 🔐 Browser |
| **jimeng** | `generate` `history` | 🔐 Browser |
| **yollomi** | `generate` `video` `edit` `upload` `models` `remove-bg` `upscale` `face-swap` `restore` `try-on` `background` `object-remover` | 🔐 Browser |
| **linux-do** | `hot` `latest` `feed` `search` `categories` `category` `tags` `topic` `topic-content` `user-posts` `user-topics` | 🔐 Browser |
| **chaoxing** | `assignments` `exams` | 🔐 Browser |
| **amazon** | `bestsellers` `search` `product` `offer` `discussion` `movers-shakers` `new-releases` | 🔐 Browser |
| **1688** | `search` `item` `assets` `download` `store` | 🔐 Browser |
| **jd** | `item` | 🔐 Browser |
| **xianyu** | `search` `item` `chat` | 🔐 Browser |
| **web** | `read` | 🔐 Browser |
| **weixin** | `download` | 🔐 Browser |
| **ones** | `login` `me` `token-info` `tasks` `my-tasks` `task` `worklog` `logout` | 🔐 Browser + `ONES_BASE_URL` |
| **band** | `bands` `posts` `post` `mentions` | 🔐 Browser |
| **zsxq** | `groups` `dynamics` `topics` `topic` `search` | 🔐 Browser |

## 公开 API 适配器

不需要浏览器，直接通过 HTTP API 获取数据。无需登录，安装后即可使用。

| 站点 | 命令 | 模式 |
|------|------|------|
| **hackernews** | `top` `new` `best` `ask` `show` `jobs` `search` `user` | 🌐 Public |
| **bbc** | `news` | 🌐 Public |
| **devto** | `top` `tag` `user` | 🌐 Public |
| **dictionary** | `search` `synonyms` `examples` | 🌐 Public |
| **apple-podcasts** | `search` `episodes` `top` | 🌐 Public |
| **xiaoyuzhou** | `podcast` `podcast-episodes` `episode` | 🌐 Public |
| **yahoo-finance** | `quote` | 🌐 Public |
| **arxiv** | `search` `paper` | 🌐 Public |
| **paperreview** | `submit` `review` `feedback` | 🌐 Public |
| **barchart** | `quote` `options` `greeks` `flow` | 🌐 Public |
| **hf** | `top` | 🌐 Public |
| **sinafinance** | `news` | 🌐 Public |
| **stackoverflow** | `hot` `search` `bounties` `unanswered` | 🌐 Public |
| **wikipedia** | `search` `summary` `random` `trending` | 🌐 Public |
| **lesswrong** | `curated` `frontpage` `new` `top` `top-week` `top-month` `top-year` `read` `comments` `user` `user-posts` `tag` `tags` `sequences` `shortform` | 🌐 Public |
| **lobsters** | `hot` `newest` `active` `tag` | 🌐 Public |
| **steam** | `top-sellers` | 🌐 Public |
| **spotify** | `auth` `status` `play` `pause` `next` `prev` `volume` `search` `queue` `shuffle` `repeat` | 🔑 OAuth API |

## 桌面应用适配器

通过 CDP 直连 Electron 桌面应用。需要以 `--remote-debugging-port` 参数启动目标应用。

| 应用 | 说明 | 命令 |
|------|------|------|
| **Cursor** | AI IDE | `status` `send` `read` `new` `dump` `composer` `model` `extract-code` `ask` `screenshot` `history` `export` |
| **Codex** | OpenAI Codex CLI Agent | `status` `send` `read` `new` `extract-diff` `model` `ask` `screenshot` `history` `export` |
| **Antigravity** | Antigravity Ultra | `status` `send` `read` `new` `dump` `extract-code` `model` `watch` |
| **ChatGPT** | ChatGPT 桌面应用 | `status` `new` `send` `read` `ask` `model` |
| **ChatWise** | 多模型客户端 | `status` `new` `send` `read` `ask` `model` `history` `export` `screenshot` |
| **Notion** | 笔记和知识管理 | `status` `search` `read` `new` `write` `sidebar` `favorites` `export` |
| **Discord** | 即时通讯 | `status` `send` `read` `channels` `servers` `search` `members` |
| **Doubao App** | 豆包桌面应用 | `status` `new` `send` `read` `ask` `screenshot` `dump` |

## 模式说明

| 图标 | 模式 | 说明 |
|------|------|------|
| 🌐 Public | 公开 API | 不需要登录，无需浏览器 |
| 🔐 Browser | 浏览器 | 需要登录，通过浏览器扩展操作 |
| 🌐 / 🔐 | 混合 | 部分功能公开，部分需要登录 |
| 🔑 OAuth | OAuth API | 需要 OAuth 授权 |
| CDP 直连 | 桌面应用 | 通过 CDP 连接 Electron 应用 |

## 关联文档

- [快速入门](../guide/getting-started) — 如何使用这些适配器
- [适配器策略](../concepts/adapter-strategies) — 不同模式的底层原理
- [YAML 适配器开发](../developer/yaml-adapter) — 创建自定义适配器
