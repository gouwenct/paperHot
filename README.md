# Paper Hot

Paper Hot 是一个面向科研论文跟踪的本地 Web 工具。它把多来源论文检索、本地论文入库、摘要翻译、LLM 推荐理由、期刊指标、阅读状态和操作日志放在同一个本地页面中，适合研究者每天跟踪自己领域的新论文。

新用户首次运行时，关键词、个人研究背景和 API 配置默认为空，需要在网页的“领域配置”页面填写自己的研究方向、信源和接口信息。

## 项目的目的

Paper Hot 的主要目的只有两个：

- 从多个论文来源收集论文，减少手动搜索。
- 自动生成中文摘要，以及与个人研究背景相关的推荐理由。

## 项目特点

- 本地部署，由用户自己管理自己领域的论文；有价值的论文条目会长期保存到本地归档，用于快速检索。Paper Hot 保存的是论文条目和元数据，不是完整 PDF 文库。
- 结合期刊指标、摘要内容和领域规则辅助排序。
- 保存收藏、待读、已读、标星、短标题等个人阅读状态。
- 记录抓取、入库、删除、去重、导入导出、LLM 处理等操作，方便追溯。

## 核心功能

### 论文收集

- Google Scholar via SerpApi。
- Google Search via SerpApi。
- arXiv。
- bioRxiv。
- Semantic Scholar。
- Crossref 和出版方页面元数据补全。

### 论文处理

- 论文字段归一化：标题、作者、摘要、DOI、URL、期刊、日期、来源。
- 关键词过滤和领域过滤。
- 日期范围筛选。
- LLM 摘要翻译和推荐理由生成。
- EasyScholar 期刊指标查询和缓存。
- 基于摘要、推荐理由、期刊指标和领域规则的重评分。

### 本地数据

- 全部论文归档。
- 抓取日志和候选论文快照。
- 追加式操作日志。
- 收藏、待读、已读、标星和短标题。
- 用户关键词、信源、研究背景和外部接口配置。
- ZIP 格式的本地数据导入导出。

### 页面交互

- 今日论文抓取。
- 全部论文筛选、排序和管理。
- 个人收藏和阅读流转。
- 领域关键词、信源和 API 配置。
- Token 统计、抓取日志、候选论文入库。
- 操作日志查看。

## 启动方式

在项目根目录运行：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:50751
```

不要直接双击或用 `file://` 打开 `public/index.html`。这个 HTML 文件是前端源码，必须通过 `server.cjs` 提供的本地服务访问；直接打开只能看到静态页面，抓取、保存、导入导出、日志、配置等需要后端 API 的功能不能正常使用。

项目默认固定使用 `50751` 端口。修改前端或后端文件后，应停止旧服务，再用同一个端口重启，然后刷新浏览器页面。

## 首次配置

### 通过网页配置

推荐方式是在“领域配置”页面填写：

- 主要关键词、辅助关键词、灵感关键词。
- 启用的论文来源。
- LLM Provider、模型、Endpoint 和 API Key。
- SerpApi / Google Scholar 配置。
- EasyScholar API Key。
- 用户研究背景和评分偏好。

如果不知道 API Key 如何获取，点击配置项旁边的 `?` 按钮，页面会显示获取步骤和对应网站链接。

### 通过 example 文件配置

也可以从模板复制：

```powershell
Copy-Item config\llm.example.json config\llm.json
Copy-Item config\google-scholar.example.json config\google-scholar.json
Copy-Item config\journal-metrics.example.json config\journal-metrics.json
Copy-Item data\user\config.example.json data\user\config.json
Copy-Item data\user\profile.example.json data\user\profile.json
```

主要配置文件：

| 文件 | 用途 |
| --- | --- |
| `config/llm.json` | LLM 提供商、模型、Endpoint、API Key |
| `config/google-scholar.json` | SerpApi、Google Scholar、Google Search 配置 |
| `config/journal-metrics.json` | EasyScholar 期刊指标查询配置 |
| `data/user/config.json` | 关键词、信源开关和前端领域配置 |
| `data/user/profile.json` | 用户资料、研究背景和语言偏好 |

真实 `config/*.json` 和本地 `data/papers/*` 不应提交到公共仓库；公共仓库只保留 `.example.json` 模板。

