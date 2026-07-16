# 完整摘要单源放行与 Firecrawl 兜底设计

## 目标

任意一个信源返回与论文身份匹配的完整摘要后，PaperHot 立即把该摘要交给 LLM 生成中文翻译和推荐理由。摘要片段、截断文本、机器人验证页和无法匹配论文身份的内容不得触发 LLM。

## 并行信源

- 对带 DOI 的论文并行请求 Web of Science DOI 查询、Semantic Scholar DOI 查询、Crossref work、出版社页面和 Firecrawl 出版社页面抓取。
- Firecrawl 只请求 `markdown` 和 `rawHtml`，不使用 Agent、Question 或其它 LLM 提取格式；优先从 HTML 元数据提取摘要，再从 Markdown 的 Abstract 章节提取。
- arXiv、bioRxiv 等已有稳定标识的论文沿用原始摘要抓取；任意单一完整摘要即可通过门禁。
- 所有请求同时启动，不为节省 WoS 配额串行等待。

## 候选格式

每个返回结果归一化为 `source`、`doi`、`title`、`authors`、`rawAbstract`、`cleanAbstract`、`isComplete` 和 `error`。`cleanAbstract` 用于保存和交给 LLM，不持久化网页正文。

## 身份与内容匹配

1. DOI 相同时视为同一论文；缺少 DOI 时要求规范标题一致且作者有意义重叠。
2. `cleanAbstract` 解码 HTML/JATS 实体、去标签、去常见结构标题、合并断行和空白。
3. 完整性检查拒绝省略号片段、生成式中文概述、机器人验证页和空文本。
4. 第一份通过身份与完整性检查的摘要立即采用，不等待其它较慢请求。
5. 全部请求完成仍无完整摘要时不调用 LLM。

## 失败状态

- 无完整摘要时保留检索片段，清空残缺的 `abstractZh`，保持 Token 状态为“未调用 AI”。
- 页面显示“未获得完整摘要，未进行 AI 分析”。
- 信源失败继续写入现有错误列表，不改变归档和 ZIP 备份版本。

## Firecrawl 配置

- 新增 `config/firecrawl.json`，字段为 `provider`、`enabled`、`endpoint` 和 `apiKey`；公共仓库只提交 `.example.json`。
- 设置页复用现有集成卡片、密钥遮蔽和“空 API Key 保留原值”行为。
- 默认导出不包含 Firecrawl API Key；只有用户勾选“包含 API Key 和外部接口配置”时才进入 ZIP。
- 后端直接使用 Node.js 原生 `fetch` 调 Firecrawl REST API，不增加 SDK 或其它依赖。

## 验证

- 覆盖首个完整摘要立即放行、并行请求、全部片段拒绝、Firecrawl HTML/Markdown 提取、配置密钥遮蔽/保留和 LLM 调用次数。
- 运行后端、前端全量测试、Node 语法检查、`git diff --check`，并按固定端口规则重启 `50751`。
