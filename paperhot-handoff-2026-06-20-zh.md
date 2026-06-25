# paperHot handoff - 2026-06-20

## 目标
继续开发 `paperHot` 本地论文热点工具。当前重点是：显微/SIM/RIM/PRIM 方向论文抓取后，保留英文标题，但用 LLM 生成中文摘要和中文推荐理由，并支持在网页配置外部接口。

仓库路径：`E:\my2\codex-project\paperHot`
前端单文件：`E:\my2\codex-project\paperHot\public\index.html`
后端：`E:\my2\codex-project\paperHot\paperhot_backend.cjs`
服务入口：`E:\my2\codex-project\paperHot\server.cjs`
测试：`E:\my2\codex-project\paperHot\test\paperhot_backend.test.cjs`

## 用户要求与偏好
- 按用户贴出的 AGENTS.md 规则：编码前思考、简洁优先、精准修改、目标驱动执行。
- 涉及 Python/MATLAB 才需要先判断是否直接改；本轮主要是 JS/HTML。
- 不要泄露 API Key。`config/llm.json`、`config/google-scholar.json`、`config/journal-metrics.json` 已加入 `.gitignore`。
- 用户科研背景：3D-SIM、多层聚焦结构光照明 MPSIM、RIM、PRIM、2D-SIM；当前做 PRIM 伪随机结构光照明显微镜算法。
- 页面目标输出：英文标题 + 中文翻译/概括的摘要 + LLM 推荐理由。

## 已完成的主要功能

### 1. LLM 配置页面
前端 `public/index.html` 已改为 LLM provider 列表/手风琴样式：
- 每个模型左侧箭头只展开/收缩。
- 右侧开关启用模型。
- 每个展开模型底部有 `测试` 和 `确定`。
- `Custom` 自定义模型可编辑名称、说明、endpoint、key、model 等。
- API Key 保存后前端显示 `********`，后端不回传真实 key。
- 如果输入框是 `********`，提交时会当作“保留已有密钥”，不会覆盖真实 key。
- LLM 表单不再输入即保存；点 `确定` 或顶部 `保存接口` 才保存。

关键前端位置：
- `savedSecretMask` / 密钥星号：HTML 约 2170、2315、2435 行。
- LLM 测试按钮：HTML 约 2360-2363 行。
- 测试请求函数：HTML 约 2501-2544 行。
- 点击事件：HTML 约 2619-2628 行。

### 2. 外部接口配置与信源配置
- `外部接口配置` 中保留 LLM 模型列表与保存按钮。
- `Google Scholar / SerpApi` 和 `EasyScholar 期刊指标` 移到上方信源配置中。
- 只有点击对应信源 `编辑` 后，才显示 API endpoint/key 配置。
- `EasyScholar 期刊指标` 已作为默认信源加入前端和后端默认配置。

### 3. 后端配置读写
新增/使用接口：
- `GET /api/integrations/config`
- `POST /api/integrations/config`
- `POST /api/integrations/llm/test`

配置文件：
- `config/llm.json`：本机 LLM 配置，包含真实 key，已 ignore。
- `config/google-scholar.json`：Google Scholar/SerpApi 配置，已 ignore。
- `config/journal-metrics.json`：EasyScholar 配置，已 ignore。

### 4. LLM 摘要与推荐理由
后端已支持 OpenAI-compatible LLM 调用：
- base endpoint 会自动拼 `/chat/completions`。
- prompt 要求只返回 JSON：`summary`, `reason`。
- 标题保持英文；summary/reason 为中文。

关键函数：
- `callConfiguredLlm(...)`
- `enrichPapersWithLlmInsights(...)`
- `testLlmConfig(...)`

### 5. 修复旧 archive 不补跑 LLM 的问题
用户发现配置阿里 LLM 后，`#all` 页面仍显示英文摘要。原因定位：页面展示的是旧 `data/papers/archive.json`，旧论文 `tokenUsage.status` 为 `未调用 AI`，此前刷新只处理新抓到论文。

