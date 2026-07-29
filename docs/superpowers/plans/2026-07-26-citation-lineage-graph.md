# 引文谱系图实现计划

> 状态说明（2026-07-29）：引文谱系功能及后续可读性修复已经实现并验证。下方未勾选项和代码片段保留为原始实施计划，不代表当前完成度，也可能早于后续修复；当前行为以源码、测试、`CHANGELOG.md` 和 [引文谱系标题布局解决方案](../../solutions/ui-bugs/citation-lineage-title-layout-and-placeholder-fallback.md)为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 论文详情页下方新增引文谱系点线图：OpenAlex 与 Semantic Scholar 并行拉取前置/后续论文，DOI 归一化去重合并，节点可点击递归追溯，外部论文走临时详情页并可选加入论文库。

**Architecture:** 后端在 `paperhot_backend.cjs` 新增纯函数（信源抓取、合并去重、排序）+ 编排函数 `buildPaperLineage`（并行、Crossref 兜底、`data/papers/lineage/` 磁盘缓存），`server.cjs` 加两条 GET 路由。前端在 `public/index.html` 单文件内新增谱系板块（原生 SVG）、`#lineage/<id>` 临时详情页路由和 session 级追溯路径高亮。

**Tech Stack:** Node 20+ 原生（`node:http`、全局 `fetch`、`node:test`），无新依赖；前端原生 SVG。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-07-26-citation-lineage-graph-design.md`。
- 所有外部请求走 `options.fetchImpl || fetch` 依赖注入模式（勿用不可注入的 `fetchJson`），超时统一 `AbortSignal.timeout(20000)`。
- 前置/后续各显示约 6 篇：本地库命中的全部保留，其余按 `isInfluential`、被引次数补充到 6。
- 只有年份时不伪造 `YYYY-01-01`；`published` 留空或只存年份并配 `publishedPrecision: "year"`。
- lineage 缓存目录 `data/papers/lineage/`，30 天 TTL，**不得**命名为 `YYYY-MM-DD*.json`（会被 `dateKeyFromCacheFile` 误认为日缓存），**不进入**一键导出 ZIP（导出为显式白名单，天然排除，交付说明中注明原因）。
- 追溯路径为 session 内存状态，不写 localStorage、不导出。
- 前端测试用 `readNamedFunction(html, name, nextName)` 按相邻函数名切源码，**不要在既有被测函数对之间插入新函数**；所有新前端函数作为一个连续块插在 `loadPaperDetail` 之后、`renderPaperDetail` 之前（约 :7781）。
- 每个任务提交前运行 `node --check paperhot_backend.cjs`、`node --check server.cjs`（涉及后端时）。
- 中文提示语与既有风格一致；不引入 CSS 变量，暗色用 `html[data-theme="dark"] .class` 覆盖。

---

### Task 1: 谱系信源抓取与节点归一化（OpenAlex + Semantic Scholar）

**Files:**
- Modify: `paperhot_backend.cjs`（常量区约 :87-96 附近加常量；函数加在 `restoreOpenAlexAbstract`（:668）与 OpenAlex 辅助函数所在区域之后的连续新块）
- Modify: `paperhot_backend.cjs:7589` 的 `module.exports`（按字母序加入新函数名）
- Test: `test/paperhot_backend.test.cjs`（文件末尾追加；顶部解构 import 列表加新函数名）

**Interfaces:**
- Consumes: 既有 `normalizeDoi`、`compactText`、`restoreOpenAlexAbstract`、`openAlexRequestOptions`、`DEFAULT_OPENALEX_CONFIG`、`SEMANTIC_SCHOLAR_PAPER_ENDPOINT`、`sleep`。
- Produces（后续任务依赖的精确签名）:
  - `lineageNodeFromOpenAlex(item) -> node | null`
  - `lineageNodeFromSemanticScholar(item, isInfluential = false) -> node | null`
  - `fetchOpenAlexLineage(doi, options = {}) -> Promise<{source:"openalex", center:node, predecessors:node[], successors:node[]} | null>`
  - `fetchSemanticScholarLineage(doi, options = {}) -> Promise<{source:"semanticscholar", center:null, predecessors:node[], successors:node[]} | null>`
  - node 结构：`{ doi, openAlexId, semanticScholarId, title, year, published, journal, abstract, citationCount, authors, isInfluential }`

**注意**：OpenAlex 谱系请求**不检查** `config.enabled`/`apiKey` 门禁（那是检索信源开关；OpenAlex 无 Key 也可用），仅在有 `apiKey` 时附加 `api_key` 参数。

- [ ] **Step 1: 写失败测试**

在 `test/paperhot_backend.test.cjs` 末尾追加（顶部解构加 `lineageNodeFromOpenAlex, lineageNodeFromSemanticScholar, fetchOpenAlexLineage, fetchSemanticScholarLineage`）：

```js
test("fetchOpenAlexLineage pulls referenced works and citing works in batches", async () => {
  const requests = [];
  const oaWork = (id, title, cites) => ({
    id: `https://openalex.org/${id}`, doi: `https://doi.org/10.1234/${id.toLowerCase()}`,
    title, publication_year: 2020, publication_date: "2020-03-15", cited_by_count: cites,
    abstract_inverted_index: { Deep: [0], learning: [1] },
    authorships: [{ author: { display_name: "Alice Chen" } }],
    primary_location: { source: { display_name: "Nature Methods" } },
    referenced_works: []
  });
  const result = await fetchOpenAlexLineage("10.1234/main", {
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "", maxPages: 1, perPage: 100 },
    academicApis: { contactEmail: "researcher@example.org" },
    fetchImpl: async (url) => {
      const target = url instanceof URL ? url : new URL(url);
      requests.push(target);
      if (target.pathname.endsWith("/doi:10.1234/main")) {
        return { ok: true, status: 200, json: async () => ({
          ...oaWork("W1", "Main paper", 10),
          referenced_works: ["https://openalex.org/W2", "https://openalex.org/W3"]
        }) };
      }
      if ((target.searchParams.get("filter") || "").startsWith("openalex_id:")) {
        return { ok: true, status: 200, json: async () => ({ results: [oaWork("W2", "Ref A", 500), oaWork("W3", "Ref B", 50)] }) };
      }
      if ((target.searchParams.get("filter") || "").startsWith("cites:")) {
        return { ok: true, status: 200, json: async () => ({ results: [oaWork("W9", "Citing paper", 7)] }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }
  });
  assert.equal(result.source, "openalex");
  assert.equal(result.center.title, "Main paper");
  assert.equal(result.predecessors.length, 2);
  assert.equal(result.predecessors[0].doi, "10.1234/w2");
  assert.equal(result.predecessors[0].abstract, "Deep learning");
  assert.equal(result.predecessors[0].journal, "Nature Methods");
  assert.equal(result.predecessors[0].published, "2020-03-15");
  assert.equal(result.successors[0].title, "Citing paper");
  const citesRequest = requests.find(u => (u.searchParams.get("filter") || "").startsWith("cites:"));
  assert.equal(citesRequest.searchParams.get("filter"), "cites:W1");
  assert.equal(citesRequest.searchParams.get("sort"), "cited_by_count:desc");
});

test("fetchSemanticScholarLineage maps references and citations with isInfluential", async () => {
  const s2Paper = (title, doi, cites) => ({
    paperId: `s2-${title}`, title, year: 2019, venue: "CVPR",
    abstract: `Abstract of ${title}`, citationCount: cites,
    externalIds: doi ? { DOI: doi } : {}, authors: [{ name: "Bob Li" }]
  });
  const result = await fetchSemanticScholarLineage("10.1234/main", {
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("/references")) {
        return { ok: true, status: 200, json: async () => ({ data: [
          { isInfluential: true, citedPaper: s2Paper("Ref A", "10.1234/W2", 480) },
          { isInfluential: false, citedPaper: s2Paper("Ref C", "", 5) }
        ] }) };
      }
      if (target.includes("/citations")) {
        return { ok: true, status: 200, json: async () => ({ data: [
          { isInfluential: false, citingPaper: s2Paper("Citing paper", "10.9/z", 7) }
        ] }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }
  });
  assert.equal(result.predecessors.length, 2);
  assert.equal(result.predecessors[0].isInfluential, true);
  assert.equal(result.predecessors[0].doi, "10.1234/w2");
  assert.equal(result.predecessors[1].doi, "");
  assert.equal(result.predecessors[1].year, 2019);
  assert.equal(result.predecessors[1].published, "", "只有年份时不得伪造具体日期");
  assert.equal(result.successors[0].title, "Citing paper");
});

test("fetchSemanticScholarLineage returns null when paper is not indexed", async () => {
  const result = await fetchSemanticScholarLineage("10.1234/unknown", {
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });
  assert.equal(result, null);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_backend.test.cjs 2>&1 | Select-String "lineage" -Context 0,3`
Expected: 解构 import 阶段直接抛 `lineageNodeFromOpenAlex is not a function` 或类似 undefined 错误。

- [ ] **Step 3: 实现**

在 `paperhot_backend.cjs` 常量区（`SEMANTIC_SCHOLAR_BATCH_ENDPOINT` 之后）加：

```js
const SEMANTIC_SCHOLAR_LINEAGE_FIELDS = "title,abstract,year,externalIds,citationCount,venue,authors";
const OPENALEX_LINEAGE_SELECT = "id,doi,title,display_name,publication_year,publication_date,cited_by_count,abstract_inverted_index,authorships,primary_location,referenced_works";
```

在 `restoreOpenAlexAbstract`（:668-678）之后、`openAlexRequestOptions` 之前不插入；改为在 `fetchOpenAlexWorkByDoi`（:699-710）之后作为连续新块加入：

```js
function lineageNodeFromOpenAlex(item) {
  if (!item || typeof item !== "object") return null;
  const title = compactText(item.title || item.display_name || "");
  if (!title) return null;
  const published = /^\d{4}-\d{2}-\d{2}$/.test(String(item.publication_date || "")) ? item.publication_date : "";
  return {
    doi: normalizeDoi(item.doi || ""),
    openAlexId: String(item.id || "").split("/").pop() || "",
    semanticScholarId: "",
    title,
    year: Number.isInteger(item.publication_year) ? item.publication_year : null,
    published,
    journal: compactText(item.primary_location?.source?.display_name || ""),
    abstract: restoreOpenAlexAbstract(item.abstract_inverted_index),
    citationCount: Number.isFinite(item.cited_by_count) ? item.cited_by_count : null,
    authors: (Array.isArray(item.authorships) ? item.authorships : [])
      .map(entry => compactText(entry?.author?.display_name || "")).filter(Boolean),
    isInfluential: false
  };
}

function lineageNodeFromSemanticScholar(item, isInfluential = false) {
  if (!item || typeof item !== "object") return null;
  const title = compactText(item.title || "");
  if (!title) return null;
  return {
    doi: normalizeDoi(item.externalIds?.DOI || ""),
    openAlexId: "",
    semanticScholarId: String(item.paperId || ""),
    title,
    year: Number.isInteger(item.year) ? item.year : null,
    published: "",
    journal: compactText(item.venue || ""),
    abstract: compactText(item.abstract || ""),
    citationCount: Number.isFinite(item.citationCount) ? item.citationCount : null,
    authors: (Array.isArray(item.authors) ? item.authors : [])
      .map(entry => compactText(entry?.name || "")).filter(Boolean),
    isInfluential: Boolean(isInfluential)
  };
}

async function fetchOpenAlexLineage(doi, options = {}) {
  const cleanDoi = normalizeDoi(doi);
  if (!cleanDoi) return null;
  const { config, fetchImpl, headers } = await openAlexRequestOptions(options);
  const endpoint = String(config.endpoint || DEFAULT_OPENALEX_CONFIG.endpoint).replace(/\/$/, "");
  const getJson = async url => {
    if (config.apiKey) url.searchParams.set("api_key", config.apiKey);
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`OpenAlex 谱系查询失败：HTTP ${response.status}`);
    return response.json();
  };
  const work = await getJson(new URL(`${endpoint}/doi:${cleanDoi}`));
  if (!work) return null;
  const referencedIds = (Array.isArray(work.referenced_works) ? work.referenced_works : [])
    .map(id => String(id || "").split("/").pop()).filter(Boolean).slice(0, 100);
  const predecessors = [];
  for (let start = 0; start < referencedIds.length; start += 50) {
    const url = new URL(endpoint);
    url.searchParams.set("filter", `openalex_id:${referencedIds.slice(start, start + 50).join("|")}`);
    url.searchParams.set("per-page", "50");
    url.searchParams.set("select", OPENALEX_LINEAGE_SELECT);
    const payload = await getJson(url);
    (payload?.results || []).forEach(item => {
      const node = lineageNodeFromOpenAlex(item);
      if (node) predecessors.push(node);
    });
  }
  const workId = String(work.id || "").split("/").pop() || "";
  let successors = [];
  if (workId) {
    const url = new URL(endpoint);
    url.searchParams.set("filter", `cites:${workId}`);
    url.searchParams.set("sort", "cited_by_count:desc");
    url.searchParams.set("per-page", "25");
    url.searchParams.set("select", OPENALEX_LINEAGE_SELECT);
    const payload = await getJson(url);
    successors = (payload?.results || []).map(lineageNodeFromOpenAlex).filter(Boolean);
  }
  return { source: "openalex", center: lineageNodeFromOpenAlex(work), predecessors, successors };
}

async function fetchSemanticScholarLineage(doi, options = {}) {
  const cleanDoi = normalizeDoi(doi);
  if (!cleanDoi) return null;
  const fetchImpl = options.fetchImpl || fetch;
  const getJson = async suffix => {
    const request = () => fetchImpl(
      `${SEMANTIC_SCHOLAR_PAPER_ENDPOINT}/DOI:${encodeURIComponent(cleanDoi)}${suffix}`,
      {
        headers: { "User-Agent": "paperHOT/0.1 (local research prototype)", Accept: "application/json" },
        signal: AbortSignal.timeout(20000)
      }
    );
    let response = await request();
    for (let attempt = 0; response.status === 429 && attempt < 2; attempt += 1) {
      const retryAfterSeconds = Number(response.headers?.get?.("retry-after") || 0);
      await sleep(retryAfterSeconds > 0 ? Math.min(retryAfterSeconds * 1000, 30000) : 1500);
      response = await request();
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Semantic Scholar 谱系查询失败：HTTP ${response.status}`);
    return response.json();
  };
  const [references, citations] = await Promise.all([
    getJson(`/references?fields=${SEMANTIC_SCHOLAR_LINEAGE_FIELDS},isInfluential&limit=100`),
    getJson(`/citations?fields=${SEMANTIC_SCHOLAR_LINEAGE_FIELDS},isInfluential&limit=100`)
  ]);
  if (!references && !citations) return null;
  const predecessors = (references?.data || [])
    .map(entry => lineageNodeFromSemanticScholar(entry?.citedPaper, entry?.isInfluential)).filter(Boolean);
  const successors = (citations?.data || [])
    .map(entry => lineageNodeFromSemanticScholar(entry?.citingPaper, entry?.isInfluential)).filter(Boolean);
  return { source: "semanticscholar", center: null, predecessors, successors };
}
```

在 `module.exports`（:7589 起，字母序）加入：`fetchOpenAlexLineage`、`fetchSemanticScholarLineage`、`lineageNodeFromOpenAlex`、`lineageNodeFromSemanticScholar`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check paperhot_backend.cjs && node test\paperhot_backend.test.cjs`
Expected: 新增 3 个测试 PASS，既有测试全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add paperhot_backend.cjs test/paperhot_backend.test.cjs
git commit -m "feat: fetch citation lineage from openalex and semantic scholar"
```

---

### Task 2: 合并去重与排序

**Files:**
- Modify: `paperhot_backend.cjs`（紧接 Task 1 新块之后）
- Modify: `paperhot_backend.cjs` `module.exports`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: `normalizeDoi`、`normalizedTitleKey`（:5009）、Task 1 的 node 结构。
- Produces:
  - `lineageNodeKey(node) -> string`（`doi:<doi>` 或 `title:<titleKey>:<year>` 或 `""`）
  - `mergeLineageNodes(lists: node[][]) -> node[]`
  - `rankLineageNodes(nodes: node[], archivePapers: paper[], limit = 6) -> node[]`，返回节点额外带 `inArchive: boolean`、`archiveKey: string`（本地库 stable key：`id || doi || url || title`）

- [ ] **Step 1: 写失败测试**

```js
test("mergeLineageNodes dedupes by normalized doi and keeps the most complete fields", () => {
  const merged = mergeLineageNodes([
    [{ doi: "10.1234/w2", openAlexId: "W2", semanticScholarId: "", title: "Ref A", year: 2020, published: "2020-03-15", journal: "Nature Methods", abstract: "Short", citationCount: 480, authors: ["Alice Chen"], isInfluential: false }],
    [{ doi: "10.1234/W2", openAlexId: "", semanticScholarId: "s2-refa", title: "Ref A", year: null, published: "", journal: "", abstract: "A much longer and more complete abstract", citationCount: 500, authors: [], isInfluential: true }]
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].abstract, "A much longer and more complete abstract");
  assert.equal(merged[0].citationCount, 500);
  assert.equal(merged[0].isInfluential, true);
  assert.equal(merged[0].openAlexId, "W2");
  assert.equal(merged[0].semanticScholarId, "s2-refa");
  assert.equal(merged[0].published, "2020-03-15");
});

test("mergeLineageNodes falls back to title+year matching when doi is missing", () => {
  const merged = mergeLineageNodes([
    [{ doi: "", openAlexId: "", semanticScholarId: "a", title: "Deep Ideas!", year: 2018, published: "", journal: "", abstract: "", citationCount: 3, authors: [], isInfluential: false }],
    [{ doi: "", openAlexId: "", semanticScholarId: "b", title: "deep ideas", year: 2018, published: "", journal: "CVPR", abstract: "", citationCount: null, authors: [], isInfluential: false }],
    [{ doi: "", openAlexId: "", semanticScholarId: "c", title: "deep ideas", year: 2021, published: "", journal: "", abstract: "", citationCount: null, authors: [], isInfluential: false }]
  ]);
  assert.equal(merged.length, 2, "同标题不同年份是两篇论文");
  assert.equal(merged[0].journal, "CVPR");
});

test("rankLineageNodes keeps all archive papers first then fills with influential and high-citation nodes", () => {
  const node = (doi, title, cites, influential = false) => ({ doi, openAlexId: "", semanticScholarId: "", title, year: 2020, published: "", journal: "", abstract: "", citationCount: cites, authors: [], isInfluential: influential });
  const nodes = [
    node("10.1/a", "In archive low cites", 1),
    node("10.1/b", "External influential", 40, true),
    node("10.1/c", "External high cites", 900),
    node("10.1/d", "External mid", 100),
    node("", "Archive matched by title", 2),
    node("10.1/f", "External low", 5),
    node("10.1/g", "External lower", 4),
    node("10.1/h", "External lowest", 3)
  ];
  const archive = [
    { id: "paper-a", doi: "https://doi.org/10.1/A", title: "In archive low cites" },
    { doi: "", url: "https://x.test/t", title: "Archive Matched By Title" }
  ];
  const ranked = rankLineageNodes(nodes, archive, 6);
  assert.equal(ranked.length, 6);
  assert.deepEqual(ranked.slice(0, 2).map(n => n.inArchive), [true, true]);
  assert.equal(ranked[0].archiveKey, "paper-a");
  assert.equal(ranked[1].archiveKey, "https://x.test/t");
  assert.equal(ranked[2].title, "External influential", "isInfluential 优先于被引次数");
  assert.equal(ranked[3].title, "External high cites");
  assert.equal(ranked[4].title, "External mid");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_backend.test.cjs`
Expected: `mergeLineageNodes is not a function`。

- [ ] **Step 3: 实现**

```js
function lineageNodeKey(node) {
  if (!node) return "";
  if (node.doi) return `doi:${node.doi}`;
  const titleKey = normalizedTitleKey(node.title);
  return titleKey ? `title:${titleKey}:${node.year || ""}` : "";
}

function mergeLineageNodes(lists) {
  const byKey = new Map();
  lists.flat().filter(Boolean).forEach(node => {
    const key = lineageNodeKey(node);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...node });
      return;
    }
    if (String(node.abstract || "").length > String(existing.abstract || "").length) existing.abstract = node.abstract;
    if ((node.citationCount ?? -1) > (existing.citationCount ?? -1)) existing.citationCount = node.citationCount;
    existing.isInfluential = existing.isInfluential || Boolean(node.isInfluential);
    ["doi", "openAlexId", "semanticScholarId", "journal", "published"].forEach(field => {
      if (!existing[field] && node[field]) existing[field] = node[field];
    });
    if (!existing.year && node.year) existing.year = node.year;
    if ((node.authors?.length || 0) > (existing.authors?.length || 0)) existing.authors = node.authors;
  });
  return [...byKey.values()];
}

function rankLineageNodes(nodes, archivePapers, limit = 6) {
  const archiveByDoi = new Map();
  const archiveByTitle = new Map();
  (archivePapers || []).forEach(paper => {
    const doi = normalizeDoi(paper?.doi);
    if (doi && !archiveByDoi.has(doi)) archiveByDoi.set(doi, paper);
    const titleKey = normalizedTitleKey(paper?.title);
    if (titleKey && !archiveByTitle.has(titleKey)) archiveByTitle.set(titleKey, paper);
  });
  const decorated = (nodes || []).map(node => {
    const match = (node.doi && archiveByDoi.get(node.doi))
      || archiveByTitle.get(normalizedTitleKey(node.title))
      || null;
    const archiveKey = match ? String(match.id || match.doi || match.url || match.title || "").trim() : "";
    return { ...node, inArchive: Boolean(match), archiveKey };
  });
  const local = decorated.filter(node => node.inArchive);
  const external = decorated.filter(node => !node.inArchive).sort((a, b) =>
    (Number(b.isInfluential) - Number(a.isInfluential))
    || ((b.citationCount ?? -1) - (a.citationCount ?? -1)));
  return [...local, ...external.slice(0, Math.max(0, limit - local.length))];
}
```

`module.exports` 加入：`lineageNodeKey`、`mergeLineageNodes`、`rankLineageNodes`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check paperhot_backend.cjs && node test\paperhot_backend.test.cjs`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add paperhot_backend.cjs test/paperhot_backend.test.cjs
git commit -m "feat: merge dedupe and rank citation lineage nodes"
```

---

### Task 3: 编排函数 buildPaperLineage（并行、Crossref 兜底、磁盘缓存）

**Files:**
- Modify: `paperhot_backend.cjs`（常量区加 `LINEAGE_CACHE_DIR_NAME`、`LINEAGE_CACHE_TTL_MS`；函数紧接 Task 2 之后）
- Modify: `paperhot_backend.cjs` `module.exports`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: Task 1/2 全部函数；既有 `readPaperByKey`（:5962，实现时确认其参数形式并对齐——若只接受 `(key)` 则内部用 `DATA_DIR`，测试需通过 `options.dataDir` 传临时目录，必要时给 `readPaperByKey` 透传 `dataDir`，保持向后兼容默认值）、`readPaperArchive(dataDir)`（:5834）、`fetchCrossrefWorkByDoi(doi, options)`（:4190，实现时确认返回的是 Crossref `message` 对象还是整个响应，reference 数组取自 `message.reference`）、`hashText`（:4000）、`writeJsonFile`（:2316）、`DATA_DIR`。
- Produces:
  - `buildPaperLineage(key, options = {}) -> Promise<payload>`；payload 成功形如 `{ ok: true, center: {title, doi, key}, predecessors: node[], successors: node[], sources: string[], reason?: "no-doi", fetchedAt: ISOString }`，失败 `{ ok: false, error: "not-found", message: "未找到论文" }`。
  - `key` 也接受裸 DOI（`10.` 开头）：本地库查不到但 key 可归一化为 DOI 时仍构建谱系（供外部论文临时详情页递归追溯），此时 `center.title` 取信源返回的标题。
  - `lineageCacheFileName(doi) -> string`（`hashText("lineage:" + doi) + ".json"`）
  - options 支持：`dataDir`、`skipCache`、`now`（毫秒时间戳，测试注入，默认 `Date.now()`）以及透传给信源函数的 `fetchImpl`/`config`/`academicApis`。

- [ ] **Step 1: 写失败测试**

```js
test("buildPaperLineage merges parallel sources, ranks against archive and caches to disk", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
      mode: "archive", papers: [
        { id: "local-main", doi: "10.1234/main", title: "Main paper" },
        { id: "local-ref", doi: "10.1234/w2", title: "Ref A" }
      ]
    }), "utf8");
    let fetchCalls = 0;
    const options = {
      dataDir: tempDir,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "", maxPages: 1, perPage: 100 },
      academicApis: { contactEmail: "researcher@example.org" },
      fetchImpl: async (url) => {
        fetchCalls += 1;
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar")) {
          if (target.includes("/references")) return { ok: true, status: 200, json: async () => ({ data: [
            { isInfluential: true, citedPaper: { paperId: "s2-w2", title: "Ref A", year: 2020, venue: "", abstract: "Long shared abstract", citationCount: 500, externalIds: { DOI: "10.1234/W2" }, authors: [] } }
          ] }) };
          return { ok: true, status: 200, json: async () => ({ data: [] }) };
        }
        if (target.includes("/doi:10.1234/main")) return { ok: true, status: 200, json: async () => ({
          id: "https://openalex.org/W1", doi: "https://doi.org/10.1234/main", title: "Main paper",
          publication_year: 2024, publication_date: "2024-05-01", cited_by_count: 10,
          referenced_works: ["https://openalex.org/W2"], authorships: [], primary_location: {}
        }) };
        if (target.includes("openalex_id")) return { ok: true, status: 200, json: async () => ({ results: [
          { id: "https://openalex.org/W2", doi: "10.1234/w2", title: "Ref A", publication_year: 2020, cited_by_count: 480, authorships: [], primary_location: {}, referenced_works: [] }
        ] }) };
        if (target.includes("cites")) return { ok: true, status: 200, json: async () => ({ results: [
          { id: "https://openalex.org/W9", doi: "10.9/z", title: "Citing paper", publication_year: 2025, cited_by_count: 7, authorships: [], primary_location: {}, referenced_works: [] }
        ] }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    };
    const payload = await buildPaperLineage("10.1234/main", options);
    assert.equal(payload.ok, true);
    assert.deepEqual([...payload.sources].sort(), ["openalex", "semanticscholar"]);
    assert.equal(payload.predecessors.length, 1, "双信源同一篇 Ref A 去重为一个节点");
    assert.equal(payload.predecessors[0].inArchive, true);
    assert.equal(payload.predecessors[0].archiveKey, "local-ref");
    assert.equal(payload.predecessors[0].abstract, "Long shared abstract");
    assert.equal(payload.predecessors[0].citationCount, 500);
    assert.equal(payload.successors[0].title, "Citing paper");
    const cacheFiles = await fs.readdir(path.join(tempDir, "lineage"));
    assert.equal(cacheFiles.length, 1);
    const callsAfterFirst = fetchCalls;
    const cached = await buildPaperLineage("10.1234/main", options);
    assert.equal(cached.predecessors[0].archiveKey, "local-ref");
    assert.equal(fetchCalls, callsAfterFirst, "第二次命中缓存，不再发外部请求");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("buildPaperLineage survives one failing source and falls back to crossref when both fail", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-fb-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
      mode: "archive", papers: [{ id: "local-main", doi: "10.1234/main", title: "Main paper" }]
    }), "utf8");
    const oneSourceDown = await buildPaperLineage("10.1234/main", {
      dataDir: tempDir, skipCache: true,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar")) return { ok: true, status: 200, json: async () => ({ data: [
          { isInfluential: false, citedPaper: { paperId: "p", title: "Only S2 ref", year: 2019, venue: "", abstract: "", citationCount: 9, externalIds: {}, authors: [] } }
        ] }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    });
    assert.deepEqual(oneSourceDown.sources, ["semanticscholar"]);
    assert.equal(oneSourceDown.predecessors[0].title, "Only S2 ref");

    const crossrefFallback = await buildPaperLineage("10.1234/main", {
      dataDir: tempDir, skipCache: true,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("crossref")) return { ok: true, status: 200, json: async () => ({ message: {
          reference: [{ DOI: "10.5/old", "article-title": "Crossref ref", year: "2001" }]
        } }) };
        return { ok: false, status: 503, json: async () => ({}) };
      }
    });
    assert.deepEqual(crossrefFallback.sources, ["crossref"]);
    assert.equal(crossrefFallback.predecessors[0].doi, "10.5/old");
    assert.equal(crossrefFallback.predecessors[0].year, 2001);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("buildPaperLineage returns empty lineage without doi and not-found for unknown keys", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-nodoi-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
      mode: "archive", papers: [{ id: "no-doi-paper", doi: "", url: "https://x.test/p", title: "No doi paper" }]
    }), "utf8");
    const empty = await buildPaperLineage("no-doi-paper", { dataDir: tempDir, fetchImpl: async () => { throw new Error("不应发请求"); } });
    assert.equal(empty.ok, true);
    assert.equal(empty.reason, "no-doi");
    assert.deepEqual(empty.predecessors, []);
    const missing = await buildPaperLineage("totally-unknown-key", { dataDir: tempDir });
    assert.equal(missing.ok, false);
    assert.equal(missing.error, "not-found");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("buildPaperLineage ignores corrupted and expired cache files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-cache-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
      mode: "archive", papers: [{ id: "local-main", doi: "10.1234/main", title: "Main paper" }]
    }), "utf8");
    await fs.mkdir(path.join(tempDir, "lineage"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "lineage", lineageCacheFileName("10.1234/main")), "{ corrupted", "utf8");
    const options = {
      dataDir: tempDir,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar") && target.includes("/references")) return { ok: true, status: 200, json: async () => ({ data: [
          { isInfluential: false, citedPaper: { paperId: "p", title: "Fresh ref", year: 2020, venue: "", abstract: "", citationCount: 1, externalIds: {}, authors: [] } }
        ] }) };
        if (target.includes("semanticscholar")) return { ok: true, status: 200, json: async () => ({ data: [] }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    };
    const fresh = await buildPaperLineage("10.1234/main", options);
    assert.equal(fresh.predecessors[0].title, "Fresh ref", "损坏缓存被忽略并重新拉取");
    const cacheFile = path.join(tempDir, "lineage", lineageCacheFileName("10.1234/main"));
    const written = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    written.fetchedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(cacheFile, JSON.stringify(written), "utf8");
    const refetched = await buildPaperLineage("10.1234/main", options);
    assert.equal(refetched.predecessors[0].title, "Fresh ref", "过期缓存触发重新拉取");
    const rewritten = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    assert.ok(Date.parse(rewritten.fetchedAt) > Date.now() - 60000, "缓存已用新数据覆写");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_backend.test.cjs`
Expected: `buildPaperLineage is not a function`。

- [ ] **Step 3: 实现**

常量区加：

```js
const LINEAGE_CACHE_DIR_NAME = "lineage";
const LINEAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LINEAGE_TARGET_COUNT = 6;
```

函数（紧接 Task 2 新块之后）：

```js
function lineageCacheFileName(doi) {
  return `${hashText(`lineage:${normalizeDoi(doi)}`)}.json`;
}

async function readLineageCache(doi, dataDir, ttlMs) {
  try {
    const file = path.join(dataDir, LINEAGE_CACHE_DIR_NAME, lineageCacheFileName(doi));
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    if (payload?.ok && Date.now() - Date.parse(payload.fetchedAt || 0) < ttlMs) return payload;
  } catch {
    // 缓存缺失或损坏时忽略，回落到重新拉取
  }
  return null;
}

async function fetchCrossrefLineagePredecessors(doi, options = {}) {
  try {
    const item = await fetchCrossrefWorkByDoi(doi, options);
    const references = Array.isArray(item?.reference) ? item.reference : [];
    const nodes = references.map(ref => {
      const title = compactText(ref?.["article-title"] || ref?.unstructured || "");
      const refDoi = normalizeDoi(ref?.DOI || "");
      if (!title && !refDoi) return null;
      return {
        doi: refDoi, openAlexId: "", semanticScholarId: "",
        title: title || refDoi,
        year: Number.parseInt(ref?.year, 10) || null,
        published: "", journal: compactText(ref?.["journal-title"] || ""),
        abstract: "", citationCount: null, authors: [], isInfluential: false
      };
    }).filter(Boolean);
    return nodes.length ? nodes : null;
  } catch {
    return null;
  }
}

async function buildPaperLineage(key, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const lookup = await readPaperByKey(key, options);
  const paper = lookup?.ok ? lookup.paper : null;
  const doi = normalizeDoi(paper?.doi || key);
  if (!paper && !/^10\./.test(doi)) return { ok: false, error: "not-found", message: "未找到论文" };
  const centerKey = paper ? String(paper.id || paper.doi || paper.url || paper.title || "").trim() : doi;
  const center = { title: compactText(paper?.displayTitle || paper?.title || ""), doi, key: centerKey };
  if (!doi) {
    return { ok: true, center, predecessors: [], successors: [], sources: [], reason: "no-doi", fetchedAt: new Date().toISOString() };
  }
  if (!options.skipCache) {
    const cached = await readLineageCache(doi, dataDir, LINEAGE_CACHE_TTL_MS);
    if (cached) return cached;
  }
  const [openAlex, semanticScholar] = (await Promise.allSettled([
    fetchOpenAlexLineage(doi, options),
    fetchSemanticScholarLineage(doi, options)
  ])).map(result => (result.status === "fulfilled" ? result.value : null));
  const sources = [];
  if (openAlex) sources.push("openalex");
  if (semanticScholar) sources.push("semanticscholar");
  if (!center.title && openAlex?.center?.title) center.title = openAlex.center.title;
  let predecessorLists = [openAlex?.predecessors || [], semanticScholar?.predecessors || []];
  if (!openAlex && !semanticScholar) {
    const crossref = await fetchCrossrefLineagePredecessors(doi, options);
    if (crossref) {
      predecessorLists = [crossref];
      sources.push("crossref");
    }
  }
  const archive = await readPaperArchive(dataDir);
  const payload = {
    ok: true,
    center,
    predecessors: rankLineageNodes(mergeLineageNodes(predecessorLists), archive.papers, LINEAGE_TARGET_COUNT),
    successors: rankLineageNodes(mergeLineageNodes([openAlex?.successors || [], semanticScholar?.successors || []]), archive.papers, LINEAGE_TARGET_COUNT),
    sources,
    fetchedAt: new Date().toISOString()
  };
  if (sources.length) {
    await writeJsonFile(path.join(dataDir, LINEAGE_CACHE_DIR_NAME, lineageCacheFileName(doi)), payload);
  }
  return payload;
}
```

**实现时核对两处并对齐**（不要照抄假设）：① `readPaperByKey`（:5962）当前签名——若不接受第二参数，给它加可选 `options = {}` 并从 `options.dataDir` 读目录，默认 `DATA_DIR`，不改既有调用方行为；② `fetchCrossrefWorkByDoi`（:4190）返回的是 `message` 还是完整响应——若是完整响应则取 `item.message.reference`，同步修正上面 `fetchCrossrefLineagePredecessors` 与 Task 3 测试里 crossref mock 的形状。

`module.exports` 加入：`buildPaperLineage`、`fetchCrossrefLineagePredecessors`、`lineageCacheFileName`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check paperhot_backend.cjs && node test\paperhot_backend.test.cjs`
Expected: 全部 PASS（含既有 readPaperByKey 相关测试，确认签名兼容）。

- [ ] **Step 5: Commit**

```powershell
git add paperhot_backend.cjs test/paperhot_backend.test.cjs
git commit -m "feat: orchestrate paper lineage with parallel sources and disk cache"
```

---

### Task 4: 外部论文临时详情数据 fetchLineagePaperDetail

**Files:**
- Modify: `paperhot_backend.cjs`（紧接 Task 3 之后）+ `module.exports`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: Task 1 的 fetch/normalize 函数、`mergeLineageNodes`、`openAlexRequestOptions`。
- Produces: `fetchLineagePaperDetail(id, options = {}) -> Promise<{ok:true, paper} | {ok:false, error, message}>`；`id` 为 OpenAlex Work ID（`W\d+`）或 DOI。`paper` 字段对齐本地论文库字段名：`{ id: "lineage:<doi或WID>", doi, title, summary, journal, published, publishedPrecision, citationCount, authors, url, source: "引文谱系", retrievalSource: "lineage" }`——英文摘要放 `summary`（库内无 `abstract` 字段），只有年份时 `published` 存 `"2020"` 且 `publishedPrecision: "year"`。

- [ ] **Step 1: 写失败测试**

```js
test("fetchLineagePaperDetail merges openalex and semantic scholar detail for a doi", async () => {
  const payload = await fetchLineagePaperDetail("10.1234/w2", {
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" },
    fetchImpl: async (url) => {
      const target = String(url instanceof URL ? url.href : url);
      if (target.includes("semanticscholar")) return { ok: true, status: 200, json: async () => ({
        paperId: "s2-w2", title: "Ref A", year: 2020, venue: "CVPR",
        abstract: "A much longer and more complete abstract", citationCount: 500,
        externalIds: { DOI: "10.1234/W2" }, authors: [{ name: "Alice Chen" }]
      }) };
      if (target.includes("/doi:10.1234/w2")) return { ok: true, status: 200, json: async () => ({
        id: "https://openalex.org/W2", doi: "10.1234/w2", title: "Ref A",
        publication_year: 2020, publication_date: "", cited_by_count: 480,
        abstract_inverted_index: { Short: [0] }, authorships: [], primary_location: {}, referenced_works: []
      }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.paper.summary, "A much longer and more complete abstract");
  assert.equal(payload.paper.citationCount, 500);
  assert.equal(payload.paper.journal, "CVPR");
  assert.equal(payload.paper.published, "2020");
  assert.equal(payload.paper.publishedPrecision, "year", "只有年份时不得伪造完整日期");
  assert.equal(payload.paper.url, "https://doi.org/10.1234/w2");
  assert.equal(payload.paper.retrievalSource, "lineage");
});

test("fetchLineagePaperDetail resolves openalex work ids and reports not-found", async () => {
  const byWorkId = await fetchLineagePaperDetail("W2", {
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" },
    fetchImpl: async (url) => {
      const target = String(url instanceof URL ? url.href : url);
      if (target.endsWith("/W2") || target.includes("/W2?")) return { ok: true, status: 200, json: async () => ({
        id: "https://openalex.org/W2", doi: "", title: "No doi work", publication_year: 2018,
        publication_date: "2018-07-01", cited_by_count: 3, authorships: [], primary_location: {}, referenced_works: []
      }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });
  assert.equal(byWorkId.ok, true);
  assert.equal(byWorkId.paper.title, "No doi work");
  assert.equal(byWorkId.paper.published, "2018-07-01");
  assert.equal(byWorkId.paper.publishedPrecision, "day");

  const missing = await fetchLineagePaperDetail("10.9999/none", {
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" },
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "not-found");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_backend.test.cjs`
Expected: `fetchLineagePaperDetail is not a function`。

- [ ] **Step 3: 实现**

```js
function lineagePaperRecord(node) {
  const published = node.published || (node.year ? String(node.year) : "");
  return {
    id: `lineage:${node.doi || node.openAlexId || node.semanticScholarId}`,
    doi: node.doi,
    title: node.title,
    summary: node.abstract,
    journal: node.journal,
    published,
    publishedPrecision: node.published ? "day" : (node.year ? "year" : ""),
    citationCount: node.citationCount,
    authors: node.authors,
    url: node.doi ? `https://doi.org/${node.doi}` : "",
    source: "引文谱系",
    retrievalSource: "lineage"
  };
}

async function fetchLineagePaperDetail(id, options = {}) {
  const raw = String(id || "").trim();
  if (!raw) return { ok: false, error: "missing-id", message: "缺少论文标识" };
  const { config, fetchImpl, headers } = await openAlexRequestOptions(options);
  const endpoint = String(config.endpoint || DEFAULT_OPENALEX_CONFIG.endpoint).replace(/\/$/, "");
  const fetchOpenAlexNode = async pathPart => {
    try {
      const url = new URL(`${endpoint}/${pathPart}`);
      if (config.apiKey) url.searchParams.set("api_key", config.apiKey);
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!response.ok) return null;
      return lineageNodeFromOpenAlex(await response.json());
    } catch {
      return null;
    }
  };
  const fetchSemanticScholarNode = async doi => {
    try {
      const response = await (options.fetchImpl || fetch)(
        `${SEMANTIC_SCHOLAR_PAPER_ENDPOINT}/DOI:${encodeURIComponent(doi)}?fields=${SEMANTIC_SCHOLAR_LINEAGE_FIELDS}`,
        { headers: { "User-Agent": "paperHOT/0.1 (local research prototype)", Accept: "application/json" }, signal: AbortSignal.timeout(20000) }
      );
      if (!response.ok) return null;
      return lineageNodeFromSemanticScholar(await response.json());
    } catch {
      return null;
    }
  };
  let node = null;
  if (/^W\d+$/i.test(raw)) {
    node = await fetchOpenAlexNode(raw.toUpperCase());
  } else {
    const doi = normalizeDoi(raw);
    if (!doi) return { ok: false, error: "invalid-id", message: "无法识别的论文标识" };
    const [openAlexNode, semanticScholarNode] = await Promise.all([
      fetchOpenAlexNode(`doi:${doi}`),
      fetchSemanticScholarNode(doi)
    ]);
    node = mergeLineageNodes([[openAlexNode].filter(Boolean), [semanticScholarNode].filter(Boolean)])[0] || null;
  }
  if (!node) return { ok: false, error: "not-found", message: "未找到该论文的外部元数据" };
  return { ok: true, paper: lineagePaperRecord(node) };
}
```

`module.exports` 加入：`fetchLineagePaperDetail`、`lineagePaperRecord`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check paperhot_backend.cjs && node test\paperhot_backend.test.cjs`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add paperhot_backend.cjs test/paperhot_backend.test.cjs
git commit -m "feat: fetch external lineage paper detail"
```

---

### Task 5: server.cjs 路由

**Files:**
- Modify: `server.cjs:4-44`（require 解构，字母序加 `buildPaperLineage`、`fetchLineagePaperDetail`）
- Modify: `server.cjs` `handleApi`，`/api/papers/by-key` 分支（:517-526）之后
- Test: `test/paperhot_backend.test.cjs`（沿用既有"读 server 源码正则断言"模式）

**Interfaces:**
- Consumes: Task 3 `buildPaperLineage(key)`、Task 4 `fetchLineagePaperDetail(id)`。
- Produces: `GET /api/lineage?key=<stable-key或doi>`、`GET /api/lineage/paper?id=<W-id或doi>`；成功 200 JSON，失败 404 `{ ok:false, error, message }`。

- [ ] **Step 1: 写失败测试**

```js
test("server exposes lineage routes backed by backend orchestrators", async () => {
  const serverSource = await fs.readFile(path.join(__dirname, "..", "server.cjs"), "utf8");
  assert.match(serverSource, /pathname === "\/api\/lineage"/);
  assert.match(serverSource, /pathname === "\/api\/lineage\/paper"/);
  assert.match(serverSource, /buildPaperLineage\(/);
  assert.match(serverSource, /fetchLineagePaperDetail\(/);
});
```

（若测试文件已有读取 `server.cjs` 的辅助变量则复用，勿重复定义。）

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_backend.test.cjs`
Expected: 新测试 FAIL（正则不匹配）。

- [ ] **Step 3: 实现**

在 `handleApi` 的 `/api/papers/by-key` 分支后插入：

```js
  if (req.method === "GET" && pathname === "/api/lineage") {
    const key = url.searchParams.get("key") || "";
    const payload = await buildPaperLineage(key);
    if (!payload.ok) {
      sendJson(res, 404, payload);
      return true;
    }
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/lineage/paper") {
    const id = url.searchParams.get("id") || "";
    const payload = await fetchLineagePaperDetail(id);
    if (!payload.ok) {
      sendJson(res, 404, payload);
      return true;
    }
    sendJson(res, 200, payload);
    return true;
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --check server.cjs && node test\paperhot_backend.test.cjs`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add server.cjs test/paperhot_backend.test.cjs
git commit -m "feat: add lineage api routes"
```

---

### Task 6: 前端谱系板块（SVG 图 + 悬停卡片 + 异步加载）

**Files:**
- Modify: `public/index.html`（JS：`loadPaperDetail` 结束后、`renderPaperDetail` 之前的连续新块；`paperDetailBody` 内加板块；`renderPaperDetail` 内触发加载）
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: 后端 `GET /api/lineage?key=`；既有 `escapeHtml`、`encodePaperRouteKey`、`parseLocationHash`、`currentPageName`、`renderPaperDetailView`、`paperDetailState`。
- Produces（Task 7 依赖）:
  - 状态 `paperLineageState = { status, key, data, error, requestId }`、`paperLineageTrail = []`（session-only）
  - `pushLineageTrail(paper)`、`lineageNodeHref(node) -> "#paper/..." | "#lineage/..." | ""`
  - `paperLineageBlock() -> html string`、`lineageGraphSvg(data) -> svg string`
  - `loadPaperLineage(key, requestId) -> Promise<void>`、`bindLineageTooltips()`

- [ ] **Step 1: 写失败测试**

在 `test/paperhot_frontend.test.cjs` 末尾追加：

```js
test("paper detail renders lineage section with graph, tooltip and async load", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\/api\/lineage\?key=/);
  assert.match(html, /function paperLineageBlock\(/);
  assert.match(html, /function lineageGraphSvg\(/);
  assert.match(html, /function loadPaperLineage\(/);
  assert.match(html, /paper-lineage-section/);
  assert.match(html, /引文谱系/);
  assert.match(html, /暂无谱系数据/);
  assert.match(html, /data-lineage-tooltip/);
  assert.doesNotMatch(html, /localStorage[^\n]*paperLineageTrail/, "追溯路径是 session 状态，不得持久化");
});

test("lineageNodeHref routes archive nodes to paper detail and external nodes to lineage page", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const hrefSource = readNamedFunction(html, "lineageNodeHref", "lineageTrailKeys");
  const api = new Function(`
    function encodePaperRouteKey(value) { return encodeURIComponent(String(value || "").trim()); }
    ${hrefSource}
    return { lineageNodeHref };
  `)();
  assert.equal(api.lineageNodeHref({ inArchive: true, archiveKey: "10.1/a", doi: "10.1/a" }), `#paper/${encodeURIComponent("10.1/a")}`);
  assert.equal(api.lineageNodeHref({ inArchive: false, archiveKey: "", doi: "10.1/b", openAlexId: "W2" }), `#lineage/${encodeURIComponent("10.1/b")}`);
  assert.equal(api.lineageNodeHref({ inArchive: false, archiveKey: "", doi: "", openAlexId: "W3" }), `#lineage/W3`);
  assert.equal(api.lineageNodeHref({ inArchive: false, archiveKey: "", doi: "", openAlexId: "" }), "");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_frontend.test.cjs`
Expected: 两个新测试 FAIL。

- [ ] **Step 3: 实现**

在 `loadPaperDetail` 函数结束（约 :7781）之后、`renderPaperDetail` 之前插入连续块：

```js
let paperLineageState = { status: "idle", key: "", data: null, error: "", requestId: 0 };
const paperLineageTrail = []; // session 内追溯路径，不写 localStorage、不进导出

function lineageNodeHref(node) {
  if (node.inArchive && node.archiveKey) return `#paper/${encodePaperRouteKey(node.archiveKey)}`;
  const external = node.doi || node.openAlexId || "";
  return external ? `#lineage/${encodePaperRouteKey(external)}` : "";
}

function lineageTrailKeys() {
  return new Set(paperLineageTrail.map(entry => entry.doi).filter(Boolean));
}

function pushLineageTrail(paper) {
  const doi = String(paper?.doi || "").trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");
  const title = paper?.displayTitle || paper?.title || "";
  if (!doi && !title) return;
  const last = paperLineageTrail[paperLineageTrail.length - 1];
  if (last && last.doi === doi && last.title === title) return;
  paperLineageTrail.push({ doi, title });
  if (paperLineageTrail.length > 20) paperLineageTrail.shift();
}

function lineageNodeMarkup(entry, index, group, trail) {
  const { node, x, y } = entry;
  const href = lineageNodeHref(node);
  const classes = [
    "lineage-node",
    node.inArchive ? "lineage-node-local" : "lineage-node-external",
    node.doi && trail.has(node.doi) ? "lineage-node-trail" : ""
  ].filter(Boolean).join(" ");
  const title = String(node.title || "");
  const label = title.length > 26 ? `${title.slice(0, 25)}…` : title;
  const influentialMark = node.isInfluential
    ? `<circle class="lineage-influential" cx="${x + 11}" cy="${y - 9}" r="3"></circle>`
    : "";
  const body = `<g class="${classes}" data-lineage-node="${group}-${index}">`
    + `<circle cx="${x}" cy="${y}" r="8"></circle>${influentialMark}`
    + `<text x="${x}" y="${y + 22}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
  return href ? `<a href="${href}" class="lineage-node-link">${body}</a>` : body;
}

function lineageGraphSvg(data) {
  const width = 720;
  const predY = 60;
  const centerY = 170;
  const succY = 280;
  const centerX = width / 2;
  const trail = lineageTrailKeys();
  const place = (nodes, y) => nodes.map((node, index) => ({ node, x: Math.round(width * (index + 1) / (nodes.length + 1)), y }));
  const preds = place(data.predecessors || [], predY);
  const succs = place(data.successors || [], succY);
  const lines = [
    ...preds.map(p => `<line x1="${p.x}" y1="${p.y + 10}" x2="${centerX}" y2="${centerY - 12}"></line>`),
    ...succs.map(p => `<line x1="${centerX}" y1="${centerY + 12}" x2="${p.x}" y2="${p.y - 10}"></line>`)
  ].join("");
  const centerTitle = String(data.center?.title || "");
  const centerLabel = centerTitle.length > 30 ? `${centerTitle.slice(0, 29)}…` : centerTitle;
  const centerMarkup = `<g class="lineage-node lineage-node-center">`
    + `<circle cx="${centerX}" cy="${centerY}" r="10"></circle>`
    + `<text x="${centerX}" y="${centerY + 26}" text-anchor="middle">${escapeHtml(centerLabel)}</text></g>`;
  return `<svg class="lineage-graph" viewBox="0 0 ${width} 340" role="img" aria-label="引文谱系图">`
    + `<text class="lineage-row-label" x="12" y="${predY - 24}">前置论文</text>`
    + `<text class="lineage-row-label" x="12" y="${succY + 40}">后续论文</text>`
    + lines
    + preds.map((entry, index) => lineageNodeMarkup(entry, index, "pred", trail)).join("")
    + centerMarkup
    + succs.map((entry, index) => lineageNodeMarkup(entry, index, "succ", trail)).join("")
    + `</svg>`;
}

function lineageTooltipHtml(node) {
  const bits = [
    `<strong>${escapeHtml(node.title || "")}</strong>`,
    [node.journal, node.year, node.citationCount != null ? `被引 ${node.citationCount}` : "", node.isInfluential ? "高影响力引用" : "", node.inArchive ? "已在论文库" : "外部论文"]
      .filter(Boolean).map(escapeHtml).join(" · ")
  ];
  const abstractText = String(node.abstract || "").trim();
  if (abstractText) bits.push(escapeHtml(abstractText.length > 180 ? `${abstractText.slice(0, 179)}…` : abstractText));
  return bits.filter(Boolean).join("<br>");
}

function paperLineageBlock() {
  const state = paperLineageState;
  let body = "";
  if (state.status === "idle" || state.status === "loading") {
    body = `<div class="empty">正在加载引文谱系…</div>`;
  } else if (state.status === "error") {
    body = `<div class="empty">${escapeHtml(state.error || "谱系加载失败")}</div>`;
  } else if (!state.data || (!(state.data.predecessors || []).length && !(state.data.successors || []).length)) {
    const reason = state.data?.reason === "no-doi" ? "（该论文缺少 DOI）" : "";
    body = `<div class="empty">暂无谱系数据${reason}</div>`;
  } else {
    body = lineageGraphSvg(state.data)
      + `<div class="lineage-tooltip" data-lineage-tooltip>悬停节点查看论文信息，点击节点进入详情。</div>`;
  }
  return `<section class="paper-detail-section paper-lineage-section"><h3>引文谱系</h3>${body}</section>`;
}

function bindLineageTooltips() {
  const tooltip = document.querySelector("[data-lineage-tooltip]");
  if (!tooltip || !paperLineageState.data) return;
  const groups = { pred: paperLineageState.data.predecessors || [], succ: paperLineageState.data.successors || [] };
  document.querySelectorAll("[data-lineage-node]").forEach(element => {
    element.addEventListener("mouseenter", () => {
      const [group, index] = String(element.dataset.lineageNode || "").split("-");
      const node = (groups[group] || [])[Number(index)];
      if (node) tooltip.innerHTML = lineageTooltipHtml(node);
    });
  });
}

async function loadPaperLineage(key, requestId) {
  if (location.protocol === "file:") {
    paperLineageState = { status: "error", key, data: null, error: "请通过本地服务访问后加载谱系", requestId };
    return;
  }
  try {
    const response = await fetch(`/api/lineage?key=${encodeURIComponent(key)}`);
    const payload = await response.json().catch(() => ({}));
    if (paperLineageState.requestId !== requestId) return;
    if (!response.ok || payload.ok === false) {
      paperLineageState = { status: "error", key, data: null, error: payload.message || payload.error || `谱系加载失败（HTTP ${response.status}）`, requestId };
    } else {
      paperLineageState = { status: "ready", key, data: payload, error: "", requestId };
    }
  } catch (error) {
    if (paperLineageState.requestId !== requestId) return;
    paperLineageState = { status: "error", key, data: null, error: "无法连接本地服务，谱系加载失败", requestId };
  }
  if (currentPageName() === "paper" && parseLocationHash().key === key) renderPaperDetailView();
  if (typeof renderLineagePaperView === "function" && currentPageName() === "lineage") renderLineagePaperView();
}
```

接线（三处小改）：

1. `paperDetailBody(paper)`（:7637-7694）末尾、`</article>` 前的引用行块之后加一行：`${paperLineageBlock()}`。
2. `renderPaperDetail(key)`（:7783）内，设置 `paperDetailState` 后加：

```js
  const lineageRequestId = paperLineageState.requestId + 1;
  paperLineageState = { status: "loading", key: cleanKey, data: null, error: "", requestId: lineageRequestId };
  loadPaperLineage(cleanKey, lineageRequestId);
```

（`cleanKey` 为该函数内已有的变量名，实现时以实际变量名为准。）同时在详情进入 ready 态处（有 `paper` 对象后）调用 `pushLineageTrail(paper)`。

3. `renderPaperDetailView()`（:7696）ready 分支的既有 `bindXxx()` 调用序列末尾加 `bindLineageTooltips();`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node test\paperhot_frontend.test.cjs && node test\paperhot_backend.test.cjs`
Expected: 全部 PASS（特别注意 `readNamedFunction` 相邻性断言没有被新块破坏）。

- [ ] **Step 5: Commit**

```powershell
git add public/index.html test/paperhot_frontend.test.cjs
git commit -m "feat: render citation lineage graph on paper detail"
```

---

### Task 7: `#lineage/<id>` 外部论文临时详情页 + 加入论文库

**Files:**
- Modify: `public/index.html`（`parseLocationHash` 加分支；`renderPage` 加分支；新函数续在 Task 6 块之后）
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: 后端 `GET /api/lineage/paper?id=`、既有 `POST /api/archive/candidate`（`addCandidateToArchive` 模式 :7209）、`pageShell`、`normalizePaperForView`、`showToast`、Task 6 全部函数。
- Produces:
  - `parseLocationHash` 识别 `#lineage/<encoded id>` → `{ page: "lineage", key }`
  - `lineagePaperState = { status, key, paper, error, requestId }`
  - `renderLineagePaper(key)`、`renderLineagePaperView()`、`loadLineagePaper(key, requestId)`、`lineagePaperBody(paper)`、`bindLineageArchiveButton()`

- [ ] **Step 1: 写失败测试**

```js
test("lineage hash route opens external paper page with archive button and recursive lineage", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function renderLineagePaper\(/);
  assert.match(html, /\/api\/lineage\/paper\?id=/);
  assert.match(html, /data-lineage-archive/);
  assert.match(html, /加入论文库/);
  const parseSource = readNamedFunction(html, "parseLocationHash", "currentPageName");
  const api = new Function(`
    function decodePaperRouteKey(value) { try { return decodeURIComponent(String(value || "")); } catch { return String(value || ""); } }
    ${parseSource}
    return { parseLocationHash };
  `)();
  const parsed = api.parseLocationHash(`#lineage/${encodeURIComponent("10.1234/w2")}`);
  assert.equal(parsed.page, "lineage");
  assert.equal(parsed.key, "10.1234/w2");
  const paperParsed = api.parseLocationHash("#paper/abc");
  assert.equal(paperParsed.page, "paper", "既有 paper 路由不受影响");
});

test("external lineage paper joins archive through the existing candidate api", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const bindSource = readNamedFunction(html, "bindLineageArchiveButton", "loadLineagePaper");
  assert.match(bindSource, /\/api\/archive\/candidate/);
  assert.match(bindSource, /JSON\.stringify\(\{ paper/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_frontend.test.cjs`
Expected: 两个新测试 FAIL。

- [ ] **Step 3: 实现**

`parseLocationHash`（:3550 附近）在 `paper` 分支后加：

```js
  if (raw === "lineage" || raw.startsWith("lineage/")) {
    const encoded = raw === "lineage" ? "" : raw.slice("lineage/".length);
    return { page: "lineage", key: decodePaperRouteKey(encoded), raw };
  }
```

`renderPage(page, paperKey)`（:9798-9837）在 `page === "paper"` 分支旁并列加：

```js
  if (page === "lineage") {
    renderLineagePaper(paperKey);
    return;
  }
```

（对齐既有 `paper` 分支的实际结构：若它还做了 `lastRenderedPageName` 维护或滚动处理，`lineage` 分支照抄同样的处理。）

新函数（续在 Task 6 块之后）：

```js
let lineagePaperState = { status: "idle", key: "", paper: null, error: "", requestId: 0 };

function lineagePaperBody(paper) {
  const authors = (paper.authors || []).join(", ");
  const metaBits = [
    paper.journal ? `期刊：${escapeHtml(paper.journal)}` : "",
    paper.published ? `发表：${escapeHtml(paper.published)}` : "",
    paper.citationCount != null ? `被引：${paper.citationCount}` : "",
    paper.doi ? `<a href="https://doi.org/${encodeURIComponent(paper.doi)}" target="_blank" rel="noopener">DOI：${escapeHtml(paper.doi)}</a>` : ""
  ].filter(Boolean).join(" · ");
  return `<div class="paper-detail-page">
    <div class="paper-detail-toolbar"><a class="ghost-btn paper-detail-back" href="javascript:history.back()">← 返回</a></div>
    <article class="paper-detail">
      <div class="paper-source-row"><span class="source">引文谱系 · 外部论文</span></div>
      <h2 class="paper-detail-title">${escapeHtml(paper.displayTitle || paper.title || "")}</h2>
      ${authors ? `<div class="paper-authors">${escapeHtml(authors)}</div>` : ""}
      ${metaBits ? `<div class="paper-detail-meta">${metaBits}</div>` : ""}
      <div class="paper-detail-actions"><button class="ghost-btn" data-lineage-archive>＋ 加入论文库</button></div>
      <section class="paper-detail-section"><h3>摘要</h3><p class="paper-detail-body">${escapeHtml(paper.summary || "暂无摘要")}</p></section>
      ${paperLineageBlock()}
    </article>
  </div>`;
}

function renderLineagePaperView() {
  if (lineagePaperState.status === "loading" || lineagePaperState.status === "idle") {
    pageShell("外部论文", "", `<div class="empty">正在加载外部论文信息…</div>`);
    return;
  }
  if (lineagePaperState.status === "error") {
    pageShell("外部论文", "", `<div class="empty">${escapeHtml(lineagePaperState.error)} <button class="ghost-btn" data-lineage-retry>重试</button></div>`);
    const retry = document.querySelector("[data-lineage-retry]");
    if (retry) retry.addEventListener("click", () => renderLineagePaper(lineagePaperState.key));
    return;
  }
  pageShell("外部论文", "", lineagePaperBody(lineagePaperState.paper));
  bindLineageArchiveButton();
  bindLineageTooltips();
}

function bindLineageArchiveButton() {
  const button = document.querySelector("[data-lineage-archive]");
  if (!button) return;
  button.addEventListener("click", async () => {
    const paper = lineagePaperState.paper;
    if (!paper || button.disabled) return;
    button.disabled = true;
    button.textContent = "加入中…";
    try {
      const response = await fetch("/api/archive/candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      showToast(payload.existed ? "这篇论文已存在于全部论文" : "已加入全部论文");
      button.textContent = payload.existed ? "已在论文库" : "已加入论文库";
    } catch (error) {
      showToast("加入论文库失败，请稍后重试");
      button.disabled = false;
      button.textContent = "＋ 加入论文库";
    }
  });
}

async function loadLineagePaper(key, requestId) {
  try {
    const response = await fetch(`/api/lineage/paper?id=${encodeURIComponent(key)}`);
    const payload = await response.json().catch(() => ({}));
    if (lineagePaperState.requestId !== requestId) return;
    if (!response.ok || payload.ok === false || !payload.paper) {
      lineagePaperState = { status: "error", key, paper: null, error: payload.message || payload.error || `未找到论文（HTTP ${response.status}）`, requestId };
    } else {
      lineagePaperState = { status: "ready", key, paper: payload.paper, error: "", requestId };
      pushLineageTrail(payload.paper);
      const lineageRequestId = paperLineageState.requestId + 1;
      paperLineageState = { status: "loading", key: payload.paper.doi || key, data: null, error: "", requestId: lineageRequestId };
      loadPaperLineage(payload.paper.doi || key, lineageRequestId);
    }
  } catch (error) {
    if (lineagePaperState.requestId !== requestId) return;
    lineagePaperState = { status: "error", key, paper: null, error: "无法连接本地服务", requestId };
  }
  if (currentPageName() === "lineage" && parseLocationHash().key === key) renderLineagePaperView();
}

function renderLineagePaper(key) {
  const cleanKey = String(key || "").trim();
  const requestId = lineagePaperState.requestId + 1;
  lineagePaperState = { status: "loading", key: cleanKey, paper: null, error: "", requestId };
  renderLineagePaperView();
  if (cleanKey) loadLineagePaper(cleanKey, requestId);
}
```

**实现时对齐 `pageShell` 的真实签名**（详情页调用形如 `pageShell("论文详情", ..., wrapPaperDetailPage(...))`，:7696 附近可见）——参数个数与含义照抄详情页用法，上面三处 `pageShell("外部论文", "", ...)` 按真实签名修正。函数声明顺序注意：`bindLineageArchiveButton` 必须紧邻在 `loadLineagePaper` 之前（测试 `readNamedFunction(html, "bindLineageArchiveButton", "loadLineagePaper")` 依赖相邻性）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node test\paperhot_frontend.test.cjs`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add public/index.html test/paperhot_frontend.test.cjs
git commit -m "feat: add external lineage paper page with archive opt-in"
```

---

### Task 8: 谱系 CSS（亮色 + 暗色）

**Files:**
- Modify: `public/index.html`（亮色规则加在 `.paper-detail-*` 样式块末尾约 :2389 之后；暗色规则加在 `html[data-theme="dark"]` 区 :2528 附近）
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: Task 6/7 的 class 名。
- Produces: `.lineage-graph`、`.lineage-node`、`.lineage-node-local`、`.lineage-node-external`、`.lineage-node-center`、`.lineage-node-trail`、`.lineage-influential`、`.lineage-row-label`、`.lineage-tooltip` 样式及暗色覆盖。

- [ ] **Step 1: 写失败测试**

```js
test("lineage graph styles cover light and dark themes with trail highlight", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\.lineage-graph\s*\{[\s\S]*?width:\s*100%/);
  assert.match(html, /\.lineage-node-trail\s+circle\s*\{[\s\S]*?stroke:\s*#d4a017/);
  assert.match(html, /html\[data-theme="dark"\][^\{]*\.lineage-graph\s+line/);
  assert.match(html, /html\[data-theme="dark"\][^\{]*\.lineage-tooltip/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test\paperhot_frontend.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

亮色（`.paper-detail-*` 块之后）：

```css
    .paper-lineage-section { overflow-x: auto; }
    .lineage-graph { width: 100%; min-width: 560px; height: auto; display: block; }
    .lineage-graph line { stroke: #c9d6e2; stroke-width: 1.2; }
    .lineage-row-label { font-size: 11px; fill: #65758b; }
    .lineage-node circle { fill: #0b94b2; }
    .lineage-node text { font-size: 11px; fill: #65758b; }
    .lineage-node-external circle { fill: #ffffff; stroke: #0b94b2; stroke-width: 1.5; }
    .lineage-node-center circle { fill: #1f2a40; }
    .lineage-node-center text { font-weight: 600; fill: #1f2a40; }
    .lineage-node-trail circle { stroke: #d4a017; stroke-width: 2.5; }
    .lineage-influential { fill: #d4a017; }
    .lineage-node-link { cursor: pointer; text-decoration: none; }
    .lineage-node-link:hover circle { stroke: #0b94b2; stroke-width: 2.5; }
    .lineage-tooltip { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e7eef3; font-size: 12px; line-height: 1.6; color: #65758b; min-height: 52px; }
```

暗色（`html[data-theme="dark"]` 区）：

```css
    html[data-theme="dark"] .lineage-graph line { stroke: #334456; }
    html[data-theme="dark"] .lineage-row-label,
    html[data-theme="dark"] .lineage-node text { fill: #9aabbf; }
    html[data-theme="dark"] .lineage-node circle { fill: #4ec7e0; }
    html[data-theme="dark"] .lineage-node-external circle { fill: #10161f; stroke: #4ec7e0; }
    html[data-theme="dark"] .lineage-node-center circle { fill: #e8eef7; }
    html[data-theme="dark"] .lineage-node-center text { fill: #e8eef7; }
    html[data-theme="dark"] .lineage-tooltip { border-top-color: #334456; color: #a7b6c9; }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test\paperhot_frontend.test.cjs`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```powershell
git add public/index.html test/paperhot_frontend.test.cjs
git commit -m "feat: style lineage graph for light and dark themes"
```

---

### Task 9: CHANGELOG、README 与端口验证

**Files:**
- Modify: `CHANGELOG.md`（`## 未发布` 区）
- Modify: `README.md`（文档索引已在设计阶段更新；本任务补 plan 文档条目与功能使用说明）

**Interfaces:**
- Consumes: 全部已完成任务。

- [ ] **Step 1: 更新 CHANGELOG**

`## 未发布` 各分类**顶部**插入：

- `### 新增功能`：
  - `- 论文详情页下方新增"引文谱系"点线图：上排前置论文、下排后续论文（本地论文库命中全部保留，其余按高影响力引用和被引次数补充到约 6 篇），节点悬停显示标题、期刊、年份、被引与摘要片段，点击本地库论文进入现有详情页，点击外部论文进入临时详情页并可选择"加入论文库"（不点击不写入本地数据，加入时记录操作日志）；一路追溯经过的论文在图中金色高亮。数据来自 OpenAlex 与 Semantic Scholar 并行拉取、Crossref 兜底，DOI 归一化去重，字段取更完整一方；无 DOI 或信源未收录时显示"暂无谱系数据"，不伪造。`
- `### 配置与数据`：
  - `- 新增谱系磁盘缓存 data/papers/lineage/（30 天有效期，损坏自动忽略重取）；该缓存可随时从外部信源重新计算，属于运行时缓存，不进入一键导出 ZIP，备份格式保持 paperhot-local-data v1 不变。追溯路径为会话内状态，不持久化、不导出。`
- `### 测试与验证`：
  - `- 后端新增引文谱系测试：双信源并行与单信源失败降级、DOI 格式差异去重与字段合并、本地库优先加高被引排序、Crossref 兜底、缓存写入/过期/损坏容错、无 DOI 空谱系；前端新增谱系板块结构、#lineage 路由、外部论文加入论文库与亮暗主题样式测试。`

- [ ] **Step 2: 更新 README**

- 文档索引表 plans 区加：`| docs/superpowers/plans/2026-07-26-citation-lineage-graph.md | 引文谱系图后端信源合并、前端 SVG 图与外部论文临时详情页的 TDD 实施计划 |`
- 在论文详情页使用说明附近补一小段"引文谱系"功能说明（数据来源、约 6 篇筛选规则、外部论文加入库行为、缓存不导出）。

- [ ] **Step 3: 全量测试**

Run: `npm test`
Expected: backend + frontend 全部 PASS。

- [ ] **Step 4: 重启 50751 并验证**

先提醒用户：重启会中断正在进行的抓取请求，页面刷新即可恢复；磁盘数据不受影响。然后：

1. 停止旧进程：`Get-NetTCPConnection -LocalPort 50751 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`（若无进程忽略报错）。
2. 以普通用户权限启动：`node server.cjs --port 50751`（后台）。
3. 验证三件事：新进程启动时间晚于代码修改时间；`Invoke-WebRequest http://127.0.0.1:50751/api/lineage?key=<库中一篇有 DOI 论文的 key>` 返回 200 且 predecessors 非空（选取库里一篇正式发表论文）；`data/papers/lineage/` 下生成了缓存文件且可读写。
4. 浏览器打开一篇论文详情页，确认谱系图渲染、节点点击、外部论文临时页、加入论文库按钮工作正常。

- [ ] **Step 5: 提交前检查 + Commit**

`git status --short` 确认无真实 `config/*.json`、本地论文库、个人资料被纳入。

```powershell
git add CHANGELOG.md README.md
git commit -m "docs: document citation lineage feature"
```
