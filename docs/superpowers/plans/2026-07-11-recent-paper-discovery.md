# Recent Paper Discovery Implementation Plan

> WoS 时间参数部分已由 `docs/superpowers/plans/2026-07-15-wos-date-and-query.md` 取代。本文 Task 4 中的 `publishTimeSpan` 示例仅保留为历史实施记录，当前实现使用 `modifiedTimeSpan` 和 `sortField=LD+D`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed PaperHot “今日论文” workbench with Boolean keyword discovery, exact-paper lookup, source-specific recent search, durable resume cursors, WoS usage accounting, unified cards, and automatic result loading.

**Architecture:** Extend the existing `paperhot_backend.cjs` normalization and `fetchPaperPayload()` pipeline instead of adding a service layer. Persist user query logic in `data/user/config.json`, persist unfinished source cursors and WoS usage in separate local JSON files, extend the existing `/api/papers/refresh/start` job contract, and render the approved UI in the existing `public/index.html` single-page frontend.

**Tech Stack:** Node.js 20 standard library, CommonJS, native `fetch`, JSON files, single-file HTML/CSS/JavaScript frontend, `node:test`.

## Global Constraints

- Use the existing files and helpers; add no runtime dependency.
- Keep PaperHot on `http://127.0.0.1:50751`; do not open temporary validation ports.
- Before restarting `50751`, warn that active fetches will stop; already-written archive and log files remain safe.
- Do not read, print, export by default, or commit real API keys, user profiles, or local paper data.
- Preserve `paperhot-local-data` backup format version `1`; new fields are optional and backward compatible.
- Update `BACKUP_FORMAT.md`, `README.md`, and `CHANGELOG.md` when persistent data or behavior changes.
- Use native date inputs, `IntersectionObserver`, CSS, and existing JSON helpers.
- Preserve original source titles; normalized titles are internal dedupe keys only.
- Never fabricate `YYYY-01-01` from a year-only date.
- Formal publications and preprints are related versions, not destructive duplicates.
- Before each Git commit, report the exact staged files and wait for user confirmation, per `AGENTS.md`.

---

## File Map

- Modify `paperhot_backend.cjs`: query logic, common metadata, source adapters, cursors, WoS usage, exact lookup, dedupe, archive and export behavior.
- Modify `server.cjs`: extend refresh request/job response and expose WoS usage through existing integration APIs.
- Modify `public/index.html`: workbench, keyword graph, source tabs, cards, failure states, automatic 15-paper batches and WoS usage display.
- Modify `data/user/config.example.json`: optional persisted search logic.
- Modify `config/web-of-science.example.json`: optional citation response mapping only; no secret values.
- Create `data/papers/recent-fetch-cursors.example.json`: documented cursor shape without user data.
- Create `data/papers/web-of-science-usage.example.json`: documented usage shape without account data.
- Modify `BACKUP_FORMAT.md`: default user search logic, optional WoS usage export, excluded runtime cursor.
- Modify `README.md`: user workflow and file map.
- Modify `CHANGELOG.md`: user-visible behavior, configuration/data, visual changes and tests.
- Modify `test/paperhot_backend.test.cjs`: backend behavior and persistence coverage.
- Modify `test/paperhot_frontend.test.cjs`: frontend structure and interaction contract coverage.

### Task 1: Persist and Evaluate Boolean Search Logic

**Files:**
- Modify: `paperhot_backend.cjs:201-230, 860-910, 1482-1492, 4875-4935`
- Modify: `data/user/config.example.json`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces: `cleanSearchLogic(value, keywordConfig) -> { activeKeywords: string[], andEdges: [string, string][] }`
- Produces: `buildSearchExpression(searchLogic) -> string`
- Produces: `paperMatchesSearchLogic(paper, searchLogic) -> boolean`
- Produces: `DEFAULT_USER_CONFIG.searchLogic`

- [ ] **Step 1: Write failing backend tests for cleaning, expression generation and matching**

Add these imports from `paperhot_backend.cjs` and tests near the existing user-config tests:

```js
const {
  buildSearchExpression,
  paperMatchesSearchLogic,
  readUserState,
  writeUserConfig
} = require("../paperhot_backend.cjs");

test("boolean search logic stores AND components joined by OR", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-search-logic-"));
  const configFile = path.join(tempDir, "config.json");
  await writeUserConfig({
    keywords: {
      primary: [{ text: "SIM", enabled: true }, { text: "super-resolution", enabled: true }],
      secondary: [{ text: "RIM", enabled: true }, { text: "inverse problem", enabled: true }],
      inspiration: []
    },
    sources: [],
    searchLogic: {
      activeKeywords: [],
      andEdges: [["SIM", "super-resolution"], ["RIM", "inverse problem"]]
    }
  }, configFile);
  const saved = (await readUserState({ configFile })).config.searchLogic;
  assert.equal(buildSearchExpression(saved), "(SIM AND super-resolution) OR (RIM AND inverse problem)");
  assert.equal(paperMatchesSearchLogic({ title: "RIM solves an inverse problem" }, saved), true);
  assert.equal(paperMatchesSearchLogic({ title: "SIM without the paired term" }, saved), false);
});

test("clear search logic keeps configured keywords", async () => {
  const expression = buildSearchExpression({ activeKeywords: [], andEdges: [] });
  assert.equal(expression, "");
});

test("legacy user config activates its enabled keywords", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-legacy-search-logic-"));
  const configFile = path.join(tempDir, "config.json");
  await fs.writeFile(configFile, JSON.stringify({
    keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [], inspiration: [] },
    sources: []
  }), "utf8");
  const saved = (await readUserState({ configFile })).config.searchLogic;
  assert.deepEqual(saved.activeKeywords, ["SIM"]);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
node --test --test-name-pattern="boolean search logic|clear search logic" test\paperhot_backend.test.cjs
```