## 每一页的使用逻辑

### 今日论文

“今日论文”用于发起一次新的论文抓取。

使用逻辑：

- 选择日期范围。
- 选择或确认启用的信源。
- 如启用 Google Scholar 滚动抓取，可查看当前从第几篇开始抓取。
- 点击抓取后，前端创建本地后端任务。
- 后端从多个信源抓取候选论文，完成过滤、补全、LLM 处理、期刊指标查询和排序。
- 抓取结果显示在当前页面，同时写入全部论文归档。
- 每次抓取会生成一个带日期范围和抓取时间的会话标签。
- 清除今日论文显示只清空页面上的临时结果，不删除已入库论文。

页面重点：

- “重置”用于把 Google Scholar 滚动抓取位置恢复到第一页。
- 如果某些页触发反爬或失败，抓取日志会记录跳过范围，后续可以继续从后面抓。
- 最近一次抓取时间和距离当前的时间会显示在页面顶部。

### 全部论文

“全部论文”用于查看和管理本地归档中的所有论文。

使用逻辑：

- 默认显示 `data/papers/archive.json` 中的论文。
- 搜索框支持普通关键词，也支持类似 `A OR B` 的任意匹配。
- 右侧标签筛选互相之间是 OR 关系。
- 搜索、标签、抓取时间、发表时间、排序条件之间是 AND 关系。
- 抓取时间和发表时间可以点击切换正序或倒序。
- 时间节点用于快速筛选某一天、某个月或某一年范围的论文。
- 每次按需加载最多 20 篇，接近底部后继续加载下一批。

论文卡片操作：

- 收藏论文。
- 编辑短标题。
- 复制引用。
- 点击发表时间复制 DOI，悬停显示 DOI。
- 单篇重新运行 LLM 摘要翻译和推荐理由。
- 批量运行 LLM，只处理缺少翻译或总结的论文。
- 自动去重需要用户手动点击，不会自动删除归档内容。

页面重点：

- 已收藏论文在今日论文和全部论文中会弱化显示，帮助用户把注意力放在未处理论文上。
- 全部论文页不应自动删除论文；删除和去重必须由用户明确触发。

### 个人收藏

“个人收藏”用于管理用户明确关注的论文。

子页面：

- 已收藏论文。
- 待读论文。
- 已阅读论文。
- 标星论文。

使用逻辑：

- 默认打开待读论文。
- 收藏状态写入 `data/papers/favorites.json`。
- 短标题、已读、标星状态写入 `data/papers/paper-notes.json`。
- 点击“标记已读”后，论文在 3 秒内淡出，并出现“撤销”按钮。
- 3 秒内点击撤销，论文保留在待读页面。
- 3 秒后未撤销，论文进入已阅读页面。
- 已阅读页面可以点击“未阅读”，让论文回到待读页面。
- 删除按钮会把论文从收藏页移除。
- 收藏页内的论文都是已收藏论文，所以不再弱化显示背景。

页面重点：

- 短标题默认格式是 `年份@`，后面的技术缩写由用户填写。
- LLM 按钮可以刷新收藏论文的大模型总结。

### 领域配置

“领域配置”用于维护项目输入条件和外部接口。

使用逻辑：

- 配置关键词和关注领域。
- 启用或暂停各个信源。
- 配置 LLM、SerpApi 和 EasyScholar。
- 点击 `?` 查看 API 获取说明和对应网站。
- 保存接口时，空的 API Key 字段表示保留已有密钥。
- 首次配置状态会提示哪些配置还缺失。

本地数据导入导出：

- 导出默认包含本地论文库、收藏、待读、已读和标星。
- 可以选择是否包含统计缓存、抓取日志、操作日志、用户资料、API Key。
- 导出默认不包含 API Key。
- 导入默认不覆盖本机 API Key。
- 只有勾选“允许导入并覆盖本机 API Key”后，导入包里的接口配置才会写入本机。

页面重点：

- 可配置功能如果需要跨设备保留，维护者必须同步纳入导入导出逻辑。
- 涉及 API Key、访问令牌和个人研究背景的导出必须由用户显式勾选。

### 统计

“统计”用于查看 LLM Token 使用和抓取日志。

使用逻辑：

