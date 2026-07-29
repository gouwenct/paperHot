# Paper Hot Backup Format

Paper Hot 的本地数据导出包是 ZIP 文件，用于在本机或新电脑上恢复论文条目、阅读状态、配置和可选日志。这个文件记录备份格式的稳定契约，避免项目后续大改后旧备份无法导回。

## 兼容原则

- 每个导出包必须包含格式名和版本号。
- 当前格式名是 `paperhot-local-data`。
- 当前备份格式版本是 `1`。
- 导入器必须先读取版本号，再决定如何迁移和写入本地文件。
- 未来如果数据结构发生重大变化，应新增迁移函数，而不是删除旧格式导入逻辑。
- 旧版本备份应通过测试样例长期验证。

## ZIP Manifest

每个 ZIP 根目录包含：

```text
paperhot-local-data.json
```

当前 manifest 字段：

```json
{
  "ok": true,
  "format": "paperhot-local-data",
  "version": 1,
  "minimumImporterVersion": 1,
  "packageType": "zip",
  "exportedAt": "2026-06-25T00:00:00.000Z",
  "includePapers": true,
  "includeProfile": false,
  "includeSecrets": false,
  "includeStats": false,
  "includeLogs": false
}
```

## Version 1 Files

默认导出包含：

```text
paperhot-local-data.json
data/user/config.json
data/papers/archive.json
data/papers/favorites.json
data/papers/paper-notes.json
```

`data/user/config.json` 可包含 `searchLogic.activeKeywords` 和 `searchLogic.andEdges`，用于跨设备保留关键词的 OR / AND 组合。旧备份缺少 `searchLogic` 时，导入后会把仍处于启用状态的关键词作为默认活动关键词，因此该兼容扩展继续使用格式版本 `1`。

`data/papers/archive.json` 的论文记录可选包含 `displayTitle`、`publishedPrecision`、`publicationStage`、`retrievalSource`、`sourceId`、`citationCount`、`citationSource`、`relatedVersions`、`abstractStatus` 和 `abstractConsensusSources`。后两个字段记录摘要是否通过完整性与论文身份校验，以及采用的信源名称；为兼容旧数据继续使用 `abstractConsensusSources` 字段名，但新记录允许只有一个信源。不包含额外全文、API Key 或运行缓存；旧备份缺少时按未确认处理，已有成功 AI 记录继续兼容显示，因此备份格式仍为版本 `1`，无需迁移。

`data/papers/paper-notes.json` 可选包含用户手动覆盖的论文类型 `categories` 和 `categoryLabels`，用于在页面上删除 AI 类型判断或补充人工类型。缺少这两个字段的旧 v1 备份继续回退到论文记录中的 AI 分类；字段为空数组表示用户手动清空了该论文的类型标签，因此备份版本保持 `1`。

用户手动填写并保存的完整摘要继续写入论文记录的现有 `summary` 字段，并以 `abstractConsensusSources: ["manual"]` 标记来源；Firecrawl 单篇重抓成功时使用 `"firecrawl"`。两者随 `archive.json` 正常导出和导入，不增加新文件或新字段，因此备份版本保持 `1`。

勾选“包含用户资料和研究背景”时额外包含：

```text
data/user/profile.json
```

勾选“包含 API Key 和外部接口配置”时额外包含：

```text
config/llm.json
config/google-scholar.json
config/journal-metrics.json
config/web-of-science.json
config/firecrawl.json
config/openalex.json
config/academic-apis.json
```

`config/firecrawl.json` 只在用户显式勾选包含 API Key 时进入 ZIP。旧 v1 包不含该可选文件仍可正常导入，因此备份版本保持 `1`。

`config/openalex.json` 保存 OpenAlex 免费 API Key、启用状态和分页参数。该文件默认不导出，只在用户显式勾选包含外部接口配置时进入 ZIP；旧 v1 包缺少该可选文件仍可正常导入，因此备份版本保持 `1`。

`config/academic-apis.json` 保存用户在页面填写的学术 API 联系邮箱。该文件默认不导出，只在用户显式勾选包含外部接口配置时进入 ZIP；旧 v1 包缺少该可选文件仍可正常导入，因此格式版本保持 `1`。

勾选“包含统计缓存、WoS 请求用量和抓取进度缓存”时额外包含：