Expected: FAIL because the exported query helpers and `searchLogic` persistence do not exist.

- [ ] **Step 3: Implement the minimal query graph model in the existing backend**

Add `searchLogic` to `DEFAULT_USER_CONFIG`, preserve only edges whose endpoints still exist, build connected AND components, and match each component as a phrase-independent all-term check:

```js
function cleanSearchLogic(value, keywordConfig) {
  const hasStoredLogic = value && typeof value === "object"
    && (Array.isArray(value.activeKeywords) || Array.isArray(value.andEdges));
  const available = new Map(
    Object.values(keywordConfig).flat().map(item => [compactText(item.text).toLowerCase(), compactText(item.text)])
  );
  const defaultActive = Object.values(keywordConfig).flat()
    .filter(item => item.enabled !== false)
    .map(item => item.text);
  const activeKeywords = Array.from(new Set((hasStoredLogic ? value.activeKeywords || [] : defaultActive)
    .map(item => available.get(compactText(item).toLowerCase()))
    .filter(Boolean)));
  const andEdges = [];
  const seen = new Set();
  for (const pair of Array.isArray(value?.andEdges) ? value.andEdges : []) {
    const left = available.get(compactText(pair?.[0]).toLowerCase());
    const right = available.get(compactText(pair?.[1]).toLowerCase());
    if (!left || !right || left === right) continue;
    const key = [left.toLowerCase(), right.toLowerCase()].sort().join("::");
    if (!seen.has(key)) andEdges.push([left, right]);
    seen.add(key);
  }
  return { activeKeywords, andEdges };
}

function searchLogicGroups(searchLogic) {
  const graph = new Map();
  for (const [left, right] of searchLogic.andEdges || []) {
    if (!graph.has(left)) graph.set(left, new Set());
    if (!graph.has(right)) graph.set(right, new Set());
    graph.get(left).add(right);
    graph.get(right).add(left);
  }
  const groups = [];
  const visited = new Set();
  for (const keyword of graph.keys()) {
    if (visited.has(keyword)) continue;
    const stack = [keyword];
    const group = [];
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      group.push(current);
      for (const next of graph.get(current) || []) stack.push(next);
    }
    groups.push(group);
  }
  return groups;
}

function buildSearchExpression(searchLogic = {}) {
  const connected = new Set((searchLogic.andEdges || []).flat());
  const clauses = searchLogicGroups(searchLogic).map(group => `(${group.join(" AND ")})`);
  for (const keyword of searchLogic.activeKeywords || []) {
    if (!connected.has(keyword)) clauses.push(keyword);
  }
  return clauses.join(" OR ");
}

function paperMatchesSearchLogic(paper, searchLogic) {
  const text = `${paper.title || ""} ${paper.summary || ""} ${(paper.tags || []).join(" ")}`.toLowerCase();
  const connected = new Set((searchLogic.andEdges || []).flat());
  const groups = searchLogicGroups(searchLogic);
  if (groups.some(group => group.every(keyword => text.includes(keyword.toLowerCase())))) return true;
  return (searchLogic.activeKeywords || []).some(keyword => !connected.has(keyword) && text.includes(keyword.toLowerCase()));
}
```

Update `cleanUserConfig()` to clean keywords first and then `searchLogic`. Export the three public helpers used by tests and later tasks.

- [ ] **Step 4: Update the example config and rerun focused tests**

Add this optional block to `data/user/config.example.json`:

```json
"searchLogic": {
  "activeKeywords": [],
  "andEdges": []
}
```

Run the focused command from Step 2. Expected: PASS.

- [ ] **Step 5: Run backend regression tests**

Run `npm run test:backend`. Expected: all backend tests pass.

- [ ] **Step 6: Commit after explicit approval**

Stage only `paperhot_backend.cjs`, `data/user/config.example.json`, `test/paperhot_backend.test.cjs`, and required changelog lines. Proposed message: `feat: persist boolean paper search logic`.

### Task 2: Normalize Cross-Source Metadata and Version Relationships

