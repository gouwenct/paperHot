# PaperHot Visual Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 中度重塑 PaperHot“今日论文”的视觉层级和状态语法，让用户更快完成“查看抓取状态 -> 扫描标题与推荐理由 -> 判断引用与版本 -> 收藏或标星”。

**Architecture:** 保留 Node.js + 单文件原生 HTML/CSS/JS 架构，只在 `public/index.html` 内建立视觉令牌、调整既有渲染函数和增加少量纯前端临时状态；所有行为回归写入现有 `test/paperhot_frontend.test.cjs`。不改变后端接口、任务指纹、持久化数据或备份格式，性能优化只在浏览器测量证明问题后进入单独修复。

**Tech Stack:** Node.js 20+、原生 HTML/CSS/JavaScript、`node:test`、固定端口 `http://127.0.0.1:50751`、Playwright 浏览器验证。

## Global Constraints

- 保留现有 `public/index.html` 单文件前端结构，不新增框架、运行时依赖或构建步骤。
- 不修改 refresh state/start/status 契约、任务指纹、断点恢复、论文归档、阅读状态或导入导出格式。
- 不引入 GSAP、叙事型滚动动画、营销落地页结构或杂志式大留白。
- 浅色和暗色必须共用语义令牌；青绿色只用于选中、链接和主要操作。
- 动效时长限定为 `120-180ms`，并支持 `prefers-reduced-motion: reduce`。
- 临时筛选不写论文库、不写用户配置、不进入本地数据 ZIP；无需修改 `BACKUP_FORMAT.md`。
- 视口验收固定为 `1440x900`、`1280x720`、`820x1180`、`390x844`。
- 每次修改前端后运行 `npm run test:frontend`；最终运行 `npm test`、语法检查和固定端口运行态验证。
- 每个提交前运行 `git diff --check`，并确认 `.playwright-cli/`、`output/`、真实配置、论文库和 API Key 未被暂存。

## File Map

- Modify: `public/index.html` - 视觉令牌、今日论文层级、论文卡、移动筛选抽屉、响应式与可访问性。
- Modify: `test/paperhot_frontend.test.cjs` - 静态结构、纯函数行为、状态语义和移动端回归。
- Modify: `CHANGELOG.md` - 在“未发布”的“视觉改善”和“测试与验证”记录用户可见结果与验证。
- Modify: `README.md` - 仅在最终行为与现有使用说明不一致时更新；计划文档索引在本计划创建时同步。

---

### Task 1: Establish semantic visual tokens and baseline evidence

**Files:**
- Modify: `test/paperhot_frontend.test.cjs`
- Modify: `public/index.html:7-180`
- Modify: `public/index.html:2350-2542`

**Interfaces:**
- Consumes: existing `html[data-theme="dark"]` theme attribute and `paperhot.theme.v1` preference.
- Produces: CSS custom properties `--canvas`, `--surface-raised`, `--surface-inset`, `--surface-overlay`, `--text-strong`, `--text-body`, `--text-muted`, `--border-subtle`, `--accent`, `--accent-strong`, `--status-success`, `--status-warning`, `--status-danger`, `--status-progress`, `--radius-sm`, `--radius-md`, `--motion-fast`, and `--motion-standard`.

- [ ] **Step 1: Capture the pre-change browser baseline**

Start or confirm the existing fixed-port service without modifying it. Capture light and dark screenshots of `#today` at `1440x900`, `1280x720`, `820x1180`, and `390x844`. Record these values in the execution notes, not in repository data:

```js
const baseline = await page.evaluate(() => ({
  elements: document.querySelectorAll("*").length,
  paperCards: document.querySelectorAll(".paper-card").length,
  domContentLoaded: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd || 0,
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth
}));
```

Expected: screenshots render the current page; `scrollWidth === clientWidth` at all four widths. If the existing page already overflows, record it as a pre-existing defect before continuing.

- [ ] **Step 2: Write the failing token and reduced-motion test**

Append to `test/paperhot_frontend.test.cjs`:

