# Google Scholar 信号源配置

paperHOT 不直接硬爬 Google Scholar HTML 页面。Google Scholar 官方帮助要求自动软件访问时尊重 `robots.txt`，也说明不提供批量访问；因此这里采用“已授权 API / 合规代理端点”的方式接入。

## 配置步骤

1. 复制模板：

   `config/google-scholar.example.json`

   复制为：

   `config/google-scholar.json`

2. 在 `config/google-scholar.json` 中填写：

   - `enabled`: 改成 `true`
   - `endpoint`: SerpApi 使用 `https://serpapi.com/search.json?engine=google_scholar&hl=en`
   - `apiKey`: 填你的 SerpApi key
   - `request.queryName`: 查询关键词参数名，默认 `q`
   - `request.apiKeyQueryName`: key 的查询参数名，默认 `api_key`
   - `responseMap`: 把返回 JSON 字段映射到论文字段

3. 到 paperHOT 的“领域配置”页面启用 `Google Scholar` 信号源。

## 反爬 / 机器人访问处理

如果端点返回 CAPTCHA、automated queries、unusual traffic、Cloudflare challenge、HTTP 403 或 HTTP 429，paperHOT 会把它记录为该信源的错误，不会写入 archive，也不会伪装成“没有论文”。

Cloudflare Temporary Accounts 这类思路适合用在你自己控制的代理或 Worker 部署上：让代理通过可声明、可过期、可验证的临时账号/凭据完成部署和访问配置，而不是在 paperHOT 后端里绕过对方网站的验证。

## 默认 SerpApi 风格示例

SerpApi 文档中的 Python 示例：

```python
import serpapi

client = serpapi.Client(api_key="你的 key")
results = client.search({
  "engine": "google_scholar",
  "q": "machine learning",
  "hl": "en"
})
organic_results = results["organic_results"]
```

paperHOT 后端不需要单独运行这个 Python 脚本，会用下面的 JSON 配置直接请求 SerpApi HTTP API：

```json
{
  "provider": "google-scholar-api",
  "enabled": true,
  "endpoint": "https://serpapi.com/search.json?engine=google_scholar&hl=en",
  "apiKey": "你的 key",
  "request": {
    "method": "GET",
    "queryName": "q",
    "apiKeyQueryName": "api_key",
    "useApiKeyHeader": false
  },
  "responseMap": {
    "items": "organic_results",
    "title": "title",
    "summary": "snippet",
    "doi": "doi",
    "journal": "publication_info.summary",
    "year": "publication_info.summary",
    "url": "link"
  }
}
```

SerpApi Google Scholar 结果通常不直接提供 DOI；paperHOT 会保留 `doi: ""`，并从 `publication_info.summary` 尽量解析作者、年份和期刊/来源。

paperHOT 会跟随 SerpApi 返回的 `serpapi_pagination.next` / `next_link` 连续抓取后续页面，直到没有下一页为止；内部有分页上限用于避免异常接口无限循环。
