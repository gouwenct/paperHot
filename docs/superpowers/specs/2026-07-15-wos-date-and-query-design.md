# WoS 查询与论文日期补全设计

## 目标

让 Web of Science Starter API 按页面 Boolean 搜索图生成准确查询，并利用现有日期范围限制最近修改/收录记录；论文日期按 WoS、Crossref DOI 和出版社页面逐级补全，始终保留精度最高的值。

## 查询规则

- 每个用户关键词单独使用双引号，例如 `"SIM"`、`"super resolution"`。
- AND 连线生成 `("SIM" AND "super resolution")`，不同连线组及独立点亮词使用 OR 连接。
- WoS 方向检索发送 `modifiedTimeSpan=<开始日期>+<结束日期>`，并发送 `sortField=LD+D`。
- 指定论文检索继续使用 DOI 或 WOS UT 精确查询，不附加时间范围。

`modifiedTimeSpan` 表示 WoS 记录最近修改时间，是 Starter API 对近期收录/更新最接近的官方筛选参数，不伪装成论文发表日期。

## 信源信任与合并规则

- WoS 的 `TS` 查询由 WoS 全字段索引执行。Starter 响应可能不返回摘要、Keywords Plus 或实际命中字段，因此 PaperHot 直接接收 WoS 命中，不再用响应中的有限字段二次否定。
- Google Scholar、Google Search、arXiv、bioRxiv 和 Semantic Scholar 继续按各自返回的标题、摘要、标签和页面 Boolean 搜索图执行本地过滤。
- 各信源结果进入统一候选池后再去重：优先使用 DOI，其次使用信源稳定标识，再以规范标题和作者重叠兜底；同一正式论文优先保留 WoS 记录，正式版与预印本分别保留并建立版本关联。
- 合并后的候选统一执行日期确认、Crossref/出版社补全、LLM、期刊指标、排序和归档。信源信任只影响关键词命中判断，不绕过日期范围和后续元数据处理。

## 日期补全规则

1. 首先读取 WoS 的 `publishYear` 和 `publishMonth`；支持数字及英文月份。
2. 论文带 DOI 时仍调用 Crossref `/works/{doi}`，不再因为标题完整而跳过。
3. Crossref 同时比较 `published-online`、`published-print`、`published` 和 `issued`，选择精度最高的日期；精度相同时优先 online、print、published、issued。
4. Crossref 后仍没有日级日期时，通过 DOI 跳转出版社页面，读取标准 citation/OpenGraph/JSON-LD 日期元数据。
5. 出版社页面失败时保留已有年月或年份，并按该时间粒度与检索范围是否重叠决定是否展示，不因为缺少日而删除。

## 失败处理

- Crossref 或出版社页面失败不阻断论文入库，并写入现有抓取错误列表。
- 不新增配置文件、依赖或持久化字段，不改变备份格式。
- 出版社页面只作为非日级日期的兜底，最多 2 个并发请求。

## 统计可观察性

- 抓取日志分别保存领域过滤前、日期粗筛、日期补全后和最终日期通过四个候选快照。
- “日期补全后”保留所有候选的最终确认日期，即使它随后因超出范围被排除。
- 统计详情用紧凑阶段按钮切换快照；旧日志缺少新快照时继续回退到已有候选数据。
- 筛选漏斗显示“日期粗筛、日期确认、历史库新增、最终展示”，不再把补全前的年份重叠判断称为最终日期范围。
- `newFetchedCount` 记录真正的 `archive.addedPapers.length`，不再复用最终展示数量。

## 验证

- 后端测试覆盖 Boolean WoS 查询、`modifiedTimeSpan`、`LD+D`、WoS 稀疏响应直接接收、WoS/Google Scholar 混合过滤、WoS 英文月份、Crossref DOI 强制补全、日期精度选择、出版社页面兜底及年月范围重叠。
- 运行后端测试、完整测试、Node 语法检查和 diff 检查。