```js
test("visual system uses shared semantic tokens in light and dark themes", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /:root\s*\{[\s\S]*--canvas:[\s\S]*--accent:[\s\S]*--status-danger:[\s\S]*--motion-standard:/);
  assert.match(html, /html\[data-theme="dark"\]\s*\{[\s\S]*--canvas:[\s\S]*--surface-raised:[\s\S]*--text-strong:/);
  assert.match(html, /body\s*\{[\s\S]*color:\s*var\(--text-body\)[\s\S]*background:\s*var\(--canvas\)/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(html, /animation-duration:\s*0\.01ms\s*!important/);
});
```

- [ ] **Step 3: Run the test to verify RED**

Run: `node --test --test-name-pattern="visual system uses shared semantic tokens" test\paperhot_frontend.test.cjs`

Expected: FAIL because `:root` semantic tokens do not exist.

- [ ] **Step 4: Add the token foundation and replace global primitives**

Insert at the start of `<style>` and replace the corresponding hard-coded global declarations:

```css
:root {
  color-scheme: light;
  --canvas: #f4f7f8;
  --surface-raised: #ffffff;
  --surface-inset: #eef3f4;
  --surface-overlay: #ffffff;
  --text-strong: #17252d;
  --text-body: #33454f;
  --text-muted: #687a84;
  --border-subtle: #d7e0e3;
  --accent: #087f78;
  --accent-strong: #05655f;
  --accent-soft: #e4f4f1;
  --status-success: #147a55;
  --status-warning: #a45a0a;
  --status-danger: #b42318;
  --status-progress: #2563a5;
  --radius-sm: 4px;
  --radius-md: 8px;
  --motion-fast: 120ms;
  --motion-standard: 180ms;
}
html[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #11181c;
  --surface-raised: #182126;
  --surface-inset: #202b31;
  --surface-overlay: #243139;
  --text-strong: #edf4f5;
  --text-body: #c9d5d8;
  --text-muted: #91a2a8;
  --border-subtle: #33434a;
  --accent: #49bdb3;
  --accent-strong: #7ad3cb;
  --accent-soft: #173b38;
  --status-success: #55c78f;
  --status-warning: #e5a75f;
  --status-danger: #ef8278;
  --status-progress: #70a7e8;
}
body { color: var(--text-body); background: var(--canvas); }
.hero, .panel, .source-card, .toast, .paper-card {
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}
h1, h2, h3 { color: var(--text-strong); }
.subtitle, .panel-note, .source, .paper-authors { color: var(--text-muted); }
.primary-btn { border-color: var(--accent); background: var(--accent); color: #fff; }
.ghost-btn { border-color: var(--border-subtle); background: var(--surface-raised); color: var(--text-body); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Replace dark-theme selectors that only restate these primitives with the variables above. Keep selectors with genuinely different component semantics, such as starred backgrounds, heatmap levels, tables, and dialogs.

- [ ] **Step 5: Run the frontend suite and inspect both themes**

Run: `npm run test:frontend`

Expected: all frontend tests PASS. Compare light/dark `#today` screenshots against the baseline; content and controls remain present, while surfaces, text and actions use the same semantic hierarchy.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- public/index.html test/paperhot_frontend.test.cjs
git diff --cached --check
git commit -m "feat(ui): establish semantic visual tokens"
```

### Task 2: Make the Today page hierarchy and result overview explicit

**Files:**
- Modify: `test/paperhot_frontend.test.cjs`
- Modify: `public/index.html:1873-2219`
- Modify: `public/index.html:5418-5562`
- Modify: `public/index.html:6606-6637`

**Interfaces:**
- Consumes: `todayPapersForSource()`, `paperLlmFailureForPaper()`, `todayPaperSearchQuery`, `todayFilterSelections`, `todayCommonPaperFilters`, and `paperHeatmapSelectedDays.today`.
- Produces: `todayOverviewFilter: "all" | "new" | "existing" | "pending" | "failed"`, `todayPaperOverviewState(paper)`, `todayOverviewMatches(paper, filter)`, `todayResultOverview(sourcePapers, visiblePapers)`, `todayActiveFilterSummary()`, `clearTodayTemporaryFilters()`, and `bindTodayOverview()`.

- [ ] **Step 1: Write failing pure-function and structure tests**

Append:

```js
test("today overview classifies decision states without changing stored papers", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const stateSource = readNamedFunction(html, "todayPaperOverviewState", "todayOverviewMatches");
  const matchSource = readNamedFunction(html, "todayOverviewMatches", "todayResultOverview");
  const api = new Function("paperLlmFailureForPaper", `${stateSource}; ${matchSource}; return { todayPaperOverviewState, todayOverviewMatches };`)(
    paper => paper.id === "failed" ? { source: "llm" } : null
  );
  assert.deepEqual(api.todayPaperOverviewState({ id: "new", tokenUsage: { status: "已调用 AI" } }), { isNew: true, isExisting: false, isPending: false, isFailed: false });
  assert.equal(api.todayOverviewMatches({ id: "old", archivedBeforeFetch: true }, "existing"), true);
  assert.equal(api.todayOverviewMatches({ id: "failed", abstractStatus: "unconfirmed" }, "failed"), true);
  assert.match(html, /data-today-overview="new"/);
  assert.match(html, /data-today-overview-clear/);
  assert.match(html, /class="today-active-filter-summary"/);
});
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `node --test --test-name-pattern="today overview classifies" test\paperhot_frontend.test.cjs`

