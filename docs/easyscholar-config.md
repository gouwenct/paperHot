# EasyScholar 期刊指标配置

这个文件用于把 EasyScholar 的期刊影响因子和分区接入 paperHOT。密钥不要写进 HTML 或代码文件，只写在本地配置文件中。

## 配置步骤

1. 打开 EasyScholar 开放接口控制台：

   https://www.easyscholar.cc/console/user/open

2. 复制模板文件：

   `config/journal-metrics.easyscholar.example.json`

   复制为：

   `config/journal-metrics.json`

3. 在 `config/journal-metrics.json` 中填写：

   - `enabled`: 改成 `true`
   - `endpoint`: 填 EasyScholar 控制台给出的期刊查询接口地址
   - `apiKey`: 填你的 Open API Key
   - `request.queryName`: 填接口要求的期刊名参数名，例如 `journal`、`name` 或控制台文档中的字段名
   - `request.apiKeyHeader`: 填接口要求的鉴权 header，例如 `Authorization`、`token`、`X-API-Key`
   - `request.apiKeyPrefix`: 如果 header 需要 `Bearer ` 前缀就保留，否则改成空字符串

4. 如果 EasyScholar 返回字段名和模板不一致，修改 `responseMap`：

   - `impactFactor`: 影响因子字段路径
   - `partition`: 分区字段路径
   - `upgradedPartition`: 升级版分区字段路径，如果没有可留默认

## 示例

```json
{
  "provider": "easyscholar",
  "enabled": true,
  "endpoint": "https://www.easyscholar.cc/open/api/journal",
  "apiKey": "你的 key",
  "request": {
    "method": "GET",
    "queryName": "journal",
    "apiKeyHeader": "Authorization",
    "apiKeyPrefix": "Bearer "
  },
  "responseMap": {
    "impactFactor": "data.impactFactor",
    "partition": "data.partition",
    "upgradedPartition": "data.upgradedPartition"
  }
}
```

## 当前状态

当前 paperHOT 已经在每篇论文数据中预留 `journalMetrics` 字段，并在前端卡片中显示期刊指标。由于 EasyScholar 的开放接口细节需要你登录控制台查看，所以这里先采用可配置适配方式。