**Files:**
- Modify: `paperhot_backend.cjs:472-500, 1810-2005, 2250-2410, 3049-3076, 3620-3795`
- Modify: `config/web-of-science.example.json`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces common paper fields: `displayTitle`, `publishedPrecision`, `publicationStage`, `retrievalSource`, `sourceId`, `citationCount`, `citationSource`, `relatedVersions`
- Produces: `webOfScienceCitationCount(record) -> number | null`
- Produces: `googleScholarCitationCount(item) -> number | null`
- Consumes: existing `completePaperRecord()`, source normalizers, `dedupePapers()` and archive merge helpers

- [ ] **Step 1: Add failing multi-source normalization tests**

```js
const {
  dedupePapers,
  normalizeBioRxivItem,
  normalizeWebOfScienceRecord
} = require("../paperhot_backend.cjs");

test("source normalizers preserve citation database and preprint stage", () => {
  const wos = normalizeWebOfScienceRecord({
    uid: "WOS:0001",
    title: "STRUCTURED ILLUMINATION MICROSCOPY",
    source: { sourceTitle: "Photonix", publishYear: 2026 },
    names: { authors: [{ displayName: "A. Author" }] },
    citations: [{ db: "WOS", count: 18 }]
  });
  assert.equal(wos.retrievalSource, "webofscience");
  assert.equal(wos.sourceId, "WOS:0001");
  assert.equal(wos.citationCount, 18);
  assert.equal(wos.citationSource, "Web of Science");
  assert.equal(wos.publishedPrecision, "year");
  assert.equal(wos.displayTitle, "Structured Illumination Microscopy");

  const preprint = normalizeBioRxivItem({
    doi: "10.1101/2026.01.01.123456",
    title: "A microscopy preprint",
    authors: "A. Author; B. Author",
    date: "2026-01-01",
    category: "Bioengineering"
  });
  assert.equal(preprint.publicationStage, "preprint");
  assert.equal(preprint.citationCount, null);
  assert.equal(preprint.citationSource, "");
});
```

Add a second test with a WoS formal paper and matching bioRxiv paper. Assert both survive `dedupePapers()` and each receives the other ID in `relatedVersions`.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
node --test --test-name-pattern="source normalizers preserve|preprint.*related" test\paperhot_backend.test.cjs
```

Expected: FAIL because the common fields and version links are absent.

- [ ] **Step 3: Extend `completePaperRecord()` and source normalizers**

Use one shared completion point:

```js
function datePrecision(value) {
  const clean = compactText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "day";
  if (/^\d{4}-\d{2}$/.test(clean)) return "month";
  if (/^\d{4}$/.test(clean)) return "year";
  return "unknown";
}

function completePaperRecord(paper) {
  // Keep the existing completion code, then add only normalized optional fields.
  return {
    ...paper,
    retrievalSource: compactText(paper.retrievalSource),
    sourceId: compactText(paper.sourceId || paper.id),
    displayTitle: compactText(paper.displayTitle || formatDisplayTitle(title)),
    publishedPrecision: compactText(paper.publishedPrecision || datePrecision(paper.published)),
    publicationStage: compactText(paper.publicationStage || "formal"),
    citationCount: paper.citationCount === null || paper.citationCount === undefined || paper.citationCount === ""
      ? null
      : (Number.isFinite(Number(paper.citationCount)) ? Number(paper.citationCount) : null),
    citationSource: compactText(paper.citationSource),
    relatedVersions: Array.isArray(paper.relatedVersions) ? paper.relatedVersions.map(compactText).filter(Boolean) : []
  };
}
```

For WoS, read `record.citations` by database name; for SerpApi Scholar, read `item.inline_links?.cited_by?.total`. Set preprint citation fields to null/empty. Add `formatDisplayTitle(title)` that title-cases only all-uppercase/all-lowercase source titles and preserves the explicit acronyms `SIM`, `RIM`, `DNA`, `RNA`, `AI`, `3D`, `2D`, `PSF`, and `OTF`; mixed-case source titles remain unchanged. Export `dedupePapers` for the tests.

- [ ] **Step 4: Preserve formal/preprint pairs and hide lower-priority exact duplicates**

Modify the shared dedupe path once. DOI/source-ID duplicates merge by priority `webofscience > googlescholar > arxiv/biorxiv`; a formal/preprint pair remains separate and gets symmetric `relatedVersions`. Do not alter the append-only archive rule.

```js
const SOURCE_PRIORITY = { webofscience: 4, googlescholar: 3, arxiv: 2, biorxiv: 2 };

function isFormalPreprintPair(left, right) {
  return new Set([left.publicationStage, right.publicationStage]).size === 2
    && [left.publicationStage, right.publicationStage].includes("preprint");
}