Expected: FAIL because `todayPaperOverviewState()` is not defined.

- [ ] **Step 3: Add temporary overview state and classifiers**

Place the state near existing Today filter state and the functions immediately before `todayResultOverview()`:

```js
let todayOverviewFilter = "all";

function todayPaperOverviewState(paper) {
  const isExisting = paper.archivedBeforeFetch === true;
  return {
    isNew: !isExisting,
    isExisting,
    isPending: paper.abstractStatus === "unconfirmed" || paper.tokenUsage?.status !== "已调用 AI",
    isFailed: Boolean(paperLlmFailureForPaper(paper))
  };
}

function todayOverviewMatches(paper, filter = todayOverviewFilter) {
  if (filter === "all") return true;
  const state = todayPaperOverviewState(paper);
  return filter === "new" ? state.isNew
    : filter === "existing" ? state.isExisting
    : filter === "pending" ? state.isPending
    : filter === "failed" ? state.isFailed
    : true;
}
```

Add `.filter(paper => todayOverviewMatches(paper))` as the final filter in `todayVisiblePaperList()`. This state remains memory-only and is reset to `"all"` when a new fetch session becomes active.

- [ ] **Step 4: Render the overview and one-line active-filter summary**

Add:

```js
function todayResultOverview(sourcePapers, visiblePapers) {
  const states = sourcePapers.map(todayPaperOverviewState);
  const items = [
    ["new", "本轮新增", states.filter(item => item.isNew).length],
    ["existing", "已入库", states.filter(item => item.isExisting).length],
    ["pending", "待处理", states.filter(item => item.isPending).length],
    ["failed", "处理失败", states.filter(item => item.isFailed).length]
  ];
  return `<section class="today-result-overview" aria-label="本轮结果概览">
    ${items.map(([key, label, count]) => `<button class="today-overview-item ${todayOverviewFilter === key ? "active" : ""}" type="button" data-today-overview="${key}" aria-pressed="${todayOverviewFilter === key}"><strong>${count}</strong><span>${label}</span></button>`).join("")}
    <div class="today-overview-visible"><strong>${visiblePapers.length}</strong><span>当前显示</span></div>
  </section>`;
}

function todayActiveFilterSummary() {
  const parts = [];
  if (todayOverviewFilter !== "all") parts.push(`概览：${todayOverviewFilter}`);
  if (todayPaperSearchQuery) parts.push(`搜索：${todayPaperSearchQuery}`);
  if (paperHeatmapSelectedDays.today) parts.push(`日期：${paperHeatmapSelectedDays.today}`);
  const sourceFilterCount = Object.values(todayFilterSelections[todaySourceTab] || {}).flat().length;
  const commonFilterCount = todayCommonPaperFilters.categories.size + todayCommonPaperFilters.stages.size;
  if (sourceFilterCount + commonFilterCount) parts.push(`筛选：${sourceFilterCount + commonFilterCount} 项`);
  if (todayPaperSortMode !== "published" || todayPaperSortDirection !== "desc") {
    parts.push(`排序：${todayPaperSortMode === "citation" ? "引用量" : "发表日期"}${todayPaperSortDirection === "asc" ? "升序" : "降序"}`);
  }
  return `<div class="today-active-filter-summary"><span>${parts.length ? escapeHTML(parts.join(" · ")) : "当前显示全部本次结果"}</span>${parts.length ? `<button class="edit-link" type="button" data-today-overview-clear>清除临时条件</button>` : ""}</div>`;
}
```

