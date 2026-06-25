# Paper Hot

Paper Hot 是一个面向科研论文跟踪的本地 Web 工具。它的核心目标是把多来源论文检索、论文入库、摘要翻译、LLM 推荐理由、期刊指标和个人阅读管理放在同一个页面里，减少手动搜索、复制、翻译和整理论文的重复工作。

## 项目的目的

Paper Hot 用来持续跟踪一个研究方向里的新论文，当前默认围绕结构光照明显微镜、随机照明显微镜、PRIM、RIM、计算显微和生物图像重建等方向设计。

它希望解决几个具体问题：

- 从多个论文来源中自动抓取候选论文。
- 把论文长期保存到本地归档中，而不是每次刷新都丢失。
- 对摘要进行中文翻译，并生成和用户研究背景相关的推荐理由。
- 保存个人收藏、待读、已读、标星和短标题等阅读状态。
- 记录抓取、删除、去重、LLM 处理等操作日志，方便回看数据变化。

## 项目的功能

- 论文抓取：支持 Google Scholar via SerpApi、Google 搜索、arXiv、bioRxiv、Semantic Scholar 等来源。
- 本地归档：抓到的论文写入 `data/papers/archive.json`，默认追加保存。
- 候选论文管理：抓取日志中保留候选论文快照，可以把候选论文加入归档。
- 自动去重：支持按 DOI、标题、URL 等信息进行手动触发的归档去重。
- LLM 摘要处理：支持单篇或批量补跑摘要翻译和推荐理由生成。
- 期刊指标：通过 EasyScholar 查询影响因子和分区，并写入本地缓存。
- 阅读管理：支持收藏、待读、已读、未读、标星、短标题和引用复制。
- 日志记录：操作日志写入 `data/papers/operation-log.jsonl`，抓取日志写入 `data/papers/fetch-log.json`。
- Token 统计：根据归档和抓取日志统计 LLM 调用量。
- 本地配置：API、关键词、信源开关和用户研究背景都保存在本地 JSON 文件中。

## 项目怎么使用

### 1. 启动本地服务

在项目目录运行：

```bash
node server.cjs --port 50751
```

然后打开：

```text
http://127.0.0.1:50751
```

Paper Hot 默认使用固定端口 `50751`。如果修改了前端或后端文件，停止旧服务后仍然用同一个端口重新启动，再刷新浏览器页面即可。

### 2. 配置外部接口

首次使用时，可以直接在网页配置页填写 API 信息并保存；后端会自动生成对应的本地配置文件。

也可以先从模板复制：

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
| `config/llm.json` | LLM 提供商、模型、Endpoint、API Key、用户研究背景 |
| `config/google-scholar.json` | SerpApi / Google Scholar / Google 搜索配置 |
| `config/journal-metrics.json` | EasyScholar 期刊指标查询配置 |
| `data/user/config.json` | 关键词、信源开关和前端领域配置 |
| `data/user/profile.json` | 用户资料和界面语言 |

### 3. 抓取论文

打开“今日论文”页面，选择日期范围和信源后点击抓取。抓取完成后，论文会进入最近抓取结果，并写入本地归档。

如果 Google Scholar 开启滚动抓取，下次会从保存的分页位置继续。页面上也提供重置按钮，可以从第一页重新抓取。

### 4. 管理论文

在“全部论文”页面可以按关键词、抓取时间、发表时间、标签和排序条件筛选论文。每篇论文可以进行收藏、标记已读、标星、编辑短标题、复制引用、重新运行 LLM 摘要处理等操作。

在“个人收藏”页面中，待读、已读、标星等状态会写入本地文件，刷新页面后仍然保留。

## 项目的论文收集逻辑

点击抓取后，前端不会直接访问论文网站，而是向本地后端创建一次抓取任务。后端会按以下流程处理：

1. 读取用户配置
   后端读取关键词、信源开关、日期范围、Google Scholar 配置、LLM 配置和 EasyScholar 配置。

2. 多来源检索
   后端根据启用信源并行抓取论文候选：
   - Google Scholar via SerpApi
   - Google 搜索 via SerpApi
   - arXiv
   - bioRxiv
   - Semantic Scholar

3. 候选归一化
   不同来源返回的字段不一样，后端会统一成 Paper Hot 内部论文结构，包括标题、摘要、作者、DOI、URL、来源、发表时间、标签等。

4. 初步过滤
   后端先用字符串规则进行关键词过滤和领域过滤。短缩写如 SIM、RIM、PRIM 会结合显微成像上下文判断，避免普通英文缩写误命中。

5. 日期筛选
   对有明确发表日期的论文，按前端选择的日期范围筛选。对 Google 网页结果这类可能没有结构化日期的候选，会先保留进入后续 Crossref/LLM 流程，再根据补全结果做最终判断。

6. 初步排序
   先用本地规则给候选论文打初步分数，用于控制进入后续富集流程的数量。

7. 元数据补全
   后端通过 Crossref、出版方页面或 DOI 信息补全标题、DOI、期刊、发表日期等元数据。只拿到年份时不会伪造具体月日。

8. LLM 摘要和推荐
   LLM 会生成中文摘要翻译和中文推荐理由。历史归档中缺少 LLM 结果的论文，也可以单篇或批量补跑。

9. 期刊指标
   对正式期刊论文，后端通过 EasyScholar 查询影响因子、JCR 分区和中科院分区，并缓存查询结果。

10. 最终重评分
    后端结合英文摘要、中文摘要、LLM 推荐理由和期刊指标重新计算最终分数。传统结构光照明显微镜的新理念、新范式、算法改进、深度学习结合 SIM、生物结果对比等因素会影响评分。

11. 写入本地归档
    新论文会合并进 `data/papers/archive.json`。默认逻辑是追加保存；删除和自动去重需要用户在页面上明确触发。

## 项目的架构

Paper Hot 是一个轻量本地 Node.js 应用，主要由静态前端页面和本地后端 API 组成。

### 后端

- `server.cjs`
  本地 HTTP 服务入口，负责静态页面和 API 路由。

- `paperhot_backend.cjs`
  核心业务逻辑，包括论文抓取、归一化、过滤、排序、Crossref 补全、LLM 调用、EasyScholar 查询、归档合并、收藏和日志。

- `scripts/`
  一些一次性或辅助脚本。

### 前端

- `public/index.html`
  当前主要交互页面，包含今日论文、全部论文、个人收藏、配置、日志和统计等界面。

- `docs/`
  配置说明、论文入库流程说明和本地文档页面。

### 配置

- `config/*.example.json`
  可复制的接口配置模板。

- `config/*.json`
  本机实际接口配置，保存 API Key、Endpoint、模型等信息。

- `data/user/*.json`
  用户关键词、信源、个人资料和研究背景配置。

### 数据

- `data/papers/archive.json`
  全部论文归档。

- `data/papers/fetch-log.json`
  抓取日志和候选论文快照。

- `data/papers/operation-log.jsonl`
  追加式操作日志。

- `data/papers/favorites.json`
  收藏论文状态。

- `data/papers/paper-notes.json`
  短标题、已读、标星等阅读状态。

- `data/papers/journal-metrics-cache.json`
  EasyScholar 期刊指标缓存。

## 验证

项目包含 Node.js 测试：

```bash
node --test test\paperhot_backend.test.cjs
node --test test\paperhot_frontend.test.cjs
```