function linkRelatedVersions(left, right) {
  left.relatedVersions = Array.from(new Set([...(left.relatedVersions || []), right.id].filter(Boolean)));
  right.relatedVersions = Array.from(new Set([...(right.relatedVersions || []), left.id].filter(Boolean)));
}
```

In `dedupePapers()`, call `linkRelatedVersions()` and keep both records before the normal duplicate merge when `isFormalPreprintPair()` is true. Otherwise retain the record with the higher `SOURCE_PRIORITY` and merge only missing enrichment fields.

- [ ] **Step 5: Add optional response-map documentation and run tests**

Add `"citationCount": "citations"` to `config/web-of-science.example.json` without changing secrets. Run the focused tests, then `npm run test:backend`. Expected: PASS.

- [ ] **Step 6: Commit after explicit approval**

Proposed message: `feat: normalize paper source metadata`.

### Task 3: Persist Recent Fetch Cursors and WoS Usage

**Files:**
- Modify: `paperhot_backend.cjs:1-20, 1430-1475, 2940-3045, 4875-4935`
- Create: `data/papers/recent-fetch-cursors.example.json`
- Create: `data/papers/web-of-science-usage.example.json`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces: `buildDiscoveryTaskFingerprint(input) -> string`
- Produces: `readRecentFetchCursors(dataDir)`, `writeRecentFetchCursor(task, dataDir)`, `clearRecentFetchCursor(fingerprint, dataDir)`
- Produces: `recordWebOfScienceRequest({ status, at }, dataDir)` and `readWebOfScienceUsage(dataDir)`
- Cursor schema: `{ tasks: { [fingerprint]: { query, startDate, endDate, sources, sourcePages, updatedAt } } }`

- [ ] **Step 1: Add failing cursor and usage tests**

```js
test("recent fetch cursor resumes only an identical frozen task", async () => {
  const a = buildDiscoveryTaskFingerprint({
    searchMode: "direction",
    queryExpression: "SIM OR RIM",
    startDate: "2026-04-01",
    endDate: "2026-07-01",
    sources: ["webofscience", "arxiv"]
  });
  const b = buildDiscoveryTaskFingerprint({
    searchMode: "direction",
    queryExpression: "SIM OR RIM",
    startDate: "2026-04-01",
    endDate: "2026-07-02",
    sources: ["webofscience", "arxiv"]
  });
  assert.notEqual(a, b);
});