In `renderToday()`, render `todayResultOverview(sourcePapers, filteredPapers)` and `todayActiveFilterSummary()` between `paperStatusBar("today")` and `paperSearchPanel("today", todayPaperSearchQuery, sourcePapers.length, filteredPapers.length)`. Remove the old two-span `.today-result-summary` block.

- [ ] **Step 5: Bind overview buttons without persistence**

Add and call after each `renderToday()`:

```js
function bindTodayOverview() {
  document.querySelectorAll("[data-today-overview]").forEach(button => {
    button.addEventListener("click", () => {
      todayOverviewFilter = button.getAttribute("data-today-overview") || "all";
      resetTodayLoadedCount();
      renderToday();
    });
  });
  document.querySelector("[data-today-overview-clear]")?.addEventListener("click", () => {
    clearTodayTemporaryFilters();
  });
}
```

Define the shared clear operation immediately before `bindTodayOverview()`:

```js
function clearTodayTemporaryFilters() {
  todayOverviewFilter = "all";
  todayPaperSearchQuery = "";
  todayFilterSelections[todaySourceTab] = {};
  todayCommonPaperFilters.categories.clear();
  todayCommonPaperFilters.stages.clear();
  paperHeatmapSelectedDays.today = "";
  todayPaperSortMode = "published";
  todayPaperSortDirection = "desc";
  resetTodayLoadedCount(todaySourceTab);
  renderToday();
}
```

Replace the existing `[data-today-filter-clear]` click body in `bindTodayDiscovery()` with `clearTodayTemporaryFilters();` so the right-panel “清空” and overview “清除临时条件” have one definition.

At the start of `saveTodayFetchSession(payload, normalizedPapers)`, add `todayOverviewFilter = "all";` so every newly activated result session starts from the unfiltered overview.

Style `.today-discovery-workbench` as the task surface, `.today-result-overview` as a stable five-column summary, and `.today-active-filter-summary` as a low-emphasis inline row. At `max-width: 820px`, use `grid-template-columns: repeat(2, minmax(0, 1fr))`; do not scale font size with viewport width.

- [ ] **Step 6: Run tests and verify Today behavior**

Run: `npm run test:frontend`

Expected: all tests PASS. Browser check: overview counts render, selecting each item only changes the current list, clearing restores all results, and reloading does not persist the overview filter.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- public/index.html test/paperhot_frontend.test.cjs
git diff --cached --check
git commit -m "feat(ui): clarify today result hierarchy"
```

### Task 3: Standardize paper-card scanning order and semantic states

**Files:**
- Modify: `test/paperhot_frontend.test.cjs`
- Modify: `public/index.html:834-1050`
- Modify: `public/index.html:3594-3775`

**Interfaces:**
- Consumes: `paperTitleLink()`, `paperCitationMetric()`, `paperReasonBlock()`, `paperAbstractBlock()`, `paperLlmFailureForPaper()`, `isFavoritePaper()`, `isStarredPaper()`, and existing favorite/star/detail actions.
- Produces: `paperDecisionBadges(paper, scope)` and stable card regions `.paper-card-primary`, `.paper-card-reason`, `.paper-card-meta`, `.paper-card-status`, `.paper-card-actions`, `.paper-more-actions`.

- [ ] **Step 1: Write the failing card-order and status test**

Append:

```js
test("paper cards expose a stable decision-first scan order and text states", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const cardSource = readNamedFunction(html, "paperCard", "timelineItem");
  assert.ok(cardSource.indexOf("paper-card-primary") < cardSource.indexOf("paper-card-reason"));
  assert.ok(cardSource.indexOf("paper-card-reason") < cardSource.indexOf("paper-card-meta"));
  assert.ok(cardSource.indexOf("paper-card-meta") < cardSource.indexOf("paper-card-status"));
  assert.ok(cardSource.indexOf("paper-card-status") < cardSource.indexOf("paper-card-actions"));
  assert.match(html, /function paperDecisionBadges\(/);
  assert.match(html, /已收藏|本轮前已入库/);
  assert.match(html, /class="paper-more-actions"/);
});
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `node --test --test-name-pattern="paper cards expose a stable" test\paperhot_frontend.test.cjs`

