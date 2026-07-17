# Paper List Filter And Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared paper-type and publication-stage filters plus citation/publication-date sorting to the Today and All Papers side panels without changing persisted paper data.

**Architecture:** Keep the feature inside the existing single-page frontend. Reuse normalized paper fields and existing render/bind cycles, add small shared filter/sort helpers, and cover their observable behavior through the current Node frontend test file.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js built-in test/assert modules.

## Global Constraints

- Reuse `categories`, `publicationStage`, `citationCount`, `published`, and existing frontend helpers; do not add backend APIs, dependencies, or persisted fields.
- Show all six categories: `classic`, `neural`, `bio`, `hardware`, `theory`, and `review`.
- Values within one filter group use OR; category, publication stage, search, time, source tab, and source-specific groups combine with AND.
- Preserve Today source tabs and source-specific filters.
- Remove only the date-precision filter controls; keep `publishedPrecision` and date normalization unchanged.
- Unknown citation counts and invalid publication dates sort after known values in both directions.
- Filter and sort state stays transient and does not enter local data export/import.
- Preserve the unrelated working-tree change in `docs/solutions/runtime-errors/paperhot-service-restart-data-permission.md`.

---

### Task 1: Lock Shared Filter And Sort Semantics

**Files:**
- Modify: `test/paperhot_frontend.test.cjs:194`
- Modify: `test/paperhot_frontend.test.cjs:1220`

**Interfaces:**
- Consumes: `readNamedFunction(html, startName, endName)` from the existing test helpers.
- Produces: executable expectations for `paperMatchesCommonFilters(paper, filters)` and `sortPapersByMode(list, mode, direction)`.

- [ ] **Step 1: Add the failing common-filter test**

```js
test("paper list common filters use OR within groups and AND between groups", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const categorySource = readNamedFunction(html, "paperCategoryKeys", "paperCategoryLabels");
  const filterSource = readNamedFunction(html, "paperMatchesCommonFilters", "paperSortValue");
  const paperMatchesCommonFilters = new Function(`${categorySource}; ${filterSource}; return paperMatchesCommonFilters;`)();
  const filters = { categories: new Set(["hardware", "classic"]), stages: new Set(["formal"]) };

  assert.equal(paperMatchesCommonFilters({ categories: ["hardware"], publicationStage: "formal" }, filters), true);
  assert.equal(paperMatchesCommonFilters({ categories: ["classic"], publicationStage: "preprint" }, filters), false);
  assert.equal(paperMatchesCommonFilters({ categories: ["bio"], publicationStage: "formal" }, filters), false);
});
```

- [ ] **Step 2: Add failing sort tests for known and unknown values**

```js
test("paper list sorting keeps unknown values last in both directions", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const dateSource = readNamedFunction(html, "paperDateValue", "paperDateKey");
  const valueSource = readNamedFunction(html, "paperSortValue", "sortPapersByMode");
  const sortSource = readNamedFunction(html, "sortPapersByMode", "allPaperTimeFilterMode");
  const sortPapersByMode = new Function(`${dateSource}; ${valueSource}; ${sortSource}; return sortPapersByMode;`)();
  const papers = [
    { id: "unknown", citationCount: null, published: "" },
    { id: "low", citationCount: 2, published: "2025-01" },
    { id: "high", citationCount: 10, published: "2026-01-02" }
  ];

  assert.deepEqual(sortPapersByMode(papers, "citation", "asc").map(paper => paper.id), ["low", "high", "unknown"]);
  assert.deepEqual(sortPapersByMode(papers, "citation", "desc").map(paper => paper.id), ["high", "low", "unknown"]);
  assert.deepEqual(sortPapersByMode(papers, "published", "asc").map(paper => paper.id), ["low", "high", "unknown"]);
});
```

- [ ] **Step 3: Run the frontend tests and verify RED**

Run: `node test\paperhot_frontend.test.cjs`

Expected: FAIL because the planned filter/sort helpers are not defined.

### Task 2: Implement Shared Filtering And Sorting

**Files:**
- Modify: `public/index.html:2161-2263`
- Modify: `public/index.html:3638-3781`
- Modify: `public/index.html:4431-4449`

