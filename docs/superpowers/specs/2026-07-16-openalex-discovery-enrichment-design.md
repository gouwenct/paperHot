# OpenAlex 检索与字段补全设计

## 目标

将 OpenAlex 接入 PaperHot，同时把“发现论文”和“补全论文字段”明确分开：今日论文页的信源开关只控制是否从该信源检索新论文，不关闭 Semantic Scholar、Crossref、OpenAlex 等信源的字段补全能力。

## 页面与配置

- 今日论文页把“本次信源”改名为“检索信源”，说明开关只影响本次论文发现，不影响字段补全。
- 领域配置页不再显示 arXiv、bioRxiv、Semantic Scholar 这类无需用户填写凭据的接口卡；它们仍保留为检索信源和后端补全能力。
- OpenAlex 当前需要免费的 API Key，因此保留 OpenAlex 配置卡，提供启用状态、API Key 和获取入口。
- OpenAlex 复用现有学术 API 联系邮箱作为 `User-Agent` 联系方式，但认证只使用 `api_key`，不发送未被官方文档支持的 `mailto` 查询参数。
- OpenAlex API Key 和联系邮箱均属于敏感配置，默认不进入本地数据 ZIP；只有用户显式选择包含外部接口配置时才导出和恢复。

## OpenAlex 检索

- 方向检索调用 OpenAlex `/works`，传入现有搜索表达式和冻结的起止日期。
- 指定 DOI 调用 `/works/doi:<doi>`；指定标题使用不附加方向关键词和日期范围的标题搜索。
- OpenAlex 复用现有逐信源分页、任务指纹、断点、错误日志、去重、日期筛选和归档流程，不新增独立任务系统。
- OpenAlex 检索开关关闭时不调用 OpenAlex 发现论文；只要 OpenAlex 已配置并启用，字段补全仍可调用 OpenAlex。

## 字段来源与优先级

领域配置页显示下面的 PaperHot 字段映射。这里的“原检索信源”指实际发现该论文的 WoS、Google Scholar、arXiv、bioRxiv、Semantic Scholar 或 OpenAlex。

| PaperHot 字段 | 来源 | 优先级与规则 |
| --- | --- | --- |
| 标题 | 原检索信源；Crossref `title`；OpenAlex `title` / `display_name` | 保留完整的原始标题；只有标题缺失或被截断时才补全，Crossref 优先于 OpenAlex。 |
| DOI | 原检索信源；Crossref `DOI`；OpenAlex `doi` / `ids.doi` | 已有且格式有效的 DOI 不覆盖；缺失时优先采用 Crossref 的身份匹配结果，再采用 OpenAlex。 |
| 作者 | 原检索信源；Crossref `author`；OpenAlex `authorships[].author.display_name` | 原作者列表非空时保留；缺失时 Crossref 优先于 OpenAlex。 |
| 期刊/来源 | Crossref `container-title`；原检索信源；OpenAlex `primary_location.source.display_name` | Crossref 的正式出版容器优先；其次保留原信源，最后用 OpenAlex 补空值。 |
| 发表时间 | 原检索信源；Crossref online/print/published/issued；OpenAlex `publication_date` / `publication_year`；出版方页面 | 不按信源强制覆盖，统一选择精度最高的值：日 > 月 > 年；只有年份时保留年份，不伪造 1 月 1 日。 |
| 摘要 | 原记录；WoS；Semantic Scholar；Crossref；OpenAlex `abstract_inverted_index`；出版方页面；Firecrawl | 先还原 OpenAlex 倒排摘要；所有候选都必须通过 DOI/标题身份、完整性和机器人页校验，采用最先通过校验的完整摘要，不以固定信源覆盖有效摘要。 |
| 引用次数 | WoS；Google Scholar；OpenAlex `cited_by_count` | 优先级为 WoS > Google Scholar > OpenAlex；同时保存 `citationSource`，不把不同数据库的计数相加。 |
| 论文链接 | 原检索信源 URL；DOI URL；OpenAlex `primary_location.landing_page_url`；OpenAlex Work ID | 优先保留可直接打开的原始记录或出版页面，缺失时依次回退。 |
| 开放 PDF | 原信源直接 PDF；OpenAlex `best_oa_location.pdf_url` / `primary_location.pdf_url` | 只填补缺失值，不覆盖已有可用 PDF。 |
| 标签 | 原信源关键词/分类；OpenAlex `topics` / `keywords` 的 `display_name` | 合并后去重并限制现有显示数量；OpenAlex 标签只补充，不删除原标签。 |
| 正式版/预印本 | arXiv、bioRxiv 的来源类型；OpenAlex `type` 与 location `version` | 明确的预印本标记优先；否则按正式论文处理，并沿用 DOI、标题和作者规则关联不同版本。 |
| 来源 ID | 各检索信源自己的稳定 ID；OpenAlex `id` | `retrievalSource` 与 `sourceId` 成对保存，不用 OpenAlex ID 覆盖其他信源 ID。 |
| 引用文本 | PaperHot 本地生成 | 使用最终标题、作者、年份、期刊和 DOI 重新生成，不直接采用某个信源的整段引用文本。 |
| 中文摘要、短标题、推荐理由、评分 | PaperHot 本地规则与 LLM | 不来自 OpenAlex；只有完整摘要通过校验后才调用 LLM。

## 错误处理

- OpenAlex 未启用或缺少 API Key 时跳过 OpenAlex 检索和补全，不阻断其他信源。
- `401/403` 明确提示 API Key 无效或无权限；`429` 记录限流并沿用现有失败页/重试机制。
- 单个 OpenAlex 字段缺失只触发字段级回退，不丢弃整篇论文。
- `abstract_inverted_index` 无法还原为完整摘要时不得交给 LLM。

## 测试与验证

- 后端测试覆盖 OpenAlex 方向检索、DOI/标题指定检索、分页和错误响应。
- 归一化测试覆盖所有字段映射、倒排摘要还原、年份精度和缺失字段回退。
- 测试确认关闭 OpenAlex 或 Semantic Scholar 的“检索信源”后不调用对应发现接口，但字段补全仍运行。
- 去重测试覆盖 WoS、Google Scholar、Crossref、OpenAlex 同篇论文的字段优先级和 `citationSource`。
- 前端测试覆盖配置页仅显示需要填写的接口、OpenAlex 配置和字段来源表，以及“检索信源”说明。
- 导入导出测试覆盖 OpenAlex API Key 默认排除、显式包含和旧 v1 备份兼容。
- 完成后运行前后端测试及 Node 语法检查，并按项目规则在固定端口 `50751` 重启验证。

## 成功标准

用户关闭某个今日论文检索开关时，只停止从该信源发现论文；已启用且可用的字段补全接口继续为其他来源论文补字段。配置页能够准确说明每个 PaperHot 字段的来源、回退优先级和本地生成边界。