Expected: FAIL because the stable region classes and `paperDecisionBadges()` do not exist.

- [ ] **Step 3: Add semantic text badges**

Add before `paperCard()`:

```js
function paperDecisionBadges(paper, scope = "") {
  const badges = [];
  if (scope !== "favorites" && isFavoritePaper(paper)) badges.push(["saved", "已收藏"]);
  if (scope === "today" && paper.archivedBeforeFetch === true) badges.push(["existing", "本轮前已入库"]);
  if (isStarredPaper(paper)) badges.push(["starred", "已标星"]);
  if (paper.abstractStatus === "unconfirmed") badges.push(["pending", "缺少完整摘要"]);
  if (paperLlmFailureForPaper(paper)) badges.push(["failed", "AI 处理失败"]);
  return badges.map(([state, label]) => `<span class="paper-state-badge" data-state="${state}">${label}</span>`).join("");
}
```

- [ ] **Step 4: Reorder the existing card template without changing actions**

Define the action fragments after `reasonBlock`, then replace the current return template with this exact structure:

```js
const detailHash = paperDetailHash(paper);
const workflowButton = scope === "favorites" ? favoritePaperWorkflowButton(paper, scope) : "";
const starButton = `<button class="star-btn ${isStarred ? "starred" : ""}" type="button" data-star-toggle="${paperId}">${isStarred ? "已标星" : "☆ 标星"}</button>`;
const favoriteButton = `<button class="favorite ${isSaved ? "saved" : ""}" type="button" data-favorite="${paperId}">${isSaved ? "已收藏" : "♡ 加入个人收藏"}</button>`;
const detailButton = detailHash
  ? `<a class="ghost-btn paper-detail-action" href="${escapeHTML(detailHash)}">查看详情</a>`
  : "";
const moreContent = `
  ${workflowButton}
  ${llmButton}
  <div class="paper-title-tools">${paperShortTitleEditor(paper)}</div>
  ${abstractBlock}
  <div class="token-usage">
    <span class="score-pill">评分 ${escapeHTML(paper.score)}</span>
    ${paperCategoryEditor(paper)}
  </div>
  <div class="paper-signal-row">
    <span class="match-pill">${escapeHTML(matchLabel)}</span>
    <span>AI Token：${escapeHTML(tokenUsage.total)}</span>
    ${paperBibliography(paper)}
  </div>`;
return `
  <article class="paper-card ${isStarred ? "starred" : ""} ${isPendingFavoriteRead ? "pending-read" : ""} ${isSavedMuted ? "saved-muted" : ""}">
    <div class="paper-card-primary">
      <div class="paper-title-row">
        <h2 class="paper-title">${paperTitleLink(paper)}</h2>
        ${citationMetric ? `<div class="paper-title-metric"><b>${escapeHTML(citationMetric.value)}</b><span>${escapeHTML(citationMetric.label)}</span></div>` : ""}
      </div>
    </div>
    <div class="paper-card-reason">${reasonBlock}</div>
    <div class="paper-card-meta">
      <div class="paper-source-row">
        ${publishedDoiControl}
        ${sourceLabel ? `<span class="source">${escapeHTML(sourceLabel)}</span>` : ""}
        ${journalMetricTags(journalMetrics)}
      </div>
      <div class="paper-authors">${escapeHTML(authorsLabel)}</div>
    </div>
    <div class="paper-card-status">${paperDecisionBadges(paper, scope)}${llmFailureControl}</div>
    <div class="paper-card-actions">
      ${favoriteButton}${starButton}${detailButton}
      <details class="paper-more-actions">
        <summary aria-label="更多论文操作" title="更多论文操作">⋯</summary>
        <div class="paper-more-actions-panel">${moreContent}</div>
      </details>
    </div>
  </article>`;
```

Update the existing test `paper card orders date journal metrics short title and citation controls` so it asserts the new `primary -> reason -> meta -> status -> actions` order instead of requiring the source row before the title. Do not change any existing `data-*` action attribute. The recommendation reason remains directly visible; the full abstract and low-frequency controls move under `.paper-more-actions`.

- [ ] **Step 5: Apply stable card dimensions and semantic styling**