- 显示今日、近 7 天、近 30 天的 Token 统计。
- 按模型展示调用情况。
- 展示最近抓取日志。
- 抓取日志保留每次抓取的来源、数量、时间范围、候选论文快照和失败信息。
- 可以打开某次抓取的候选论文详情。
- 候选论文详情中可以把论文加入全部论文。
- 失败的 enrichment 任务可以从失败论文处重试，而不是从头搜索。

页面重点：

- 抓取日志用于诊断为什么某次没有抓到论文。
- 候选快照应尽量保留过滤前后的状态，方便维护者定位问题。

### 日志

“日志”用于查看本地操作记录。

使用逻辑：

- 读取 `data/papers/operation-log.jsonl`。
- 记录新增、删除、修改、导入、去重、LLM 处理等操作。
- 日志文件只追加，不自动清理。
- 页面提供刷新按钮。

页面重点：

- 用于追溯为什么全部论文数量变多、变少或某篇论文状态发生变化。
- 维护者新增会改变本地数据的功能时，应补充对应操作日志。

### 关于

“关于”用于简要说明 Paper Hot 的定位。当前主要作为产品说明页，后续可以补充版本号、维护者说明和更新日志入口。

## 论文入库流程

点击抓取后，前端不会直接访问外部论文网站，而是向本地后端创建抓取任务。后端流程如下：

1. 读取用户配置：关键词、信源、日期范围、LLM、SerpApi、EasyScholar。
2. 多来源检索：Google Scholar、Google Search、arXiv、bioRxiv、Semantic Scholar。
3. 候选归一化：统一标题、摘要、作者、DOI、URL、来源、日期等字段。
4. 关键词和领域过滤：用字符串规则和领域上下文过滤候选。
5. 日期筛选：按前端选择范围筛选；不伪造 `YYYY-01-01` 作为真实日期。
6. 初步排序：用本地规则控制进入后续富集的候选数量。
7. 元数据补全：通过 Crossref、DOI 和出版方页面补全期刊、日期、标题。
8. LLM 处理：生成中文摘要和推荐理由。
9. 期刊指标：通过 EasyScholar 查询影响因子和分区，并写入缓存。
10. 最终重评分：结合摘要、LLM 推荐理由、期刊指标和领域规则。
11. 写入归档：新论文追加到 `data/papers/archive.json`。
12. 写入日志：抓取日志和操作日志记录本次流程。

默认原则：

- 抓到并入库的论文不应被自动删除。
- 自动去重只有用户点击后才执行。
- 删除论文只有用户点击删除后才执行。
- 只拿到年份时只能显示年份，不能伪造具体日期。

## 项目架构

```mermaid
flowchart TD
    Browser["本地浏览器<br/>127.0.0.1:50751"] --> Frontend["public/index.html<br/>单页前端"]
    Frontend --> Server["server.cjs<br/>HTTP 服务和 API 路由"]
    Server --> Core["paperhot_backend.cjs<br/>抓取、过滤、富集、归档"]

    Core --> Config["config/*.json<br/>LLM / SerpApi / EasyScholar"]
    Core --> UserData["data/user/*.json<br/>关键词 / 信源 / 用户资料"]
    Core --> PaperData["data/papers/*.json<br/>论文库 / 日志 / 收藏 / 阅读状态"]

    Core --> Sources["外部论文和元数据来源"]
    Sources --> Google["Google Scholar / Google Search via SerpApi"]
    Sources --> Arxiv["arXiv"]
    Sources --> Biorxiv["bioRxiv"]
    Sources --> Semantic["Semantic Scholar"]
    Sources --> Crossref["Crossref / 出版方页面"]
    Sources --> EasyScholar["EasyScholar"]
    Sources --> LLM["LLM Provider"]
```

### 主要文件

| 路径 | 作用 |
| --- | --- |
| `server.cjs` | 本地 HTTP 服务入口，提供静态页面和 API 路由 |
| `paperhot_backend.cjs` | 核心业务逻辑：抓取、过滤、补全、LLM、期刊指标、归档、日志 |
| `public/index.html` | 单页前端，包含所有主要页面和交互 |
| `test/paperhot_backend.test.cjs` | 后端行为测试 |
| `test/paperhot_frontend.test.cjs` | 前端静态行为测试 |
| `config/*.example.json` | 可提交的接口配置模板 |
| `data/user/*.example.json` | 可提交的用户配置模板 |
| `CHANGELOG.md` | 项目更新日志 |
| `AGENTS.md` | 维护者和 AI 协作规则 |
| `BACKUP_FORMAT.md` | 本地数据 ZIP 备份格式、版本号和迁移规则 |