**Interfaces:**
- Consumes: `paperCategoryKeys(paper)`, `paperDateValue(paper, mode)`, and normalized paper records.
- Produces: `paperMatchesCommonFilters(paper, filters) -> boolean`, `paperSortValue(paper, mode) -> { known, value }`, and `sortPapersByMode(list, mode, direction) -> Paper[]`.

- [ ] **Step 1: Add shared options and transient state**

```js
const paperCategoryFilterOptions = [
  ["classic", "偏传统算法"],
  ["neural", "带有神经网络算法"],
  ["bio", "偏生物结果"],
  ["hardware", "偏硬件创新"],
  ["theory", "偏理论创新"],
  ["review", "综述"]
];
const todayCommonPaperFilters = { categories: new Set(), stages: new Set() };
const allCommonPaperFilters = { categories: new Set(), stages: new Set() };
let todayPaperSortMode = "published";
let todayPaperSortDirection = "desc";
```

- [ ] **Step 2: Add shared filter and stable sort helpers**

```js
function paperMatchesCommonFilters(paper, filters) {
  const categories = paperCategoryKeys(paper);
  const stage = String(paper.publicationStage || "formal");
  return (!filters.categories.size || categories.some(category => filters.categories.has(category)))
    && (!filters.stages.size || filters.stages.has(stage));
}

function paperSortValue(paper, mode) {
  if (mode === "citation") {
    if (paper.citationCount === null || paper.citationCount === undefined || paper.citationCount === "") return { known: false, value: 0 };
    const value = Number(paper.citationCount);
    return Number.isFinite(value) ? { known: true, value } : { known: false, value: 0 };
  }
  const value = Date.parse(paperDateValue(paper, mode));
  return Number.isNaN(value) ? { known: false, value: 0 } : { known: true, value };
}

function sortPapersByMode(list, mode, direction) {
  const multiplier = direction === "asc" ? 1 : -1;
  return list
    .map((paper, index) => ({ paper, index, sort: paperSortValue(paper, mode) }))
    .sort((left, right) => {
      if (left.sort.known !== right.sort.known) return left.sort.known ? -1 : 1;
      if (left.sort.value !== right.sort.value) return multiplier * (left.sort.value - right.sort.value);
      return left.index - right.index;
    })
    .map(item => item.paper);
}
```

- [ ] **Step 3: Route both pages through the helpers**

Update `paperMatchesAllFilters` to include `paperMatchesCommonFilters(paper, allCommonPaperFilters)`. Make `sortAllPapers` call `sortPapersByMode(list, allPaperSortMode, allPaperSortDirection)`. Make `todayVisiblePaperList` include the common filter. Route the final `sortPaperTimelinePapers` entrypoint through `sortPapersByMode` for `today` and `all`, so its second sort cannot overwrite citation ordering; keep the existing fetched-time fallback for Favorites.

Keep citation sorting independent from the existing time-axis filter:

```js
function allPaperTimeFilterMode() {
  return allPaperSortMode === "published" ? "published" : "fetched";
}
```

Use this helper in `allPaperTimeBuckets` and `matchesAllPaperDateFilter`.

- [ ] **Step 4: Run the frontend tests and verify GREEN**

Run: `node test\paperhot_frontend.test.cjs`

Expected: PASS, including the new filter and unknown-last sorting tests.

### Task 3: Add Side-Panel Controls And Remove Precision Filters

**Files:**
- Modify: `public/index.html:2237-2255`
- Modify: `public/index.html:3867-3937`
- Modify: `public/index.html:4375-4397`
- Modify: `public/index.html:5297-5313`
- Modify: `test/paperhot_frontend.test.cjs:194-230`
- Modify: `test/paperhot_frontend.test.cjs:1220-1277`

**Interfaces:**
- Consumes: `paperCategoryFilterOptions`, both common-filter state objects, `toggleSetValue`, and existing render functions.
- Produces: `data-paper-common-category`, `data-paper-common-stage`, `data-today-paper-sort`, and existing `data-paper-sort` controls.

- [ ] **Step 1: Add failing structural assertions**