```css
.paper-card { padding: 12px 14px; box-shadow: none; }
.paper-card-primary { display: grid; gap: 6px; }
.paper-title-row { margin: 0; }
.paper-title-row a { color: var(--text-strong); font-size: 15px; font-weight: 700; line-height: 1.45; }
.paper-card-reason { margin-top: 8px; color: var(--text-body); }
.paper-card-meta { display: grid; gap: 4px; margin-top: 8px; }
.paper-card-status, .paper-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.paper-state-badge { padding: 3px 6px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 11px; }
.paper-state-badge[data-state="failed"] { border-color: var(--status-danger); color: var(--status-danger); }
.paper-state-badge[data-state="pending"] { border-color: var(--status-warning); color: var(--status-warning); }
.paper-more-actions { margin-left: auto; position: relative; }
.paper-more-actions > summary { cursor: pointer; color: var(--text-muted); font-size: 12px; }
```

Replace `.saved-muted` opacity-only treatment with a muted surface plus the explicit badge; keep content contrast readable. Preserve the stronger starred treatment in favorites.

- [ ] **Step 6: Run the suite and exercise all card states**

Run: `npm run test:frontend`

Expected: all tests PASS. Browser-check new, existing, saved, starred, missing-abstract and LLM-failed cards. Verify favorite/star/detail work directly and every moved action still works inside “更多”.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- public/index.html test/paperhot_frontend.test.cjs
git diff --cached --check
git commit -m "feat(ui): standardize paper decision cards"
```

### Task 4: Add mobile navigation, filter drawer, and accessibility discipline

**Files:**
- Modify: `test/paperhot_frontend.test.cjs`
- Modify: `public/index.html:2220-2348`
- Modify: `public/index.html:2555-2580`
- Modify: `public/index.html:6593-6604`
- Modify: `public/index.html:7361-7385`
- Modify: `public/index.html:9583-9645`

**Interfaces:**
- Consumes: `pageShell(title, subtitle, body, side, heroActions)`, hash navigation, and page render lifecycle.
- Produces: `.mobile-nav`, `.mobile-nav-item`, `.page-side-panel`, `[data-filter-drawer-toggle]`, `[data-filter-drawer-close]`, and `bindPageSidePanel()`.

- [ ] **Step 1: Write failing mobile and accessibility tests**

Append:

```js
test("mobile navigation and filter drawer preserve every primary workflow", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /class="mobile-nav"[\s\S]*href="#today"[\s\S]*href="#all"[\s\S]*href="#favorites"[\s\S]*href="#config"[\s\S]*href="#tokens"[\s\S]*href="#logs"[\s\S]*href="#about"/);
  assert.match(html, /data-filter-drawer-toggle/);
  assert.match(html, /data-filter-drawer-close/);
  assert.match(html, /function bindPageSidePanel\(/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /@media \(max-width: 820px\)[\s\S]*\.page-side-panel/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
});
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `node --test --test-name-pattern="mobile navigation and filter drawer" test\paperhot_frontend.test.cjs`

Expected: FAIL because the mobile navigation and drawer do not exist.

- [ ] **Step 3: Add the mobile navigation shell**

Insert after the desktop sidebar and before `.main`:

```html
<nav class="mobile-nav" aria-label="主要页面">
  <a class="mobile-nav-item" href="#today">今日</a>
  <a class="mobile-nav-item" href="#all">全部</a>
  <a class="mobile-nav-item" href="#favorites">收藏</a>
  <a class="mobile-nav-item" href="#config">配置</a>
  <a class="mobile-nav-item" href="#tokens">统计</a>
  <a class="mobile-nav-item" href="#logs">日志</a>
  <a class="mobile-nav-item" href="#about">关于</a>
</nav>
```

Update `setActiveNav()` to drive both desktop and mobile links from the same page name:

```js
function setActiveNav(page) {
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(item => {
    item.classList.toggle("active", item.getAttribute("href") === `#${page}`);
  });
}
```

- [ ] **Step 4: Make the existing side panel a single mobile drawer**

Replace `pageShell()` with this version so the side content is emitted exactly once:

```js
function pageShell(title, subtitle, body, side = "", heroActions = "") {
  const sidePanel = side ? `
    <button class="ghost-btn filter-drawer-toggle" type="button" data-filter-drawer-toggle aria-expanded="false">筛选与排序</button>
    <aside class="panel page-side-panel" role="dialog" aria-label="${escapeHTML(title)}筛选与排序" aria-modal="false">
      <button class="ghost-btn filter-drawer-close" type="button" data-filter-drawer-close aria-label="关闭筛选与排序" title="关闭筛选与排序">×</button>
      ${side}
    </aside>` : "";
  return `
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>${title}</h1>
          <div class="subtitle">${subtitle}</div>
        </div>
        ${heroActions ? `<div class="hero-actions">${heroActions}</div>` : ""}
      </div>
    </section>
    ${side ? `<section class="simple-grid"><div>${body}</div>${sidePanel}</section>` : body}
  `;
}
```

Bind it after all page renders:

```js
function bindPageSidePanel() {
  const toggle = document.querySelector("[data-filter-drawer-toggle]");
  const panel = document.querySelector(".page-side-panel");
  const close = document.querySelector("[data-filter-drawer-close]");
  if (!toggle || !panel) return;
  const setOpen = open => {
    panel.toggleAttribute("data-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open) close?.focus();
    else toggle.focus();
  };
  toggle.addEventListener("click", () => setOpen(true));
  close?.addEventListener("click", () => setOpen(false));
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });
}
```

Call `bindPageSidePanel()` once at the end of `renderPage()` after the selected page renderer completes.

- [ ] **Step 5: Add fixed responsive constraints**

```css
.mobile-nav, .filter-drawer-toggle, .filter-drawer-close { display: none; }
@media (max-width: 820px) {
  .app { display: block; padding-top: 48px; }
  .sidebar { display: none; }
  .mobile-nav { position: fixed; inset: 0 0 auto; z-index: 40; height: 48px; display: flex; overflow-x: auto; border-bottom: 1px solid var(--border-subtle); background: var(--surface-overlay); }
  .mobile-nav-item { min-width: 56px; flex: 1 0 56px; display: grid; place-items: center; color: var(--text-muted); font-size: 12px; text-decoration: none; }
  .mobile-nav-item.active { color: var(--accent-strong); box-shadow: inset 0 -2px var(--accent); }
  .simple-grid { display: block; }
  .filter-drawer-toggle, .filter-drawer-close { display: inline-flex; }
  .page-side-panel { position: fixed; z-index: 60; inset: auto 0 0; max-height: min(78vh, 720px); overflow: auto; transform: translateY(102%); transition: transform var(--motion-standard) ease; border-radius: var(--radius-md) var(--radius-md) 0 0; }
  .page-side-panel[data-open] { transform: translateY(0); }
}
```

At `390x844`, confirm labels wrap or truncate without resizing the grid tracks. Keep all action hit targets at least `32x32px`; familiar icons require `title` and `aria-label`.

- [ ] **Step 6: Run tests and keyboard/mobile checks**

Run: `npm run test:frontend`

Expected: all tests PASS. At `820x1180` and `390x844`, verify all seven mobile navigation entries, open/close/Escape for the filter drawer, focus return to the toggle, no background content overlap, and `scrollWidth === clientWidth`.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- public/index.html test/paperhot_frontend.test.cjs
git diff --cached --check
git commit -m "feat(ui): add responsive workbench navigation"
```

### Task 5: Run the evidence-based performance gate

**Files:**
- No repository file changes; record measurements in the task execution report.

**Interfaces:**
- Consumes: Task 1 baseline metrics and Task 2-4 completed UI.
- Produces: a written execution note classifying each candidate as `investigated, no change recommended` or a reproducible performance finding that stops this plan and becomes a separate focused plan.

- [ ] **Step 1: Measure representative Today interactions**

Use the same saved local paper data before and after. Measure initial render and each filter click with two animation frames so DOM work is included:

```js
const measurement = await page.evaluate(async () => {
  const button = document.querySelector('[data-today-overview="new"]');
  const before = performance.now();
  button?.click();
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  return {
    elapsed: performance.now() - before,
    elements: document.querySelectorAll("*").length,
    paperCards: document.querySelectorAll(".paper-card").length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
```

Repeat five times and use the median. Record browser console errors and long tasks over `50ms` using a temporary Playwright `PerformanceObserver`; do not add production instrumentation.

- [ ] **Step 2: Check the five permitted candidates**