```text
data/papers/journal-metrics-cache.json
data/papers/google-rolling-cursors.json
data/papers/web-of-science-usage.json
data/papers/llm-model-pool-state.json
data/papers/YYYY-MM-DD.json
data/papers/YYYY-MM-DD-recent.json
```

勾选“包含抓取日志和操作日志”时额外包含：

```text
data/papers/fetch-log.json
data/papers/operation-log.jsonl
```

`fetch-log.json` 的新记录可包含 `candidateSnapshots.afterDateEnrichment`、`candidateSnapshots.finalDateMatched` 和 `pipelineCounts.dateConfirmed`，用于在统计页对比日期补全前后结果。字段均为可选，旧 v1 抓取日志缺少这些字段时继续兼容读取，因此备份版本保持为 `1`。

近期抓取断点 `data/papers/recent-fetch-cursors.json` 是只对当前设备和完全相同任务有效的短期运行态。Google、WoS、arXiv 等每个启用信源只保存 `nextPage` 和 `complete`；恢复时跳过已完成信源，从未完成信源的 `nextPage` 继续，全部启用信源完成后删除该任务。Google 的近期抓取和指定论文检索不与旧 `google-rolling-cursors.json` 同步。该文件不进入默认或任何可选导出。

引文谱系目录 `data/papers/lineage/` 保存 30 天有效的外部信源合并缓存。它可以在另一台设备按 DOI/OpenAlex 数据重新生成，因此不进入默认导出或任何可选导出，也不在导入时恢复；该排除规则不改变 `paperhot-local-data` v1。

`data/papers/web-of-science-usage.json` 只保存 PaperHot 本地聚合请求次数、日/月计数和最后状态，不保存请求 URL、查询表达式、Header 或 API Key。它只在 `includeStats=true` 时进入 ZIP，并通过导入白名单恢复。旧 v1 备份没有该可选文件时继续正常导入，因此备份版本保持 `1`。

`data/papers/llm-model-pool-state.json` 保存阿里百炼模型池的本地 Token 估算、连续失败次数和当前状态，不保存 API Key、请求内容或阿里云控制台私有数据。运行时状态按 `providerId::model` 隔离，同一模型名可在多个阿里百炼 Provider 中独立计数；旧文件中的未分区模型键和 `activeModel` 仍可读取并在后续写入时兼容保留。它只在 `includeStats=true` 时进入 ZIP，并通过导入白名单恢复。旧 v1 备份没有该可选文件时继续正常导入，因此备份版本保持 `1`。

## Import Behavior

- 导入会按白名单读取 ZIP 内文件，不会解压任意路径。
- 默认导入不会覆盖本机 API Key。
- 只有用户勾选“允许导入并覆盖本机 API Key”时，才会写入 `config/*.json`。
- 导入本地论文库、收藏、阅读状态和日志时，会覆盖对应本地 JSON 文件。
- 如果 ZIP 包含可选的 `data/papers/web-of-science-usage.json`，导入会恢复本地 WoS 聚合用量；缺少该文件的旧 v1 包不受影响。
- 如果 ZIP 包含可选的 `data/papers/llm-model-pool-state.json`，导入会恢复阿里百炼模型池的本地额度估算和失败状态；缺少该文件的旧 v1 包不受影响。
- 导入成功后会追加一条 `local-data-import` 操作日志。

## Migration Rules

未来升级备份格式时，按这个流程处理：

1. 增加新的版本号，例如 `version: 2`。
2. 保留旧版本导入路径。
3. 新增迁移函数，例如 `migrateLocalDataBackupV1ToV2`。
4. 导入时按版本链转换到当前格式。
5. 增加旧版本 fixture 或构造型测试，证明旧备份仍能导入。
6. 在 `CHANGELOG.md` 的 `配置与数据` 或 `破坏性变更` 中说明迁移影响。

## What Not To Store

备份包不保存完整 PDF 文库。Paper Hot 的定位是保存论文条目、元数据、摘要、推荐理由、期刊指标缓存和阅读状态。

默认导出不保存 API Key、访问令牌或个人研究背景；这些内容必须由用户显式勾选后才会进入 ZIP。

近期抓取断点在任何导出选项下都不导出，避免另一台设备恢复已过期的外部请求任务。
