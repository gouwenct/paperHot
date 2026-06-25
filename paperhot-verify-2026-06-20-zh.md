# paperHot 端到端验证报告 — 2026-06-20

验证目标:确认本项目能**真实抓取论文 → 本地存储 → LLM 真实连通 → 中文翻译/总结 → 页面正确显示**。
所有结论均来自真实命令 / 真实接口调用,无 mock、无虚构输出。

## 一句话结论
五层链路全部真实跑通。真实阿里 `qwen-plus` key 有效,中文摘要+推荐理由可生成,实时服务能把旧 archive 论文补跑成中文并交给前端渲染。

## 环境
- 仓库:`E:\my2\codex-project\paperHot`(纯 Node,无 `package.json`/依赖)
- Node:v24.15.0
- 入口:`server.cjs`;核心:`paperhot_backend.cjs`;前端单文件:`.superpowers/brainstorm/codex-20260619195104/content/paperhot-config-interactive-cn.html`
- LLM 配置:`config/llm.json`,active provider = `aliyun-coding`,model = `qwen-plus`,apiMode = `openai`,key 已配置(长度 115,不外泄明文)

## 逐层证据

### Layer 0 · 静态完整性(无网络)
- `node --check server.cjs` → OK
- `node --check paperhot_backend.cjs` → OK
- `node --test test/paperhot_backend.test.cjs` → **tests 32 / pass 32 / fail 0**

### Layer 1 · 真实抓取 + 本地存储
- `fetchArxivPapers(kw, {maxResults:5})` 真打 arXiv,返回 5 篇真实论文,例:
  - `GB-LSR: A Fast Local Spectral Image Representation ...` | 2026-06-17 | score=84
  - `Efficient Image Registration for Ultrasound Localization Microscopy ...` | 2026-06-17 | score=84
- 用自定义 arxiv fetcher 跑完整 `fetchRecentPapers` 管线写入**临时目录**(LLM 关闭、仅 arxiv 源,避免污染真实数据 / 烧 token):
  - 落盘文件:`<date>-recent.json`、`archive.json`
  - 回读成功:`papers=1`,标题 `Efficient Image Registration for Ultrasound Localization...`
  - 结论:抓取 + 缓存/归档读写链路成立。临时目录已清理。

### Layer 2 · LLM 真实连通 + 中文总结(1 次真实调用)
`testLlmConfig({})` 读真实 `config/llm.json` 发起 1 次真实阿里调用:
- `ok: true` | provider: `aliyun-modelstudio` | model: `qwen-plus`
- endpoint: `https://ws-...maas.aliyuncs.com/compatible-mode/v1/chat/completions`
- 延迟:约 2846 ms
- 返回:中文 `summary` + 中文 `reason`
- `tokenUsage.total = 292`,`status = 已调用 AI`
- 结论:**真实 key 有效**(此前 handoff 未验证过的关键部分,现已确认)。

### Layer 3 + 4 · 实时服务 + 页面显示
后台 `node server.cjs --port 50762`:
- `GET /` → HTTP 200,110997 字节,`<title>paperHOT 领域配置交互原型</title>`
- `GET /api/papers/recent` → HTTP 200,`count=2`,`archivedCount=2`,`errors:[]`;两篇均:
  - `[1] Self-supervised Internal Learning Enhances Isotropic Resolution ...`(3D-SIM)→ `已调用 AI`,tokens 538,中文摘要+中文理由
  - `[2] AD-Relight: Training-Free Banner Relighting ...` → `已调用 AI`,tokens 712,中文摘要+中文理由
  - 这两篇正是之前 `tokenUsage.status = 未调用 AI` 的 archive 旧论文,被实时服务"读取 → 真实 LLM 增强 → 返回中文",验证了 handoff 里"旧论文补跑 LLM"的修复。
- 前端渲染路径核对(HTML 源码):
  - `1427` 行:按模式选 `/api/papers/recent` / `/today` / `/refresh`
  - `1439` 行:`fetch(endpoint)`
  - `1443` 行:`payload.papers.map(normalizePaperForView)`
  - `1174` 行:`<p class="paper-summary">${escapeHTML(paper.summary)}</p>`
  - `1181` 行:`<div class="reason">为什么与你相关：${escapeHTML(paper.reason)}</div>`
  - 结论:接口返回字段与前端渲染字段一致,显示链路成立。

## 本轮产生的真实数据变化
- `data/papers/archive.json` 中那 2 篇论文已被实时增强为中文摘要(`/api/papers/recent` 的正常副作用)。等于页面现在确实能显示中文。
- 真实 token 消耗合计约 **1542 tokens**(292 + 538 + 712),共 3 次调用,成本极低。
- 临时验证目录已删除;测试服务(端口 50762)已停止。

## 边界 / 未覆盖(如实说明)
1. 页面显示为"接口 + 渲染代码"级验证,**非浏览器像素级**。未跑 Playwright 真实截图。
2. 数据池小:`today` 缓存为空(今天无正好当天日期的 SIM 论文),archive 仅 2 篇。**未触发全量 `refresh`**——全量会对最多 80 篇逐篇调真实 LLM,有明显 token 成本,需确认后再跑。
3. 召回质量偏松:`AD-Relight`(广告横幅重打光)非显微方向却通过过滤。属召回质量问题,不影响管线正确性,可作后续优化。

## 复现命令
```bash
cd E:/my2/codex-project/paperHot
# Layer 0
node --check server.cjs && node --check paperhot_backend.cjs
node --test test/paperhot_backend.test.cjs
# Layer 2(1 次真实 LLM 调用)
node -e 'require("./paperhot_backend.cjs").testLlmConfig({}).then(r=>console.log(r.ok,r.model,r.summary))'
# Layer 3+4(实时服务,会对缺摘要的 archive 论文补跑 LLM)
node server.cjs --port 50762
#   另开终端:curl http://127.0.0.1:50762/api/papers/recent
```
