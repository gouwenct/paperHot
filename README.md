# Paper Hot

Paper Hot 是一个本地论文抓取、入库、收藏和 LLM 摘要辅助工具。项目里的真实 API 配置文件默认不提交到 GitHub，仓库只保留脱敏后的 `*.example.json` 模板。

## 本地启动

```bash
node server.cjs --port 50751
```

默认访问地址：

```text
http://127.0.0.1:50751
```

## API 配置文件

首次使用或从 GitHub 克隆后，把下面的 example 文件复制一份，改成对应的本地真实文件名，然后在页面的配置区域或 JSON 文件里填入自己的 API Key。

| 可提交模板 | 本地真实文件 | 用途 |
| --- | --- | --- |
| `config/llm.example.json` | `config/llm.json` | LLM 摘要翻译、推荐理由、单篇/批量 LLM 处理 |
| `config/google-scholar.example.json` | `config/google-scholar.json` | SerpApi / Google Scholar / Google 搜索抓取 |
| `config/journal-metrics.example.json` | `config/journal-metrics.json` | EasyScholar 期刊影响因子和分区查询 |
| `data/user/config.example.json` | `data/user/config.json` | 个人关键词、信源开关和前端领域配置 |
| `data/user/profile.example.json` | `data/user/profile.json` | 用户名、研究方向和界面语言 |

Windows PowerShell 示例：

```powershell
Copy-Item config\llm.example.json config\llm.json
Copy-Item config\google-scholar.example.json config\google-scholar.json
Copy-Item config\journal-metrics.example.json config\journal-metrics.json
Copy-Item data\user\config.example.json data\user\config.json
Copy-Item data\user\profile.example.json data\user\profile.json
```

之后启动服务，打开页面，在配置页填入各自的 API Key 并保存。

## 不要提交的本地文件

这些文件可能包含你的 API Key、个人配置或运行数据，已经在 `.gitignore` 中排除：

- `config/llm.json`
- `config/google-scholar.json`
- `config/journal-metrics.json`
- `data/papers/`
- `data/user/config.json`
- `data/user/profile.json`