已修复：
- 新增 `paperNeedsLlmInsight(...)` 和 `enrichMissingLlmInsights(...)`。
- 刷新/读取 cache 返回 archive 论文前，会对未调用 AI 的旧论文补跑 LLM。
- 合并 archive 时，不再用同 DOI 新记录覆盖旧标题/来源，只允许补入 LLM 摘要、理由、token 和期刊指标。

关键位置：
- `paperhot_backend.cjs` 约 1497-1508 行。
- `fetchPaperPayload(...)` 缓存分支和刷新分支约 1683、1732 行。

## 当前阿里配置状态
用户已经填写阿里云模型接口。曾读取过本地配置确认：
- active provider：`aliyun-coding`
- provider：`aliyun-modelstudio`
- endpoint：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- model：`qwen-plus`
- hasApiKey：true

不要在任何输出中打印真实 API Key。

## 验证结果
最近一次验证通过：
- `node --test test\paperhot_backend.test.cjs` -> 32/32 pass
- `node --check paperhot_backend.cjs` -> pass
- `node --check server.cjs` -> pass
- 前端内联 `<script>` 提取后 `node --check` -> pass
- Playwright/Chrome 自动化模拟验证：展开 `aliyun-coding` 后有 `测试` 与 `确定`，点击 `测试` 会调用 `/api/integrations/llm/test` 并显示成功信息。

注意：Playwright 自动化中测试接口是拦截模拟的，避免消耗真实 API；后端单元测试覆盖了真实调用路径的请求格式。

## 重要注意事项
- 用户当前浏览器常在 `http://127.0.0.1:50758/#config` 或 `#all`。
- 修改 `server.cjs` / `paperhot_backend.cjs` 后，已有 Node 服务不会热加载，需要重启后端。
- 曾尝试启动 `50759`，后台 `Start-Process` 在沙盒里没有稳定保持；前台 `node server.cjs --port 50759` 可正常启动，但命令超时会结束进程。
- 如果用户说页面还是旧行为，优先让他重启服务/刷新页面，而不是先怀疑代码。
- 之前浏览器验证时曾临时写入过测试 key，后来已从 `config/llm.json` 清掉。若用户真实 key 之后被覆盖，需要用户重新填入。

## 当前工作区状态
`git status --short` 显示有多处脏文件：
- `.gitignore`
- `public/index.html`
- `paperhot_backend.cjs`
- `server.cjs`
- `test/paperhot_backend.test.cjs`
- 以及较早已有/相关配置文档：`config/journal-metrics.example.json`, `data/user/config.json`, `docs/easyscholar-config.md`, `config/google-scholar.example.json`, `docs/google-scholar-config.md`, `scripts/`

不要随意 revert 未确认的脏文件。很多改动来自之前连续开发。

## 建议下一步
1. 重启本地后端服务，例如在仓库中运行：
   `node server.cjs --port 50758`
   如果端口占用，换新端口并让用户打开对应 URL。
2. 在配置页展开 `阿里百炼 Coding Plan`，点击 `测试`，确认真实阿里 API 是否连通。
3. 如果测试成功，再到 `#all` 或最近论文页点击刷新；旧 archive 论文应补跑 LLM，摘要和理由变中文。
4. 如真实测试失败，查看页面展示的错误，重点区分：key 错误、model id 错误、endpoint 错误、网络/代理错误。
5. 如果用户要提交代码，先重新检查 diff，明确哪些文件属于本轮功能，哪些是之前已有改动。

## Suggested skills
- `handoff`：继续压缩上下文或迁移到新线程。
- `agent-skills:frontend-ui-engineering`：继续改配置页交互/UI。
- `agent-skills:test-driven-development`：继续补后端接口和行为测试。
- `agent-skills:debugging-and-error-recovery`：真实阿里 API 测试失败时定位 endpoint/key/model/网络问题。
- `playwright`：需要验证网页按钮和交互时使用浏览器自动化。