Assert that both side panels contain all six labels, formal/preprint options, citation/publication-date choices, and asc/desc controls. Replace old precision checks with:

```js
assert.doesNotMatch(html, /label: "日期精度"/);
assert.doesNotMatch(html, /label: "日期完整度"/);
assert.doesNotMatch(html, /data-today-filter-key="precision"/);
assert.match(html, /publishedPrecision/);
```

Run: `node test\paperhot_frontend.test.cjs`

Expected: FAIL because common controls are absent and precision groups still exist.

- [ ] **Step 2: Remove only precision filter UI paths**

Delete the Google Scholar `precision` group and All Sources `precision` group from `todaySourceFilterDefinitions`. Remove the unreachable `key === "precision"` branch from `todayFilterValueMatches`. Do not modify paper metadata or date normalization.

- [ ] **Step 3: Render controls with existing styles**

Use `.today-filter-group`, `.today-filter-option`, `.chip`, and `.category-btn`; add no component abstraction. Each side panel renders:

```html
<div class="today-filter-group"><h3>论文类型</h3><!-- six checkboxes --></div>
<div class="today-filter-group"><h3>发表阶段</h3><!-- formal/preprint --></div>
<div class="today-filter-group"><h3>排序</h3><!-- citation/published and asc/desc --></div>
```

Today retains current source-specific groups. All Papers retains the focus-keyword group.

- [ ] **Step 4: Bind controls through current rerender cycles**

For categories and stages, call `toggleSetValue`, reset the page limit, and rerender. Today sorting assigns `todayPaperSortMode` / `todayPaperSortDirection`. All sorting reuses `allPaperSortMode` / `allPaperSortDirection`, keeping top and side controls synchronized.

Make `paperTimelineSortDirection("today")` and `bindPaperTimelineSort` read and update `todayPaperSortDirection`, so clicking a timeline stamp and clicking the right-side direction control operate on the same state.

Today “清空” clears the current source selections and `todayCommonPaperFilters`. All “清空” clears keyword, category, and stage sets without altering the search query or time bucket.

- [ ] **Step 5: Run frontend tests and syntax checks**

Run: `node test\paperhot_frontend.test.cjs`

Expected: all frontend tests PASS, including `frontend embedded script has valid syntax`.

Run: `node --check server.cjs`

Expected: no output and exit code `0`.

### Task 4: Document And Verify The Fixed-Port Service

**Files:**
- Modify: `README.md:150-180`
- Modify: `CHANGELOG.md:18-110`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: completed UI behavior from Tasks 1-3.
- Produces: user documentation and final verification evidence.

- [ ] **Step 1: Update README behavior**

Document six-category and publication-stage filtering, OR-within / AND-between behavior, citation/publication-date sorting, unknown-last behavior, retained source-specific filters, removed precision controls, and transient-state/ZIP boundaries.

- [ ] **Step 2: Update the Unreleased changelog**

Add entries under `新增功能`, `功能优化`, and `测试与验证` for the controls, precision UI removal without metadata deletion, and exact test results.

- [ ] **Step 3: Run final static verification**

Run: `node test\paperhot_frontend.test.cjs`

Expected: all frontend tests pass.

Run: `git diff --check`

Expected: exit code `0`; line-ending warnings are acceptable, whitespace errors are not.

- [ ] **Step 4: Warn before restarting port 50751**

Tell the user that restarting interrupts active fetch requests, the page can be refreshed afterward, and written `archive.json`, `fetch-log.json`, and `operation-log.jsonl` data remains on disk.

- [ ] **Step 5: Restart and verify `http://127.0.0.1:50751`**

Stop only the process listening on port `50751`, then start `node server.cjs --port 50751` as the ordinary user. Verify:

```text
new process start time > public/index.html modification time
GET http://127.0.0.1:50751/ -> HTTP 200
data/papers/recent-fetch-cursors.json -> readable and writable with service-equivalent permissions
```

- [ ] **Step 6: Review final Git scope before commit**

Run: `git status --short` and `git diff --check`. Exclude the pre-existing runtime-error document, report the exact files proposed for staging, and wait for user confirmation before committing as required by `AGENTS.md`.