### 主要文件夹

| 文件夹 | 作用 | 是否建议上传 GitHub |
| --- | --- | --- |
| `config/` | 外部接口配置模板目录。GitHub 上只保留 `*.example.json`，用于告诉新用户如何填写 LLM、SerpApi 和 EasyScholar 配置；真实 `*.json` 包含 API Key，应保留在本机并被 `.gitignore` 忽略。 | 是，只上传 `*.example.json` |
| `docs/` | 补充文档目录，包含 API 获取与配置说明、论文入库流程说明等。它不是运行必需目录，但对维护者排查配置、理解入库流程和新用户上手有帮助。 | 是 |
| `public/` | 前端页面目录，目前主要是 `index.html`。必须通过 `http://127.0.0.1:50751` 访问，不要直接双击打开。 | 是 |
| `test/` | 后端和前端测试目录，用于验证抓取、导入导出、阅读状态、UI 结构等行为。 | 是 |
| `scripts/` | 维护脚本目录，目前包含发布前归档 changelog 的脚本。只提交通用维护脚本，不提交依赖个人环境的一次性脚本。 | 是，限通用脚本 |
| `data/` | 本地用户数据目录。GitHub 上只保留 example 文件；真实论文库、收藏、日志和用户资料应保留在本机。 | 只上传 example |

### 主要数据文件

| 路径 | 作用 |
| --- | --- |
| `data/papers/archive.json` | 全部论文归档 |
| `data/papers/fetch-log.json` | 抓取日志和候选论文快照 |
| `data/papers/operation-log.jsonl` | 追加式操作日志 |
| `data/papers/favorites.json` | 收藏论文状态 |
| `data/papers/paper-notes.json` | 短标题、已读、标星等阅读状态 |
| `data/papers/journal-metrics-cache.json` | EasyScholar 期刊指标缓存 |
| `data/papers/google-rolling-cursors.json` | Google Scholar 滚动抓取位置 |

## 维护者统一任务流程

详细维护规则放在 `AGENTS.md`，README 只保留维护入口。改动项目时请遵守以下简版流程：

- 先阅读 `AGENTS.md`，确认固定端口、更新日志、导入导出、敏感文件和发布规则。
- 每次代码或文档改动都同步更新 `CHANGELOG.md` 的 `未发布` 区域。
- 新增可配置状态时，同步判断是否应进入本地数据 ZIP 导入导出。
- 涉及论文库增删改、去重、导入导出或 LLM 处理时，同步考虑操作日志和测试。
- 提交前检查 `git status --short`，不要提交真实 API Key、本地论文库、个人资料或私密导出包。
- 发布前运行发布流程，把 `CHANGELOG.md` 的 `未发布` 内容归档到版本号和日期下面。

常用验证命令：

```bash
npm test
```

也可以分别运行：

```bash
npm run test:backend
npm run test:frontend
node --check paperhot_backend.cjs
node --check server.cjs
```

## 隐私和本地数据

Paper Hot 默认把用户数据保存在本地：

- API Key 写入 `config/*.json`。
- 论文和阅读状态写入 `data/papers/*.json`。
- 关键词和个人资料写入 `data/user/*.json`。

导出本地数据时：

- 默认不包含 API Key。
- 默认不覆盖本机 API Key。
- 包含 API Key 的 ZIP 只适合在自己的设备之间迁移。
- 不应把包含 API Key、个人研究背景或真实论文库的 ZIP 上传到公共仓库或发给他人。

## 开源使用方式

其他用户拿到项目后，典型流程是：

1. 克隆项目。
2. 运行 `npm start`。
3. 打开 `http://127.0.0.1:50751`。
4. 在“领域配置”页面填写自己的 API、关键词、信源和研究背景。
5. 在“今日论文”页面按日期范围抓取论文。
6. 在“全部论文”和“个人收藏”页面管理自己的论文库。

Paper Hot 的目标是让每个研究者都能在本地维护一套属于自己领域的论文热点数据库。