Inspect only evidence connected to: independent request waterfalls, duplicate global listeners after rerender, excessive cards beyond the existing batch limit, repeated full-list filtering, and initialization of hidden pages. Do not broaden into a general refactor.

Expected decision rule: if there is no reproducible regression or long task tied to one candidate, record `investigated, no change recommended` and make no code change. If a candidate is reproducible, record the exact action, median time, long-task evidence, affected function and representative data size; stop before changing code and create a separate TDD plan for that one bottleneck. This prevents an unmeasured performance refactor from being smuggled into the visual work.

- [ ] **Step 3: Confirm the gate result**

Expected: either all five candidates are recorded as `investigated, no change recommended`, or the visual implementation pauses with one reproducible finding ready for its own plan. Task 6 proceeds only in the first case or after the separate performance plan has been completed and verified.

### Task 6: Complete cross-page validation, runtime proof, and documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Verify: `public/index.html`
- Verify: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: completed Tasks 1-5.
- Produces: final test evidence, screenshot matrix, fixed-port runtime proof, and user-facing changelog entries.

- [ ] **Step 1: Run static and complete automated checks**

Run:

```powershell
node --check server.cjs
node --check paperhot_backend.cjs
npm test
git diff --check
```

Expected: syntax checks exit `0`; backend and frontend suites PASS; diff check reports no whitespace errors.

- [ ] **Step 2: Restart the fixed port safely**

Before restart, tell the user that an in-progress fetch will be interrupted but data already written to `archive.json`, `fetch-log.json`, and `operation-log.jsonl` will remain. Stop only the process listening on `127.0.0.1:50751`, then start `node server.cjs --port 50751` with normal user permissions.

Expected proof:

- new Node process start time is later than the last `public/index.html` modification time;
- `GET http://127.0.0.1:50751/` returns HTTP `200`;
- the service identity can read and write `data/papers/recent-fetch-cursors.json` without deleting or resetting it.

- [ ] **Step 3: Run the screenshot and interaction matrix**

For light and dark themes at `1440x900`, `1280x720`, `820x1180`, and `390x844`, verify:

- Today task bar, overview, title/reason/card actions and side controls do not overlap;
- long title, missing abstract, LLM failure, saved, starred and fetching states remain readable;
- mobile navigation and filter drawer remain reachable by keyboard;
- no horizontal overflow and no blank canvas;
- browser console has no new errors;
- overview filter, favorite, star, detail, retry and “更多” actions still work.

- [ ] **Step 4: Update changelog and README only for delivered behavior**

Add to `CHANGELOG.md` under `未发布 / 视觉改善`:

```markdown
- 今日论文采用语义信号工作台层级：抓取任务、结果概览、论文决策卡和辅助筛选形成稳定扫描顺序；浅色/暗色共用视觉令牌，移动端新增页面导航与筛选抽屉。筛选状态仍为临时状态，不写论文库、用户配置或本地数据 ZIP。
```

Add under `未发布 / 测试与验证`:

```markdown
- 视觉优化通过前后端完整测试、四档视口浅色/暗色截图、键盘与移动筛选验证，并完成固定端口 50751 的新进程、HTTP 200 和断点文件读写检查；性能门禁已调查五类候选，未发现需要在本批次修改的可重复瓶颈。
```

In `README.md` 的“主题与显示”段落追加：

```markdown
- 窄屏使用顶部页面导航；今日论文、全部论文和个人收藏的右侧筛选在移动端通过“筛选与排序”底部抽屉打开，关闭后保留当前临时筛选。该状态不写入用户配置或本地数据 ZIP。
```

Do not edit `BACKUP_FORMAT.md`.

- [ ] **Step 5: Verify repository scope and commit documentation**

Run:

```powershell
git status --short
git diff --check
git diff -- CHANGELOG.md README.md
```

Expected: no real `config/*.json`, local paper data, API Key, `.playwright-cli/`, or `output/` is staged.

```powershell
git add -- CHANGELOG.md README.md
git diff --cached --check
git commit -m "docs: record PaperHot visual optimization"
```


## Completion Gate

The implementation is complete only when all six tasks are resolved, all automated checks pass, all eight light/dark viewport combinations are inspected, the fixed-port runtime proof succeeds, and any performance recommendation is backed by recorded measurements. A visually improved screenshot without preserved task semantics, keyboard access, or runtime proof is not completion.
