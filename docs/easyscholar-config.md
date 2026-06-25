# EasyScholar 期刊指标配置

这个文件用于把 EasyScholar 的期刊影响因子和分区接入 paperHOT。密钥不要写进 HTML 或代码文件，只写在本地配置文件中。

## 配置步骤

1. 打开 EasyScholar 开放接口控制台：

   https://www.easyscholar.cc/console/user/open

2. 复制模板文件：

   `config/journal-metrics.example.json`

   复制为：

   `config/journal-metrics.json`

3. 在 `config/journal-metrics.json` 中填写：

   - `enabled`: 改成 `true`
   - `endpoint`: 使用 `https://easyscholar.cc/open/getPublicationRank`
   - `apiKey`: 填你的 Open API Key
   - `request.queryName`: 使用 `publicationName`
   - `request.apiKeyQueryName`: 使用 `secretKey`
   - `request.useApiKeyHeader`: 使用 `false`
   - `minIntervalMs`: 使用 `500`，对应 EasyScholar 文档要求的每秒最多 2 次请求

4. 如果 EasyScholar 返回字段名和模板不一致，修改 `responseMap`：

   - `impactFactor`: 影响因子字段路径
   - `partition`: 分区字段路径
   - `upgradedPartition`: 升级版分区字段路径，如果没有可留默认

## 示例

```json
{
  "provider": "easyscholar",
  "enabled": true,
  "endpoint": "https://easyscholar.cc/open/getPublicationRank",
  "apiKey": "",
  "minIntervalMs": 500,
  "request": {
    "method": "GET",
    "queryName": "publicationName",
    "apiKeyQueryName": "secretKey",
    "apiKeyHeader": "Authorization",
    "apiKeyPrefix": "Bearer ",
    "useApiKeyHeader": false
  },
  "responseMap": {
    "impactFactor": "data.officialRank.all.sciif",
    "partition": "data.officialRank.all.sci",
    "upgradedPartition": "data.officialRank.all.sciUp"
  }
}
```

## 当前状态

当前 paperHOT 已经在每篇论文数据中预留 `journalMetrics` 字段，并在前端卡片中显示期刊指标。后端会在论文刷新后，针对能识别出期刊名的论文调用 EasyScholar，并把影响因子、JCR 分区和中科院升级版分区写入本地论文缓存。

## 本地验证记录

2026-06-20 测试时，`https://www.easyscholar.cc/open/api/journal` 返回 HTTP 404；同一密钥使用 `https://easyscholar.cc/open/getPublicationRank?secretKey=...&publicationName=...` 可以成功返回 `Nature Methods`、`Bioinformatics` 等期刊数据。