test("WoS usage counts successful and failed HTTP attempts by month", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-usage-"));
  await recordWebOfScienceRequest({ status: "ok", at: "2026-07-01T01:00:00.000Z" }, tempDir);
  await recordWebOfScienceRequest({ status: "failed", at: "2026-07-02T01:00:00.000Z" }, tempDir);
  const usage = await readWebOfScienceUsage(tempDir, new Date("2026-07-02T12:00:00.000Z"));
  assert.equal(usage.monthCount, 2);
  assert.equal(usage.totalCount, 2);
  assert.equal(usage.months["2026-07"], 2);
  assert.equal(usage.lastStatus, "failed");
});
```

- [ ] **Step 2: Verify focused failures**

Run:

```powershell
node --test --test-name-pattern="recent fetch cursor|WoS usage counts" test\paperhot_backend.test.cjs
```

Expected: FAIL because the cursor and usage APIs do not exist.

- [ ] **Step 3: Implement stable task fingerprints and durable JSON updates**

Use the existing `writeJsonFile()` and `crypto` import. Sort source names and normalize whitespace before hashing:

```js
function buildDiscoveryTaskFingerprint(input = {}) {
  const identity = {
    searchMode: input.searchMode === "exact" ? "exact" : "direction",
    queryExpression: compactText(input.queryExpression).toLowerCase(),
    startDate: compactText(input.startDate),
    endDate: compactText(input.endDate),
    sources: [...new Set(input.sources || [])].map(compactText).sort()
  };
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24);
}
```

Store only the next page for each source. Clear a task only after all enabled sources complete.

- [ ] **Step 4: Implement WoS local usage accounting around each HTTP request**

Call `recordWebOfScienceRequest()` once per actual `fetchImpl()` attempt, in both response and exception paths. Record only status, timestamp and aggregate counts; never record the API key or full request headers.

```js
async function recordWebOfScienceRequest({ status, at = new Date().toISOString() }, dataDir = DATA_DIR) {
  const file = path.join(dataDir, WEB_OF_SCIENCE_USAGE_NAME);
  const usage = await readJsonFile(file, { trackingStartedAt: at, totalCount: 0, months: {}, lastRequestAt: "", lastStatus: "" });
  const month = at.slice(0, 7);
  usage.totalCount = Number(usage.totalCount || 0) + 1;
  usage.months[month] = Number(usage.months[month] || 0) + 1;
  usage.trackingStartedAt ||= at;
  usage.lastRequestAt = at;
  usage.lastStatus = status;
  await writeJsonFile(file, usage);
  return usage;
}
```

Wrap each WoS `fetchImpl()` call with `try/catch`, recording `ok` after a successful HTTP response and `failed` before rethrowing any HTTP or network error.

- [ ] **Step 5: Add example files and run tests**

Use these shapes:

```json
{ "tasks": {} }
```

```json
{ "trackingStartedAt": "", "totalCount": 0, "months": {}, "lastRequestAt": "", "lastStatus": "" }
```

Run focused tests and `npm run test:backend`. Expected: PASS.

- [ ] **Step 6: Commit after explicit approval**

Proposed message: `feat: persist discovery cursors and WoS usage`.

### Task 4: Make Source Fetchers Date-Aware, Resumable and Exact-Search Capable

**Files:**
- Modify: `paperhot_backend.cjs:1800-2010, 2750-3045, 4560-4855`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: Boolean `queryExpression`, frozen date range, cursor APIs and common metadata from Tasks 1-3
- Produces: `detectExactPaperInput(value) -> { type, value }`
- Produces: source fetch options `{ queryExpression, startDate, endDate, startPage, onPageComplete }`
- Produces: `fetchPaperPayload()` result fields `task`, `sourceResults`, `newPapers`, `exactCandidates`

- [ ] **Step 1: Add failing WoS request tests for date and resume**

```js
test("WoS request sends publishTimeSpan and resumes at the saved page", async () => {
  const urls = [];
  await fetchWebOfSciencePapers(["SIM"], {
    config: {
      enabled: true,
      endpoint: "https://api.clarivate.com/apis/wos-starter/v1/documents",
      apiKey: "test-key",
      databaseId: "WOS",
      maxPages: 2,
      pageSize: 50,
      queryTemplate: "TS=({query})",
      request: {
        method: "GET",
        queryName: "q",
        databaseQueryName: "db",
        pageQueryName: "page",
        limitQueryName: "limit",
        apiKeyHeader: "X-ApiKey",
        useApiKeyHeader: true
      },
      responseMap: { items: "hits" }
    },
    queryExpression: "SIM OR RIM",
    startDate: "2026-01-01",
    endDate: "2026-06-30",
    startPage: 4,
    fetchImpl: async url => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ hits: [] }) };
    }
  });
  const request = new URL(urls[0]);
  assert.equal(request.searchParams.get("page"), "4");
  assert.equal(request.searchParams.get("publishTimeSpan"), "2026-01-01+2026-06-30");
  assert.match(request.searchParams.get("q"), /SIM OR RIM/);
});
```

Add equivalent focused tests that bioRxiv receives exact dates, arXiv pages until the first older page, and Google receives the requested expression through SerpApi.

- [ ] **Step 2: Add failing exact-input classification tests**

```js
assert.deepEqual(detectExactPaperInput("10.1038/s41592-026-00001-1"), { type: "doi", value: "10.1038/s41592-026-00001-1" });
assert.deepEqual(detectExactPaperInput("WOS:000123"), { type: "wos-ut", value: "WOS:000123" });
assert.deepEqual(detectExactPaperInput("arXiv:2601.01234"), { type: "arxiv", value: "2601.01234" });
assert.equal(detectExactPaperInput("A full paper title").type, "title");
```

- [ ] **Step 3: Run focused tests and verify failure**

Run `node --test --test-name-pattern="publishTimeSpan|exact-input|bioRxiv receives|arXiv pages" test\paperhot_backend.test.cjs`. Expected: FAIL.

- [ ] **Step 4: Extend existing source fetchers with the shared option names**

For WoS, add `publishTimeSpan`, start at `options.startPage || 1`, call `onPageComplete({ page, nextPage, returned, complete })` after each parsed page, and stop when the response is short. Do not change the configured endpoint.

For arXiv, request newest-first pages and stop once a full page is older than `startDate`. For bioRxiv, keep its exact date endpoint. For Google Scholar, pass the Boolean expression as the SerpApi query and retain year-only precision when no full date exists.

Build arXiv syntax from the graph rather than parsing the display string: each AND component becomes `(all:"A" AND all:"B")`, standalone terms become `all:"A"`, and clauses join with OR. bioRxiv has no keyword query parameter, so apply `paperMatchesSearchLogic()` after its date-bounded response.

Use this WoS pagination shape, preserving the existing request-map fields:

```js
const firstPage = clampPositiveInteger(options.startPage, 1, 1, WEB_OF_SCIENCE_MAX_PAGES_LIMIT);
for (let page = firstPage; page < firstPage + maxPages; page += 1) {
  const url = new URL(config.endpoint);
  url.searchParams.set(request.queryName || "q", buildWebOfScienceQuery(keywords, config.queryTemplate, options.queryExpression));
  url.searchParams.set(request.pageQueryName || "page", String(page));
  url.searchParams.set(request.limitQueryName || "limit", String(pageSize));
  if (options.startDate && options.endDate) {
    url.searchParams.set("publishTimeSpan", `${options.startDate}+${options.endDate}`);
  }
  const response = await fetchImpl(url, requestOptions);
  const payload = await response.json();
  const pageItems = getNestedValue(payload, config.responseMap.items) || [];
  const complete = pageItems.length < pageSize;
  await options.onPageComplete?.({ page, nextPage: page + 1, returned: pageItems.length, complete });
  pages.push(payload);
  if (complete) break;
}
```

- [ ] **Step 5: Add exact lookup branches without a new service layer**

Inside the existing fetch pipeline:

```js
function detectExactPaperInput(value) {
  const clean = compactText(value);
  const doi = normalizeDoi(clean);
  if (doi) return { type: "doi", value: doi };
  if (/^WOS:\d+/i.test(clean)) return { type: "wos-ut", value: clean.toUpperCase() };
  const arxiv = clean.match(/(?:arXiv:|arxiv\.org\/abs\/)(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (arxiv) return { type: "arxiv", value: arxiv[1] };
  if (/^https?:\/\//i.test(clean)) return { type: "url", value: clean };
  return { type: "title", value: clean };
}
```

Reuse the existing `fetchCrossrefWorkByDoi()` for DOI input and export it for tests. Query WoS for UT/DOI, arXiv by ID, and Google Scholar by quoted title when those sources are enabled. Unique identifier matches may enter the normal archive path. Title searches returning multiple close matches return `exactCandidates` and wait for the existing candidate-add action.

- [ ] **Step 6: Replace naive keyword filtering only for direction mode**

Use `paperMatchesSearchLogic()` for direction results. Exact mode bypasses keyword and date filters. Keep domain filtering for direction mode only.

```js
const keywordPapers = options.searchMode === "exact"
  ? dedupedPapers
  : dedupedPapers.filter(paper => paperMatchesSearchLogic(paper, options.searchLogic));
const domainPapers = options.searchMode === "exact"
  ? keywordPapers
  : filterPapersByDomainAnchors(keywordPapers, keywords);
const datePapers = options.searchMode === "exact"
  ? domainPapers
  : filterPapersByStrictDateRange(domainPapers, startDate, endDate);
```

- [ ] **Step 7: Run backend tests**

Run focused tests, then `npm run test:backend`. Expected: PASS.

- [ ] **Step 8: Commit after explicit approval**

Proposed message: `feat: add resumable recent source searches`.

### Task 5: Extend the Existing Refresh Job Contract

**Files:**
- Modify: `server.cjs:1-80, 321-405`
- Modify: `paperhot_backend.cjs:4560-4855, 4875-4935`
- Test: `test/paperhot_backend.test.cjs`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Request body: `{ searchMode, queryExpression, searchLogic, sources, startDate, endDate, resumeMode }`
- Response task: `{ fingerprint, resumable, sourcePages, sourceResults, errors }`
- Existing routes remain: `POST /api/papers/refresh/start`, `GET /api/papers/refresh/status?id=...`

- [ ] **Step 1: Add failing request-contract assertions**

In `test/paperhot_frontend.test.cjs`, read both `public/index.html` and `server.cjs`. Assert the existing refresh endpoint remains `/api/papers/refresh/start`, `buildRefreshOptions()` copies `searchMode`, `queryExpression`, `searchLogic`, `sources`, `startDate`, `endDate`, and `resumeMode`, and the frontend request body emits the same field names. In backend tests, call `fetchPaperPayload()` directly with fake source fetchers and assert its result includes `taskFingerprint`, `sourcePages`, and `sourceResults`.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
node --test --test-name-pattern="refresh request contract|discovery request" test\paperhot_backend.test.cjs test\paperhot_frontend.test.cjs
```

Expected: FAIL because the request contract is not forwarded.

- [ ] **Step 3: Extend `buildRefreshOptions()` and job responses**

```js
function buildRefreshOptions(body, progressHandler) {
  return {
    refresh: true,
    searchMode: body.searchMode === "exact" ? "exact" : "direction",
    queryExpression: String(body.queryExpression || "").trim(),
    searchLogic: body.searchLogic || { activeKeywords: [], andEdges: [] },
    sources: Array.isArray(body.sources) ? body.sources : [],
    startDate: body.startDate,
    endDate: body.endDate,
    resumeMode: ["resume", "restart", "new"].includes(body.resumeMode) ? body.resumeMode : "new",
    onProgress: progressHandler
  };
}
```

Do not add a second in-memory job map. Store durable source pages in the backend cursor file; the server map remains only for live polling.

- [ ] **Step 4: Return explicit resume and failure state**

Ensure status responses preserve `sourcePages`, `errors`, `taskFingerprint`, and the final result so the frontend can distinguish “继续抓取”, “从头重抓” and “开始新抓取”.

```js
current.result = payload;
current.taskFingerprint = payload.taskFingerprint;
current.sourcePages = payload.sourcePages || {};
current.progress = {
  ...(current.progress || {}),
  stage: "done",
  percent: 100,
  message: `完成：最终入库/展示 ${payload.count || 0} 篇`,
  sourcePages: current.sourcePages,
  errors: payload.errors || []
};
```

- [ ] **Step 5: Run server syntax and tests**

Run:

```powershell
node --check server.cjs
npm run test:backend
npm run test:frontend
```

Expected: all pass.

- [ ] **Step 6: Commit after explicit approval**

Proposed message: `feat: extend paper discovery job contract`.

### Task 6: Build the Approved Today-Paper Workbench

**Files:**
- Modify: `public/index.html:730-1365, 1660-1765, 1980-2200, 2460-2550, 3200-3750`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes persisted `userState.config.searchLogic`, source config, refresh task contract and common paper fields
- Produces frontend state `todaySearchMode`, `todaySearchLogic`, `todaySourceTab`, `todayLoadedCounts`

- [ ] **Step 1: Add failing frontend structure tests**

```js
test("today workbench exposes approved discovery controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-search-mode="direction"/);
  assert.match(html, /data-search-mode="exact"/);
  assert.match(html, /data-keyword-clear/);
  assert.match(html, /data-keyword-delete/);
  assert.match(html, /buildTodaySearchExpression/);
  assert.match(html, /继续抓取/);
  assert.match(html, /从头重抓/);
  assert.match(html, /开始新抓取/);
});

test("today results use source tabs and automatic 15-paper batches", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /Web of Science[\s\S]*Google Scholar[\s\S]*arXiv \/ bioRxiv[\s\S]*所有信源/);
  assert.match(html, /const todayPaperBatchSize = 15/);
  assert.match(html, /IntersectionObserver/);
  assert.doesNotMatch(html, /data-load-more-papers/);
});
```

- [ ] **Step 2: Run frontend tests and verify failure**

Run `node --test --test-name-pattern="today workbench|automatic 15-paper" test\paperhot_frontend.test.cjs`. Expected: FAIL.

- [ ] **Step 3: Replace only the current `fetchRangePanel()` and today sidebar**

Keep `paperCard()`, favorites, notes, LLM refresh and current page shell. Add:

- compact mode segmented control;
- exact visible labels `方向检索` and `指定论文` for the two mode buttons;
- read-only direction expression / editable exact input;
- native range select plus date popover;
- per-run source checkboxes;
- keyword chip graph with click OR, drag AND, hover delete and clear logic;
- source tabs in the fixed approved order;
- source-specific filter definitions as plain data objects.

Do not introduce a component framework or external icon package.

The replacement remains one existing-page renderer:

```js
function todayDiscoveryWorkbench() {
  return `
    <section class="discovery-workbench">
      ${todaySearchModeControl()}
      ${todayQueryControl()}
      ${todayRangeControl()}
      ${todaySourceControls()}
      ${todaySearchMode === "direction" ? todayKeywordGraph() : ""}
      ${todayFetchTaskStatus()}
    </section>
    ${todaySourceTabs()}
  `;
}
```

- [ ] **Step 4: Persist keyword edits through the existing user-config endpoint**

Use `POST /api/user/config`. “清空” sends empty `activeKeywords` and `andEdges` but preserves keyword arrays. Per-keyword delete removes that keyword and incident edges. Exact mode never overwrites direction logic.

```js
async function saveTodaySearchLogic() {
  const nextConfig = { ...userConfig, searchLogic: todaySearchLogic };
  const response = await fetch("/api/user/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextConfig)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  userConfig = (await response.json()).config;
}
```

- [ ] **Step 5: Build the refresh request from one state object**

```js
function todayDiscoveryRequestBody(resumeMode) {
  return {
    mode: "recent",
    searchMode: todaySearchMode,
    queryExpression: todaySearchMode === "exact" ? todayExactInput.trim() : buildTodaySearchExpression(todaySearchLogic),
    searchLogic: todaySearchLogic,
    sources: enabledTodaySources(),
    startDate: fetchRange.startDate,
    endDate: fetchRange.endDate,
    resumeMode
  };
}
```

Derive button text only from the returned task fingerprint/resumable state; do not infer resume state from the visible page count.

- [ ] **Step 6: Add automatic result batching**

Set `const todayPaperBatchSize = 15`. Observe a bottom sentinel and increase the active tab limit by 15. Reset only the active tab limit when filters or tabs change.

```js
const todayPaperBatchSize = 15;
const todayLoadedCounts = { webofscience: 15, googlescholar: 15, preprints: 15, all: 15 };

function bindTodayAutoLoad() {
  const sentinel = document.querySelector("[data-today-load-sentinel]");
  if (!sentinel) return;
  new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    todayLoadedCounts[todaySourceTab] += todayPaperBatchSize;
    renderToday();
  }, { rootMargin: "160px" }).observe(sentinel);
}
```

- [ ] **Step 7: Run frontend tests**

Run `npm run test:frontend`. Expected: PASS.

- [ ] **Step 8: Commit after explicit approval**

Proposed message: `feat: redesign today paper discovery workbench`.

### Task 7: Finish Cards, Failure States, WoS Usage, Backup and Verification

**Files:**
- Modify: `public/index.html:745-1080, 1325-1365, 2088-2200, 3265-3295, 4100-4550`
- Modify: `paperhot_backend.cjs:1090-1200, 1524-1795, 3160-3255`
- Modify: `BACKUP_FORMAT.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `test/paperhot_backend.test.cjs`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes common paper fields, errors, source pages and WoS usage from earlier tasks
- Produces final card display, retry controls, masked integration response usage block and compatible backup files

- [ ] **Step 1: Add failing card and failure-state frontend tests**

```js
test("paper cards show authors and source-specific citation placement", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /paperAuthorsLabel/);
  assert.match(html, /paperCitationMetric/);
  assert.match(html, /citationSource/);
  assert.match(html, /retrievalSource === "arxiv"|retrievalSource === "biorxiv"/);
  assert.match(html, /paper-card\.starred/);
  assert.match(html, /background-image/);
});

test("today page exposes source and AI retry failures", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-fetch-failure-details/);
  assert.match(html, /data-retry-source-page/);
  assert.match(html, /data-refresh-paper-llm/);
});
```

- [ ] **Step 2: Add failing backup and WoS usage response tests**

Assert `readIntegrationConfigs()` returns a masked `webOfScience.usage` block without the key. Assert default ZIP includes `data/user/config.json` with `searchLogic`; `includeStats` includes `data/papers/web-of-science-usage.json`; no export contains `recent-fetch-cursors.json`; and integration/API-key files remain absent unless `includeSecrets: true`.

- [ ] **Step 3: Verify failures**

Run matching frontend/backend test patterns. Expected: FAIL.

- [ ] **Step 4: Reorder card metadata without replacing `paperCard()`**

Keep the existing card markup and actions. Add a title row with right-side metric:

- WoS: numeric count plus `WoS 引用`;
- Google Scholar: numeric count plus `Scholar 引用`;
- arXiv/bioRxiv: platform name plus `预印本`;
- remove duplicate WoS/Google source pills;
- show up to three authors plus total count;
- add `.paper-card.starred` with a subtle repeating star background;
- keep favorite always visible and starred appearance stronger than saved-muted.

```js
function paperCitationMetric(paper) {
  if (paper.retrievalSource === "arxiv") return { value: "arXiv", label: "预印本" };
  if (paper.retrievalSource === "biorxiv") return { value: "bioRxiv", label: "预印本" };
  if (paper.citationCount === null || paper.citationCount === undefined) return null;
  return {
    value: String(paper.citationCount),
    label: paper.citationSource === "Web of Science" ? "WoS 引用" : "Scholar 引用"
  };
}
```

- [ ] **Step 5: Render recoverable failures**

Render source/page failures under the fetch workbench, including stored next page and retry action. If AI fails, keep the card and render the existing single-paper LLM retry button next to the error. Keep full details in fetch and operation logs.

```js
function todayFailureRows(errors = []) {
  return errors.map(error => `
    <div class="fetch-failure-row">
      <strong>${escapeHTML(error.label || error.source)}</strong>
      <span>${escapeHTML(error.message)}</span>
      <button class="ghost-btn" data-retry-source-page="${escapeHTML(error.source)}">重试失败页</button>
    </div>
  `).join("");
}
```

The retry button posts the same task fingerprint and `resumeMode: "resume"` to `/api/papers/refresh/start`; do not create a separate retry endpoint.

- [ ] **Step 6: Expose WoS usage in masked integration config and UI**

Return:

```js
usage: {
  todayCount,
  monthCount,
  totalCount,
  months,
  lastRequestAt,
  lastStatus,
  trackingStartedAt
}
```

Display today, current month, cumulative, monthly history, last request and estimated pages in the existing WoS configuration card. Label it “PaperHot 本地统计”.

In `readIntegrationConfigs()`, attach the local usage after masking the integration config:

```js
return {
  llm: maskSecretConfig(llm),
  googleScholar: maskSecretConfig(googleScholar),
  journalMetrics: maskSecretConfig(journalMetrics),
  webOfScience: {
    ...maskSecretConfig(webOfScience),
    usage: await readWebOfScienceUsage(options.dataDir || DATA_DIR)
  }
};
```

- [ ] **Step 7: Update backup implementation and documentation**

When `includeStats` is true, include `data/papers/web-of-science-usage.json`. Never include `recent-fetch-cursors.json`. Update `BACKUP_FORMAT.md`, README file maps and the frontend export explanation. Keep format version 1 and add import tests for old packages without these optional fields.

```js
if (includeStats) {
  files.push({
    path: "data/papers/web-of-science-usage.json",
    content: jsonText(data.papers?.webOfScienceUsage || {
      trackingStartedAt: "",
      totalCount: 0,
      months: {},
      lastRequestAt: "",
      lastStatus: ""
    })
  });
}
```

- [ ] **Step 8: Update changelog categories**

Record entries under `新增功能`, `功能优化`, `视觉改善`, `配置与数据`, and `测试与验证`. State that search logic is exported by default, usage is optional statistics, cursor is local-only, and API keys remain opt-in.

- [ ] **Step 9: Run the full automated verification**

Run:

```powershell
npm test
node --check paperhot_backend.cjs
node --check server.cjs
git diff --check
```

Expected: all tests and syntax checks pass; `git diff --check` produces no errors.

- [ ] **Step 10: Restart and verify fixed port after warning the user**

Warn that active requests on `50751` will stop. Stop the old process, start `node server.cjs --port 50751`, then verify:

- `/api/integrations/config` returns masked WoS config plus usage;
- direction query creates or resumes the correct task;
- exact DOI/title mode returns a paper or candidates;
- source tabs and filters switch without mixing fields;
- scrolling loads batches of 15;
- star, favorite, failure detail and retry controls work.

- [ ] **Step 11: Commit after explicit approval**

Stage only intentional source, test, example and documentation files. Confirm no real `config/*.json`, local `data/papers/*.json`, API keys or user profile files are staged. Proposed message: `feat: ship recent paper discovery workflow`.
