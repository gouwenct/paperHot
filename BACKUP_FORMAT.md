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

`data/papers/archive.json` 的论文记录可选包含 `displayTitle`、`publishedPrecision`、`publicationStage`、`retrievalSource`、`sourceId`、`citationCount`、`citationSource` 和 `relatedVersions`。这些字段用于保留信源、引用数据库和正式版/预印本关系；旧备份缺少时由读取流程补默认值，因此备份格式仍为版本 `1`，无需迁移。

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
```

勾选“包含统计缓存和抓取进度缓存”时额外包含：

```text
data/papers/journal-metrics-cache.json
data/papers/google-rolling-cursors.json
data/papers/YYYY-MM-DD.json
data/papers/YYYY-MM-DD-recent.json
```

勾选“包含抓取日志和操作日志”时额外包含：

```text
data/papers/fetch-log.json
data/papers/operation-log.jsonl
```

## Import Behavior

- 导入会按白名单读取 ZIP 内文件，不会解压任意路径。
- 默认导入不会覆盖本机 API Key。
- 只有用户勾选“允许导入并覆盖本机 API Key”时，才会写入 `config/*.json`。
- 导入本地论文库、收藏、阅读状态和日志时，会覆盖对应本地 JSON 文件。
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
