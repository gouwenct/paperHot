const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const htmlFile = path.join(__dirname, "..", "public", "index.html");
const logoFile = path.join(__dirname, "..", "public", "paperhot-logo.png");
const serverFile = path.join(__dirname, "..", "server.cjs");
const backendFile = path.join(__dirname, "..", "paperhot_backend.cjs");
const {
  buildDiscoveryTaskContext,
  buildDiscoveryTaskDescriptor
} = require("../paperhot_backend.cjs");

function readNamedFunction(source, name, nextName) {
  const pattern = new RegExp(`function ${name}\\([\\s\\S]*?(?=\\n\\s*(?:async\\s+)?function ${nextName}\\()`);
  const match = source.match(pattern);
  assert.ok(match, `expected ${name}()`);
  return match[0].trim();
}

test("app exposes Paper Hot logo and favicon", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const logo = await fs.readFile(logoFile);
  assert.match(html, /<link rel="icon" type="image\/png" href="\/paperhot-logo\.png">/);
  assert.match(html, /class="brand-logo"/);
  assert.match(html, /src="\/paperhot-logo\.png"/);
  assert.match(html, /class="brand-text">PAPER<span class="brand-hot">HOT<\/span>/);
  assert.equal(logo.subarray(1, 4).toString("ascii"), "PNG");
});

test("all papers page exposes search and short-title controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-all-paper-search/);
  assert.match(html, /data-short-title-input/);
  assert.match(html, /function inferPaperShortTitle/);
  assert.match(html, /return `\$\{year\}@`/);
  assert.doesNotMatch(html, /paperNoteFor\(paper\)\.shortTitle\s*\|\|\s*paper\.shortTitle\s*\|\|/);
  assert.match(html, /\.short-title-row\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(220px, 1fr\)/);
  assert.match(html, /\.short-title-row\s*\{[\s\S]*flex:\s*1 1 320px/);
  assert.match(html, /\.short-title-input\s*\{[\s\S]*min-width:\s*220px/);
  assert.match(html, /paper-title-row[\s\S]*paperShortTitleEditor\(paper\)/);
  assert.match(html, /paperMatchesSearchQuery/);
});

test("today and favorites pages expose paper search controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /let todayPaperSearchQuery = ""/);
  assert.match(html, /let favoritePaperSearchQuery = ""/);
  assert.match(html, /function paperSearchPanel\(scope, query, totalCount, shownCount\)/);
  assert.match(html, /data-paper-search="\$\{escapeHTML\(scope\)\}"/);
  assert.match(html, /搜索当前抓取结果|搜索收藏论文/);
  assert.match(html, /bindPaperSearch\("today"\)/);
  assert.match(html, /bindPaperSearch\("favorites"\)/);
  assert.match(html, /paperMatchesSearchQuery\(paper, todayPaperSearchQuery\)/);
  assert.match(html, /paperMatchesSearchQuery\(paper, favoritePaperSearchQuery\)/);
});

test("paper card orders date journal metrics short title and citation controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /paper-source-row[\s\S]*publishedDoiControl[\s\S]*sourceLabel[\s\S]*journalMetricTags\(journalMetrics\)/);
  assert.match(html, /精确日期：\$\{escapeHTML\(publishedLabel\)\}/);
  assert.match(html, /paper-title-row[\s\S]*paperTitleLink\(paper\)[\s\S]*citationMetric[\s\S]*<\/div>[\s\S]*paper-title-tools[\s\S]*paperShortTitleEditor\(paper\)/);
  assert.match(html, /paper-signal-row[\s\S]*paperBibliography\(paper\)/);
});

test("paper cards do not present unconfirmed snippets as AI abstract translations", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const abstractSource = readNamedFunction(html, "paperAbstractZh", "paperAbstractBlock");
  const blockSource = readNamedFunction(html, "paperAbstractBlock", "paperReasonBlock");
  const reasonSource = readNamedFunction(html, "paperReasonBlock", "paperJournalMetrics");
  const api = new Function("escapeHTML", `${abstractSource}; ${blockSource}; ${reasonSource}; return { paperAbstractZh, paperAbstractBlock, paperReasonBlock };`)(value => String(value));
  const unconfirmed = { summary: "… search snippet …", abstractStatus: "unconfirmed", abstractZh: "", reason: "不应显示的推荐" };

  assert.equal(api.paperAbstractZh(unconfirmed), "");
  assert.match(api.paperAbstractBlock(unconfirmed), /未获得完整摘要，未进行 AI 分析/);
  assert.doesNotMatch(api.paperAbstractBlock(unconfirmed), /摘要翻译/);
  assert.equal(api.paperReasonBlock(unconfirmed), "");
  assert.match(api.paperAbstractBlock({ abstractStatus: "confirmed", abstractZh: "完整中文摘要。" }), /摘要翻译.*完整中文摘要。/);
  assert.match(html, /data-retry-firecrawl-abstract/);
  assert.match(html, /Firecrawl 重抓/);
  assert.match(html, /data-manual-abstract/);
  assert.match(html, /保存并交给 AI/);
  assert.match(html, /abstractMode:\s*"firecrawl"/);
  assert.match(html, /manualAbstract/);
});

test("paper cards show authors and source-specific title metrics with starred backgrounds", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function paperCitationMetric\(/);
  assert.match(html, /function paperAuthorsLabel\(/);
  assert.match(html, /class="paper-title-metric"/);
  assert.match(html, /class="paper-authors"/);
  assert.match(html, /paper-card \$\{isStarred \? "starred" : ""\}/);
  assert.match(html, /scope === "today" && paper\.archivedBeforeFetch === true/);
  assert.match(html, /\.paper-card\.starred\s*\{[\s\S]*background-image:/);

  const metricSource = readNamedFunction(html, "paperCitationMetric", "paperAuthorsLabel");
  const authorsSource = readNamedFunction(html, "paperAuthorsLabel", "paperVisibleSourceLabel");
  const sourceSource = readNamedFunction(html, "paperVisibleSourceLabel", "paperBibliography");
  const api = new Function(`${metricSource}; ${authorsSource}; ${sourceSource}; return { paperCitationMetric, paperAuthorsLabel, paperVisibleSourceLabel };`)();

  assert.deepEqual(api.paperCitationMetric({ retrievalSource: "webofscience", citationCount: 15 }), { value: "15", label: "WoS 引用" });
  assert.deepEqual(api.paperCitationMetric({ retrievalSource: "googlescholar", citationCount: 8 }), { value: "8", label: "Scholar 引用" });
  assert.deepEqual(api.paperCitationMetric({ retrievalSource: "arxiv" }), { value: "arXiv", label: "预印本" });
  assert.deepEqual(api.paperCitationMetric({ retrievalSource: "biorxiv" }), { value: "bioRxiv", label: "预印本" });
  assert.deepEqual(api.paperCitationMetric({ retrievalSource: "webofscience", citationCount: null }), { value: "--", label: "WoS 引用" });
  assert.deepEqual(api.paperCitationMetric({ retrievalSource: "googlescholar" }), { value: "--", label: "Scholar 引用" });
  assert.equal(api.paperAuthorsLabel({ authors: ["A", "B", "C", "D"] }), "A、B、C 等 4 位作者");
  assert.equal(api.paperVisibleSourceLabel({ retrievalSource: "webofscience", source: "Web of Science" }), "");
  assert.equal(api.paperVisibleSourceLabel({ retrievalSource: "webofscience", journal: "Web of Science", source: "Web of Science" }), "");
  assert.equal(api.paperVisibleSourceLabel({ retrievalSource: "googlescholar", journal: "Google Scholar", source: "Google Scholar" }), "");
  assert.equal(api.paperVisibleSourceLabel({ retrievalSource: "webofscience", journal: "Nature Methods" }), "期刊：Nature Methods");
});

test("today page exposes resumable source failures and per-paper AI retry", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-fetch-failure-details/);
  assert.match(html, /data-retry-source-page/);
  assert.match(html, /loadPaperData\("range", true, "resume"\)/);
  assert.match(html, /function paperLlmFailureControl\(/);
  assert.match(html, /data-refresh-paper-llm/);
  assert.match(html, /function removePaperLlmFailure\(/);
  assert.match(html, /clearPaperLlmFailure\(payload\.paper \|\| paper\)/);
  const refreshSource = readNamedFunction(html, "refreshOnePaperLlm", "invalidateTodayCanonicalTask");
  assert.match(refreshSource, /payload\.updated !== true/);
  assert.match(refreshSource, /payload\.errors\?\.\[0\]\?\.message/);
  assert.match(refreshSource, /没有找到这篇论文的当前卡片/);
  assert.match(refreshSource, /keepCurrentForm/);
  assert.match(refreshSource, /findPaperByStableKey\(key\)/);
  assert.ok(refreshSource.indexOf("payload.updated !== true") < refreshSource.indexOf("clearPaperLlmFailure"));
  const lookupSource = readNamedFunction(html, "paperLookupKeys", "paperRetryIdentityMatches");
  const stableSource = readNamedFunction(html, "paperStableKey", "isFavoritePaper");
  const findSource = readNamedFunction(html, "findPaperByStableKey", "updatePaperCategories");
  const findPaperByStableKey = new Function(`
    const recentPapers = [{ id: "transient-id", doi: "10.1000/MANUAL", title: "Manual paper" }];
    const todayPapers = [];
    const favoritePapersCache = [];
    const papers = [];
    function paperLookupPools() {
      return [...recentPapers, ...todayPapers, ...favoritePapersCache, ...papers].filter(Boolean);
    }
    ${lookupSource}; ${stableSource}; ${findSource}; return findPaperByStableKey;
  `)();
  assert.equal(findPaperByStableKey("10.1000/manual").id, "transient-id");
  const manualSource = readNamedFunction(html, "saveManualPaperAbstract", "invalidateTodayCanonicalTask");
  assert.match(manualSource, /button\.disabled = true/);
  assert.match(manualSource, /button\.textContent = "保存中"/);
  assert.match(manualSource, /await refreshOnePaperLlm\(key, \{ manualAbstract \}, \{ keepCurrentForm: true \}\)/);
  assert.match(html, /error\.taskState = status/);

  const failureSource = readNamedFunction(html, "todayFailureRows", "todayDiscoveryWorkbench");
  const todayFailureRows = new Function("escapeHTML", `${failureSource}; return todayFailureRows;`)(value => String(value));
  const rendered = todayFailureRows([
    { source: "webofscience", label: "Web of Science", message: "HTTP 429" },
    { source: "llm", label: "LLM", message: "timeout" }
  ], { webofscience: { nextPage: 3 } }, true);
  assert.match(rendered, /Web of Science/);
  assert.match(rendered, /HTTP 429/);
  assert.match(rendered, /下页 3/);
  assert.match(rendered, /data-retry-source-page="webofscience"/);
  assert.doesNotMatch(rendered, /timeout/);

  const calls = [];
  const saveManualPaperAbstract = new Function("calls", `
    function showToast(message) { calls.push({ toast: message }); }
    async function refreshOnePaperLlm(key, request, ui) {
      calls.push({ key, request, ui });
    }
    ${manualSource.replace(/^function/, "async function")}
    return saveManualPaperAbstract;
  `)(calls);
  const button = {
    disabled: false,
    textContent: "保存并交给 AI",
    isConnected: true,
    getAttribute: () => "paper-key",
    closest: () => ({ querySelector: () => ({ value: " Complete verified abstract. " }) })
  };
  await saveManualPaperAbstract(button);
  assert.deepEqual(calls.at(-1), {
    key: "paper-key",
    request: { manualAbstract: "Complete verified abstract." },
    ui: { keepCurrentForm: true }
  });
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "保存并交给 AI");

  const identitySource = readNamedFunction(html, "paperRetryIdentityMatches", "paperLooksLikeGeneratedSummary");
  const removeSource = readNamedFunction(html, "removePaperLlmFailure", "paperLlmFailureForPaper");
  const removePaperLlmFailure = new Function(`${identitySource}; ${removeSource}; return removePaperLlmFailure;`)();
  const remaining = removePaperLlmFailure([
    { source: "llm", message: "target", paper: { doi: "10.1/target" } },
    { source: "llm", message: "other", paper: { doi: "10.1/other" } },
    { source: "webofscience", message: "HTTP 429", paper: { doi: "10.1/target" } }
  ], { doi: "10.1/target" });
  assert.deepEqual(remaining.map(error => error.message), ["other", "HTTP 429"]);
});

test("today status bar does not repeat failure details shown in the workbench", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const statusSource = readNamedFunction(html, "paperStatusBar", "fetchProgressPanel");

  assert.doesNotMatch(statusSource, /meta\?\.errors|部分信源失败/);
});

test("per-paper AI failures use conservative paper identity instead of title alone", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const identitySource = readNamedFunction(html, "paperRetryIdentityMatches", "paperLooksLikeGeneratedSummary");
  const paperRetryIdentityMatches = new Function(`${identitySource}; return paperRetryIdentityMatches;`)();

  assert.equal(paperRetryIdentityMatches(
    { doi: "https://doi.org/10.1000/SAME" },
    { doi: "10.1000/same" }
  ), true);
  assert.equal(paperRetryIdentityMatches(
    { doi: "10.1000/first", title: "Shared title" },
    { doi: "10.1000/second", title: "Shared title" }
  ), false);
  assert.equal(paperRetryIdentityMatches(
    { doi: "10.1000/enriched", id: "paper-a" },
    { id: "paper-a" }
  ), true);
  assert.equal(paperRetryIdentityMatches(
    { doi: "10.1000/enriched", retrievalSource: "arxiv", sourceId: "2607.12345" },
    { retrievalSource: "arxiv", sourceId: "2607.12345" }
  ), true);
  assert.equal(paperRetryIdentityMatches(
    { id: "paper-a", title: "Shared title" },
    { id: "paper-b", title: "Shared title" }
  ), false);
  assert.equal(paperRetryIdentityMatches(
    { retrievalSource: "arxiv", sourceId: "2607.12345" },
    { retrievalSource: "arxiv", sourceId: "2607.12345" }
  ), true);
  assert.equal(paperRetryIdentityMatches(
    { title: "Shared title", publicationStage: "formal", authors: ["Alice Smith"] },
    { title: "shared title", publicationStage: "formal", authors: ["A. Smith"] }
  ), true);
});

test("all papers page supports combined filters and OR search", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /selectedAllPaperKeywords/);
  assert.match(html, /allPaperDateFilter/);
  assert.match(html, /allCommonPaperFilters/);
  assert.match(html, /paperMatchesAllFilters/);
  assert.match(html, /splitSearchOrClauses/);
  assert.match(html, /\\s\+OR\\s\+/i);
  assert.match(html, /data-paper-common-category="all"/);
  assert.match(html, /data-paper-common-stage="all"/);
  assert.match(html, /data-all-filter-keyword/);
});

test("paper pages expose daily heatmaps as temporary date filters", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /const paperHeatmapSelectedDays = \{ today: "", all: "", favorites: "" \}/);
  assert.match(html, /function paperHeatmapPanel\(scope, list\)/);
  assert.match(html, /class="paper-heatmap-grid"/);
  assert.match(html, /data-paper-heatmap-day="\$\{escapeHTML\(scope\)\}"/);
  assert.match(html, /data-paper-heatmap-clear="\$\{escapeHTML\(scope\)\}"/);
  assert.match(html, /paperHeatmapPanel\("today", sourcePapers\)/);
  assert.match(html, /paperHeatmapPanel\("all", recentPapers\)/);
  assert.match(html, /paperHeatmapPanel\("favorites", sourcePapers\)/);
  assert.match(html, /matchesPaperHeatmapDay\(paper, "today"\)/);
  assert.match(html, /matchesPaperHeatmapDay\(paper, "all"\)/);
  assert.match(html, /matchesPaperHeatmapDay\(paper, "favorites"\)/);
  assert.match(html, /bindPaperHeatmap\(\)/);
  assert.match(html, /paperHeatmapSelectedDays\[scope\] === date \? "" : date/);
  assert.match(html, /function localDateToKey\(date\)/);
  assert.doesNotMatch(readNamedFunction(html, "shiftDateKey", "paperHeatmapDays"), /toISOString/);
});

test("paper list common filters use OR within groups and AND between groups", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const categorySource = readNamedFunction(html, "paperCategoryKeys", "paperCategoryLabels");
  const filterSource = readNamedFunction(html, "paperMatchesCommonFilters", "paperSortValue");
  const paperMatchesCommonFilters = new Function(`
    const paperCategoryFilterOptions = [["classic", "偏传统算法"], ["neural", "带有神经网络算法"], ["bio", "偏生物结果"], ["hardware", "偏硬件创新"], ["theory", "偏理论创新"], ["review", "综述"]];
    function paperNoteFor(paper) { return paper.note || {}; }
    ${categorySource}; ${filterSource}; return paperMatchesCommonFilters;
  `)();
  const filters = { categories: new Set(["hardware", "classic"]), stages: new Set(["formal"]) };

  assert.equal(paperMatchesCommonFilters({ categories: ["hardware"], publicationStage: "formal" }, filters), true);
  assert.equal(paperMatchesCommonFilters({ categories: ["bio"], note: { categories: ["hardware"] }, publicationStage: "formal" }, filters), true);
  assert.equal(paperMatchesCommonFilters({ categories: ["hardware"], note: { categories: [] }, publicationStage: "formal" }, filters), false);
  assert.equal(paperMatchesCommonFilters({ categories: ["classic"], publicationStage: "preprint" }, filters), false);
  assert.equal(paperMatchesCommonFilters({ categories: ["bio"], publicationStage: "formal" }, filters), false);
});

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
  assert.match(html, /scope === "today"[\s\S]*sortPapersByMode\(list, todayPaperSortMode, todayPaperSortDirection\)/);
  assert.match(html, /scope === "all"[\s\S]*sortPapersByMode\(list, allPaperSortMode, allPaperSortDirection\)/);
});

test("all papers page exposes sortable time groups", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /allPaperSortDirection/);
  assert.match(html, /allPaperTimeBuckets/);
  assert.match(html, /fetchedTimeBucketKey/);
  assert.match(html, /publishedYearBuckets/);
  assert.match(html, /time-axis-track/);
  assert.match(html, /time-axis-node/);
  assert.match(html, /data-all-time-filter/);
  assert.match(html, /sortDirectionLabel/);
  assert.match(html, /7D/);
  assert.match(html, /\$\{Number\(month\)\}M/);
  assert.match(html, /最新/);
  assert.match(html, /最旧/);
});

test("all papers page keeps archive actions in the hero and exposes common side filters", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function pageShell\(title, subtitle, body, side = "", heroActions = ""\)/);
  assert.match(html, /if \(normalized === "all"\) renderAll\(\)/);
  assert.match(html, /pageShell\("全部论文"[\s\S]*archiveActionButtons\(\)/);
  const sideFilterMatch = html.match(/function allPaperSideFilter\(\) \{[\s\S]*?\n    function toggleSetValue/);
  assert.ok(sideFilterMatch, "expected allPaperSideFilter function");
  assert.match(sideFilterMatch[0], /关注标签/);
  assert.match(sideFilterMatch[0], /论文类型/);
  assert.match(sideFilterMatch[0], /发表阶段/);
  assert.match(sideFilterMatch[0], /引用量/);
  assert.match(sideFilterMatch[0], /发表日期/);
});

test("all papers clear unstarred archive uses one confirmed request and preserves state on failure", async () => {
  const [html, serverSource] = await Promise.all([
    fs.readFile(htmlFile, "utf8"),
    fs.readFile(serverFile, "utf8")
  ]);
  assert.match(html, /data-clear-unstarred-archive/);
  assert.match(html, /清空未标星/);
  assert.match(serverSource, /pathname === "\/api\/archive\/clear-unstarred"/);
  assert.match(serverSource, /clearUnstarredPaperArchive\(\)/);

  const source = readNamedFunction(html, "clearUnstarredArchive", "applyArchivePayload");
  const makeHarness = ({ confirm = true, ok = true } = {}) => {
    const requests = [];
    const harness = new Function("location", "fetch", "renderAll", "showToast", "window", "isStarredPaper", "normalizePaperForView", `
      let recentPapers = [{ id: "starred" }, { id: "plain" }];
      let recentDataMeta = { count: 2 };
      let recentDataStatus = "ready";
      ${source.replace(/^function/, "async function")}
      return {
        clearUnstarredArchive,
        state: () => ({ recentPapers, recentDataMeta, recentDataStatus })
      };
    `)(
      { protocol: "http:" },
      async (url, options) => {
        requests.push({ url, options });
        return {
          ok,
          status: ok ? 200 : 500,
          json: async () => ({
            beforeCount: 2,
            afterCount: 1,
            removedCount: 1,
            preservedStarredCount: 1,
            papers: [{ id: "starred" }],
            archive: { count: 1 }
          })
        };
      },
      () => {},
      () => {},
      { confirm: () => confirm },
      paper => paper.id === "starred",
      paper => paper
    );
    return { ...harness, requests };
  };

  const cancelled = makeHarness({ confirm: false });
  await cancelled.clearUnstarredArchive();
  assert.equal(cancelled.requests.length, 0);
  assert.deepEqual(cancelled.state().recentPapers.map(paper => paper.id), ["starred", "plain"]);

  const succeeded = makeHarness();
  await succeeded.clearUnstarredArchive();
  assert.deepEqual(succeeded.requests, [{ url: "/api/archive/clear-unstarred", options: { method: "POST" } }]);
  assert.deepEqual(succeeded.state().recentPapers.map(paper => paper.id), ["starred"]);
  assert.equal(succeeded.state().recentDataMeta.count, 1);
  assert.match(succeeded.state().recentDataStatus, /移除 1 篇/);

  const failed = makeHarness({ ok: false });
  await failed.clearUnstarredArchive();
  assert.deepEqual(failed.state().recentPapers.map(paper => paper.id), ["starred", "plain"]);
  assert.match(failed.state().recentDataStatus, /清空失败/);
});

test("sidebar stays fixed while paper lists scroll", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\.sidebar\s*\{[\s\S]*position:\s*sticky/);
  assert.match(html, /\.sidebar\s*\{[\s\S]*height:\s*100vh/);
  assert.match(html, /\.sidebar\s*\{[\s\S]*overflow-y:\s*auto/);
});

test("paper timelines render in batches of twenty with demand loading", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /const paperPageSize = 20/);
  assert.match(html, /renderPaperTimeline/);
  assert.match(html, /paperVisibleLimits/);
  assert.match(html, /data-lazy-paper-sentinel/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /loadMorePapers/);
  assert.match(html, /slice\(0, visibleLimit\)/);
});

test("paper timeline stamps toggle date sorting on all paper pages", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /timelineSortDirections/);
  assert.match(html, /function paperTimelineSortDirection\(scope\)/);
  assert.match(html, /function sortPaperTimelinePapers\(list, scope\)/);
  assert.match(html, /data-paper-timeline-sort="\$\{escapeHTML\(scope\)\}"/);
  assert.match(html, /aria-label="切换时间轴排序"/);
  assert.match(html, /function bindPaperTimelineSort\(\)/);
  assert.match(html, /bindPaperTimelineSort\(\)/);
  assert.match(html, /if \(scope === "all"\) allPaperSortDirection = allPaperSortDirection === "asc" \? "desc" : "asc"/);
  assert.match(html, /timelineSortDirections\[scope\] = paperTimelineSortDirection\(scope\) === "asc" \? "desc" : "asc"/);
});

test("paper card puts precise publication date before journal info and copies DOI", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /published-date-pill/);
  assert.match(html, /data-copy-doi/);
  assert.match(html, /paperPublishedDoiControl/);
  assert.match(html, /paper-source-row[\s\S]*publishedDoiControl[\s\S]*sourceLabel/);
  assert.doesNotMatch(html, /paperDoiLine/);
  assert.match(html, /paper-signal-row/);
  assert.match(html, /AI Token/);
});

test("token stats page exposes fetch-log candidate detail view", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-fetch-log-detail/);
  assert.match(html, /renderFetchLogCandidateDetail/);
  assert.match(html, /领域过滤前候选论文/);
  assert.match(html, /afterDateEnrichment/);
  assert.match(html, /finalDateMatched/);
  assert.match(html, /data-candidate-stage/);
  assert.match(html, /日期补全后/);
  assert.match(html, /最终日期通过/);
  assert.match(html, /let candidateDetailStage = "finalDateMatched"/);
  assert.match(html, /日期补全后（含超出范围）/);
  assert.match(html, /日期粗筛/);
  assert.match(html, /日期确认/);
  assert.match(html, /历史库新增/);
  assert.match(html, /function renderFetchLogCandidateDetail\(\) \{[\s\S]{0,500}const stage = activeFetchLogCandidateStage\(entry\)[\s\S]{0,300}fetchLogCandidateSnapshot\(entry, stage\.key\)/);
});

test("token stats cards label LLM usage count as calls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /调用 \$\{formatToken\(bucket\?\.papers\)\} 次/);
  assert.doesNotMatch(html, /输出 \$\{formatToken\(bucket\?\.completion\)\} · \$\{formatToken\(bucket\?\.papers\)\} 篇/);
});

test("token stats page exposes aliyun model pool status", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /llmModelPoolStatsPanel/);
  assert.match(html, /百炼模型池/);
  assert.match(html, /额度充足/);
  assert.match(html, /响应失败/);
  assert.match(html, /\/api\/integrations\/llm\/model-pool\/reset/);
});

test("candidate detail view exposes archive action and sortable columns", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-candidate-add/);
  assert.match(html, /data-candidate-remove/);
  assert.match(html, /加入全部论文/);
  assert.match(html, /撤销/);
  assert.match(html, /data-candidate-sort/);
  assert.match(html, /bindCandidateDetailActions/);
  assert.match(html, /removeCandidateFromArchive/);
  assert.match(html, /sortCandidatePapers/);
});

test("source config hides the disconnected Google rolling fetch option", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.doesNotMatch(html, /data-source-integration-field="rollingFetch"/);
  assert.doesNotMatch(html, /启动滚动抓取/);
  assert.doesNotMatch(html, /下次自动接着抓/);
});

test("source config exposes Web of Science API settings", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /Web of Science/);
  assert.match(html, /webOfScience:\s*\{/);
  assert.match(html, /data-source-integration="webOfScience"/);
  assert.match(html, /data-api-help="webofscience"/);
  assert.match(html, /Web of Science API Key/);
  assert.match(html, /每次仅抓取少量页面/);
  assert.match(html, /webOfScience:\s*integrationState\.webOfScience/);
});

test("external integrations expose Firecrawl publisher scraping settings", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /firecrawl:\s*\{/);
  assert.match(html, /data-integration-section="firecrawl"/);
  assert.match(html, /Firecrawl API Key/);
  assert.match(html, /data-api-help="firecrawl"/);
  assert.match(html, /https:\/\/api\.firecrawl\.dev\/v2\/scrape/);
  assert.match(html, /firecrawl:\s*integrationState\.firecrawl/);
  assert.match(html, /Firecrawl 官方额度/);
  assert.match(html, /remainingCredits/);
  assert.match(html, /planCredits/);
  assert.match(html, /计费周期/);
  assert.match(html, /data-firecrawl-test/);
  assert.match(html, /\/api\/integrations\/firecrawl\/test/);
  assert.match(html, /测试 Firecrawl/);
  assert.match(html, /key === "apiKey" && input\.value === savedSecretMask/);
});

test("academic API contact email is editable from the config page", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /academicApis:\s*\{\s*contactEmail:\s*""/);
  assert.match(html, /data-integration-section="academicApis"/);
  assert.match(html, /type="email"[^>]*data-integration-field="contactEmail"/);
  assert.match(html, /学术 API 联系邮箱/);
  assert.match(html, /Crossref/);
  assert.match(html, /OpenAlex/);
  assert.match(html, /academicApis:\s*integrationState\.academicApis/);
  assert.match(html, /payload\.error/);
});

test("config page exposes aliyun llm model pool controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /renderLlmModelPoolManager/);
  assert.match(html, /data-llm-model-pool/);
  assert.match(html, /qwen-plus/);
  assert.match(html, /PaperHot 本地估算/);
});

test("aliyun model pool manager renders quota bars test buttons and pagination", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /const llmModelPoolPageSize = 25/);
  assert.match(html, /function renderLlmModelPoolManager/);
  assert.match(html, /function llmModelPoolCard/);
  assert.match(html, /class="llm-pool-grid"/);
  assert.match(html, /class="llm-pool-quota-bar"/);
  assert.match(html, /data-llm-pool-test-model/);
  assert.match(html, /data-llm-pool-page="next"/);
  assert.match(html, /5 x 5/);
});

test("aliyun model pool manager greys unavailable cards and shows repeated failure hints", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /model\.greyed \? "greyed" : ""/);
  assert.match(html, /disabled=\$\{model\.selectable \? "" : "disabled"\}/);
  assert.match(html, /上次因连续失败切换/);
  assert.match(html, /PaperHot 本地估算/);
});

test("aliyun model pool manager calls per-model test and update endpoints", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\/api\/integrations\/llm\/model-pool\/test/);
  assert.match(html, /\/api\/integrations\/llm\/model-pool\/model/);
  assert.match(html, /testOneLlmPoolModel/);
  assert.match(html, /updateOneLlmPoolModel/);
});

test("aliyun model pool manager synchronizes an inactive provider state for later config saves", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const syncSource = readNamedFunction(html, "syncLlmModelPoolStatus", "updateOneLlmPoolModel");
  const updateSource = readNamedFunction(html, "updateOneLlmPoolModel", "testOneLlmPoolModel");
  const testSource = readNamedFunction(html, "testOneLlmPoolModel", "loadIntegrationSecrets");
  const readProviderSource = readNamedFunction(html, "readActiveLlmProvider", "currentLlmConfig");
  const currentConfigSource = readNamedFunction(html, "currentLlmConfig", "currentIntegrationConfig");
  assert.match(updateSource, /JSON\.stringify\(\{ providerId, model, \.\.\.patch \}\)/);
  assert.match(testSource, /JSON\.stringify\(\{ providerId, model \}\)/);
  assert.match(updateSource, /syncLlmModelPoolStatus\(payload\.status \|\| null, providerId\)/);
  assert.match(testSource, /syncLlmModelPoolStatus\(payload\.status \|\| null, providerId\)/);

  const modelPool = {
    quotaMode: "official-first",
    quotaFallback: "local",
    quotaSwitchRatio: 0.85,
    failureSwitchThreshold: 3,
    models: [{ model: "qwen-plus", enabled: false, freeQuotaTokens: 1000000, priority: 10 }]
  };
  const result = new Function(`
    const llmModelPoolStatusByProviderId = {};
    const defaultAliyunModelPool = {};
    let integrationState = {
      llm: {
        activeProviderId: "other",
        providers: [
          { id: "other", provider: "custom", modelPool: { models: [{ model: "unchanged" }] } },
          { id: "aliyun-coding", provider: "aliyun-modelstudio", modelPool: ${JSON.stringify(modelPool)} }
        ]
      }
    };
    ${syncSource}
    const document = { querySelector: () => null };
    ${readProviderSource}
    ${currentConfigSource}
    return { syncLlmModelPoolStatus, currentLlmConfig, state: () => integrationState, status: providerId => llmModelPoolStatusByProviderId[providerId] };
  `)();
  const status = {
    providerId: "aliyun-coding",
    ...modelPool,
    models: [
      { model: "qwen-plus", displayName: "Qwen Plus", family: "Qwen", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
      { model: "qwen-hidden", displayName: "Qwen Hidden", family: "Qwen", enabled: true, freeQuotaTokens: 2000000, priority: 20 }
    ]
  };
  result.syncLlmModelPoolStatus(status, "aliyun-coding");
  assert.equal(result.status("aliyun-coding"), status);
  assert.deepEqual(result.state().llm.providers[1].modelPool.models.map(model => [model.model, model.enabled]), [
    ["qwen-plus", true],
    ["qwen-hidden", true]
  ]);
  assert.deepEqual(result.state().llm.providers[0].modelPool, { models: [{ model: "unchanged" }] });
  const serialized = result.currentLlmConfig();
  assert.equal(serialized.activeProviderId, "other");
  assert.deepEqual(serialized.providers[1].modelPool.models.map(model => [model.model, model.enabled]), [
    ["qwen-plus", true],
    ["qwen-hidden", true]
  ]);
});

test("aliyun model pool status cache is isolated by provider id", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const syncSource = readNamedFunction(html, "syncLlmModelPoolStatus", "updateOneLlmPoolModel");
  const rowsSource = readNamedFunction(html, "modelPoolRowsForProvider", "llmModelPoolCard");
  const loadSource = readNamedFunction(html, "loadLlmModelPoolStatus", "syncLlmModelPoolStatus");
  const activateSource = readNamedFunction(html, "activateLlmProvider", "toggleSecretVisibility");
  const clickSource = readNamedFunction(html, "handleIntegrationClick", "bindLlmModelPoolManager");
  assert.match(loadSource, /providerId=\$\{encodeURIComponent\(selectedProviderId\)\}/);
  assert.match(activateSource, /loadLlmModelPoolStatusIfNeeded\(providerId\)/);
  assert.match(clickSource, /loadLlmModelPoolStatusIfNeeded\(providerId\)/);

  const result = new Function(`
    const llmModelPoolStatusByProviderId = {};
    const defaultAliyunModelPool = { models: [] };
    let integrationState = {
      llm: {
        activeProviderId: "aliyun-a",
        providers: [
          { id: "aliyun-a", provider: "aliyun-modelstudio", modelPool: { models: [] } },
          { id: "aliyun-b", provider: "aliyun-modelstudio", modelPool: { models: [] } }
        ]
      }
    };
    ${syncSource}
    ${rowsSource}
    return {
      syncLlmModelPoolStatus,
      modelPoolRowsForProvider,
      provider: id => integrationState.llm.providers.find(provider => provider.id === id)
    };
  `)();
  const statusA = {
    providerId: "aliyun-a",
    models: [{ model: "qwen-plus", localUsedTokens: 11, statusLabel: "A" }]
  };
  const statusB = {
    providerId: "aliyun-b",
    models: [{ model: "qwen-plus", localUsedTokens: 22, statusLabel: "B" }]
  };
  result.syncLlmModelPoolStatus(statusA, "aliyun-a");
  result.syncLlmModelPoolStatus(statusB, "aliyun-b");

  assert.equal(result.modelPoolRowsForProvider(result.provider("aliyun-a"))[0].statusLabel, "A");
  assert.equal(result.modelPoolRowsForProvider(result.provider("aliyun-b"))[0].statusLabel, "B");
});

test("OpenAlex config separates discovery from automatic field enrichment", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /title:\s*"OpenAlex"/);
  assert.match(html, /openAlex:\s*\{/);
  assert.match(html, /data-source-integration="openAlex"/);
  assert.match(html, /OpenAlex API Key/);
  assert.match(html, /data-api-help="openalex"/);
  assert.match(html, /https:\/\/openalex\.org\/settings\/api/);
  assert.match(html, /检索信源/);
  assert.match(html, /只控制论文发现，字段补全仍自动运行/);
  assert.match(html, /filter\(\(\{ source \}\) => \/google\|web of science\|openalex\/i\.test\(source\.title\)\)/);
  assert.match(html, /data-field-provenance/);
  assert.match(html, /论文字段来源与优先级/);
  assert.match(html, /WoS &gt; Google Scholar &gt; OpenAlex/);
  assert.match(html, /最先通过身份、完整性和机器人页校验的完整摘要/);
  assert.match(html, /openAlex:\s*integrationState\.openAlex/);
});

test("config page orders primary sections and collapses advanced groups by default", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const markers = [
    'id="setup-status-panel"',
    'data-config-order="academic-api"',
    'data-config-order="field-provenance"',
    'data-config-order="sources"',
    'data-config-order="firecrawl"',
    'data-config-order="external-integrations"'
  ];
  const positions = markers.map(marker => html.indexOf(marker));
  assert.equal(positions.every(position => position >= 0), true);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.match(html, /<details class="panel config-disclosure" data-config-order="sources">/);
  assert.match(html, /<details class="panel config-disclosure" data-config-order="firecrawl">/);
  assert.match(html, /<details class="panel config-disclosure" data-config-order="external-integrations">/);
  assert.doesNotMatch(html, /<details class="panel config-disclosure"[^>]*\sopen(?:\s|>)/);
  assert.match(html, /id="keyword-config-panel"/);
  assert.match(html, /data-export-local/);
});

test("Web of Science config shows local usage and backup boundaries", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function webOfScienceUsagePanel\(/);
  assert.match(html, /PaperHot 本地统计/);
  assert.match(html, /今日请求/);
  assert.match(html, /本月请求/);
  assert.match(html, /累计请求/);
  assert.match(html, /月度历史/);
  assert.match(html, /最后请求/);
  assert.match(html, /预计最多/);
  assert.match(html, /WoS 请求用量/);
  assert.match(html, /近期抓取断点不会导出/);
});

test("fetch progress panel exposes source page detail", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /sourcePage/);
  assert.match(html, /fetch-progress-page-detail/);
  assert.match(html, /正在抓第/);
});

test("refresh request contract forwards cleaned discovery options and keeps existing endpoints", async () => {
  const [html, serverSource] = await Promise.all([
    fs.readFile(htmlFile, "utf8"),
    fs.readFile(serverFile, "utf8")
  ]);
  const buildSource = readNamedFunction(serverSource, "buildRefreshOptions", "runRefreshPayload");
  const buildRefreshOptions = new Function(`${buildSource}; return buildRefreshOptions;`)();
  const progressHandler = () => {};
  const searchLogic = { activeKeywords: ["SIM", "RIM"], andEdges: [["SIM", "RIM"]] };

  assert.deepEqual(buildRefreshOptions(null, progressHandler), {
    refresh: true,
    searchMode: "direction",
    queryExpression: "",
    searchLogic: { activeKeywords: [], andEdges: [] },
    sources: [],
    startDate: undefined,
    endDate: undefined,
    resumeMode: "new",
    onProgress: progressHandler
  });
  assert.deepEqual(buildRefreshOptions({
    searchMode: "exact",
    queryExpression: "  10.1000/example  ",
    searchLogic,
    sources: ["arxiv", "webofscience"],
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    resumeMode: "resume",
    keywords: ["must-not-forward"]
  }, progressHandler), {
    refresh: true,
    searchMode: "exact",
    queryExpression: "10.1000/example",
    searchLogic,
    sources: ["arxiv", "webofscience"],
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    resumeMode: "resume",
    onProgress: progressHandler
  });
  assert.equal(buildRefreshOptions({ resumeMode: "restart" }, progressHandler).resumeMode, "restart");
  assert.equal(buildRefreshOptions({ resumeMode: "invalid" }, progressHandler).resumeMode, "new");

  const inheritedBody = Object.create({
    searchMode: "exact",
    queryExpression: "inherited",
    searchLogic,
    sources: ["arxiv"],
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    resumeMode: "resume"
  });
  assert.deepEqual(buildRefreshOptions(inheritedBody, progressHandler), {
    refresh: true,
    searchMode: "direction",
    queryExpression: "",
    searchLogic: { activeKeywords: [], andEdges: [] },
    sources: [],
    startDate: undefined,
    endDate: undefined,
    resumeMode: "new",
    onProgress: progressHandler
  });
  assert.deepEqual(buildRefreshOptions({
    queryExpression: { toString: () => "must-not-coerce" },
    searchLogic: {
      activeKeywords: [" SIM ", 42, "", "SIM"],
      andEdges: [[" SIM ", " RIM "], ["SIM"], ["SIM", {}], "bad-pair"]
    },
    sources: [" arxiv ", {}, "ARXIV", "", "webofscience"],
    startDate: "2026-02-30",
    endDate: "2026-02-28"
  }, progressHandler), {
    refresh: true,
    searchMode: "direction",
    queryExpression: "",
    searchLogic: { activeKeywords: ["SIM"], andEdges: [["SIM", "RIM"]] },
    sources: ["arxiv", "webofscience"],
    startDate: undefined,
    endDate: "2026-02-28",
    resumeMode: "new",
    onProgress: progressHandler
  });
  const inheritedLogic = Object.create({ activeKeywords: ["bad"], andEdges: [["bad", "worse"]] });
  assert.deepEqual(buildRefreshOptions({ searchLogic: inheritedLogic }, progressHandler).searchLogic, {
    activeKeywords: [],
    andEdges: []
  });

  assert.match(serverSource, /pathname === "\/api\/papers\/refresh\/start"/);
  assert.match(serverSource, /pathname === "\/api\/papers\/refresh\/status"/);
  assert.match(serverSource, /pathname === "\/api\/papers\/refresh\/state"/);
  assert.match(html, /fetch\("\/api\/papers\/refresh\/start"/);
  assert.match(html, /fetch\(`\/api\/papers\/refresh\/status\?id=/);
  const requestBodySource = readNamedFunction(html, "paperRefreshBody", "runPaperRefreshJob");
  for (const field of ["searchMode", "queryExpression", "searchLogic", "sources", "startDate", "endDate", "resumeMode"]) {
    assert.match(requestBodySource, new RegExp(`\\b${field}\\b`));
  }

  const modeSource = readNamedFunction(serverSource, "refreshRequestMode", "buildFrozenRefreshOptions");
  const frozenSource = readNamedFunction(serverSource, "buildFrozenRefreshOptions", "readRefreshTaskState");
  const buildFrozenRefreshOptions = new Function(
    "buildDiscoveryTaskContext",
    `${buildSource}; ${modeSource}; ${frozenSource}; return buildFrozenRefreshOptions;`
  )(buildDiscoveryTaskContext);
  const frozen = buildFrozenRefreshOptions({ mode: "last7" }, undefined, "2026-07-13");
  const fingerprint = buildDiscoveryTaskDescriptor(frozen).taskFingerprint;
  buildFrozenRefreshOptions({ mode: "last7" }, undefined, "2026-07-14");
  assert.deepEqual({ date: frozen.date, startDate: frozen.startDate, endDate: frozen.endDate }, {
    date: "2026-07-13",
    startDate: "2026-07-07",
    endDate: "2026-07-13"
  });
  assert.equal(buildDiscoveryTaskDescriptor(frozen).taskFingerprint, fingerprint);

  const startRoute = serverSource.match(/if \(req\.method === "POST" && pathname === "\/api\/papers\/refresh\/start"\)[\s\S]*?(?=\n\s*if \(req\.method === "GET" && pathname === "\/api\/papers\/refresh\/status"\))/)?.[0];
  assert.ok(startRoute, "expected refresh start route");
  assert.match(startRoute, /const taskOptions = buildFrozenRefreshOptions\(body\)/);
  assert.doesNotMatch(startRoute, /Object\.assign\(initialState, await readDiscoveryTaskState/);
  assert.equal(startRoute.match(/readDiscoveryTaskState/g)?.length, 1, "durable cursor is read only after backend rejection");
});

test("refresh state preflight reuses the frozen canonical descriptor without starting a job", async () => {
  const serverSource = await fs.readFile(serverFile, "utf8");
  const buildSource = readNamedFunction(serverSource, "buildRefreshOptions", "runRefreshPayload");
  const modeSource = readNamedFunction(serverSource, "refreshRequestMode", "buildFrozenRefreshOptions");
  const frozenSource = readNamedFunction(serverSource, "buildFrozenRefreshOptions", "readRefreshTaskState");
  const stateSource = readNamedFunction(serverSource, "readRefreshTaskState", "createFetchJob");
  let readOptions;
  const readRefreshTaskState = new Function(
    "buildDiscoveryTaskContext", "buildDiscoveryTaskDescriptor", "readDiscoveryTaskState",
    `${buildSource}; ${modeSource}; ${frozenSource}; ${stateSource}; return readRefreshTaskState;`
  )(
    buildDiscoveryTaskContext,
    buildDiscoveryTaskDescriptor,
    async options => {
      readOptions = options;
      return {
        taskFingerprint: "canonical-fingerprint",
        resumable: true,
        sourcePages: { arxiv: { nextPage: 3, complete: false } },
        sourceResults: [],
        errors: []
      };
    }
  );
  const payload = await readRefreshTaskState({
    mode: "recent",
    searchMode: "direction",
    queryExpression: "SIM",
    searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
    sources: ["arXiv"],
    startDate: "2026-04-13",
    endDate: "2026-07-13",
    resumeMode: "resume"
  });

  assert.equal(readOptions.mode, "recent");
  assert.equal(payload.ok, true);
  assert.equal(payload.taskFingerprint, "canonical-fingerprint");
  assert.equal(payload.resumable, true);
  assert.deepEqual(payload.sourcePages, { arxiv: { nextPage: 3, complete: false } });
  const route = serverSource.match(/if \(req\.method === "POST" && pathname === "\/api\/papers\/refresh\/state"\)[\s\S]*?(?=\n\s*if \(req\.method === "POST" && pathname === "\/api\/papers\/refresh\/start"\))/)?.[0];
  assert.ok(route, "expected read-only refresh state route");
  assert.match(route, /readRefreshTaskState\(body\)/);
  assert.doesNotMatch(route, /runRefreshPayload|createFetchJob|fetchJobs\.set/);
});

test("refresh job transitions preserve canonical state and monotonic progress", async () => {
  const serverSource = await fs.readFile(serverFile, "utf8");
  const helpersSource = serverSource.match(/function createFetchJob\([\s\S]*?(?=\nfunction runRefreshPayload\()/);
  assert.ok(helpersSource, "expected executable refresh job helpers");
  const {
    createFetchJob,
    mergeFetchJobProgress,
    completeFetchJob,
    failFetchJob,
    fetchJobResponse
  } = new Function(`${helpersSource[0]}; return { createFetchJob, mergeFetchJobProgress, completeFetchJob, failFetchJob, fetchJobResponse };`)();

  const first = createFetchJob("job-a", {
    taskFingerprint: "fp-a",
    resumable: true,
    sourcePages: { webofscience: { nextPage: 4, complete: false } },
    sourceResults: [],
    errors: []
  }, "2026-07-13T00:00:00.000Z", 1);
  const second = createFetchJob("job-b", {
    taskFingerprint: "fp-b",
    resumable: false,
    sourcePages: { arxiv: { nextPage: 8, complete: true } },
    sourceResults: [],
    errors: []
  }, "2026-07-13T00:00:01.000Z", 2);
  mergeFetchJobProgress(first, {
    stage: "enrich",
    percent: 74,
    message: "newer",
    counts: { raw: 10, deduped: 8 },
    sources: [{ api: "webofscience", status: "ok" }],
    taskFingerprint: "fp-a",
    resumable: true,
    sourcePages: { webofscience: { nextPage: 5, complete: false } },
    sourceResults: [{ source: "webofscience", status: "ok", returned: 3 }],
    errors: []
  }, 3);
  mergeFetchJobProgress(first, {
    stage: "sources",
    percent: 18,
    message: "late",
    counts: { raw: 2 },
    sources: [{ api: "arxiv", status: "failed" }],
    sourcePages: { arxiv: { nextPage: 1, complete: false } },
    errors: [{ source: "arxiv", message: "offline" }]
  }, 4);
  mergeFetchJobProgress(first, {
    stage: "source-page",
    message: "late page without global percent",
    sourcePage: { page: 1 },
    sourcePages: { semanticscholar: { nextPage: 2, complete: false } }
  }, 4);
  assert.equal(first.progress.stage, "enrich");
  assert.equal(first.progress.percent, 74);
  assert.equal(first.progress.message, "newer");
  assert.deepEqual(first.progress.counts, { raw: 10, deduped: 8 });
  assert.deepEqual(first.sourcePages, {
    webofscience: { nextPage: 5, complete: false }
  });
  assert.deepEqual(first.progress.sources.map(source => source.api).sort(), ["arxiv", "webofscience"]);
  assert.deepEqual(second.sourcePages, { arxiv: { nextPage: 8, complete: true } });

  mergeFetchJobProgress(first, {
    taskFingerprint: "fp-a",
    resumable: true,
    sourcePages: { webofscience: { nextPage: 2, complete: false } },
    sourceResults: [],
    errors: []
  }, 4);
  assert.deepEqual(first.sourcePages, { webofscience: { nextPage: 2, complete: false } });
  assert.deepEqual(first.sourceResults, []);

  completeFetchJob(first, {
    taskFingerprint: "fp-a",
    resumable: false,
    sourcePages: { webofscience: { nextPage: 6, complete: true }, arxiv: { nextPage: 1, complete: true } },
    sourceResults: [{ source: "webofscience", status: "ok", returned: 3 }],
    errors: [],
    count: 3
  }, 5);
  assert.equal(first.status, "done");
  assert.equal(first.progress.percent, 100);
  assert.equal(first.resumable, false);
  mergeFetchJobProgress(first, {
    stage: "sources",
    percent: 18,
    resumable: true,
    sourcePages: { webofscience: { nextPage: 99, complete: false } },
    errors: [{ source: "late", message: "must not mutate terminal state" }]
  }, 6);
  assert.equal(first.resumable, false);
  assert.deepEqual(first.sourcePages.webofscience, { nextPage: 6, complete: true });
  assert.deepEqual(first.errors, []);

  mergeFetchJobProgress(second, {
    stage: "sources",
    percent: 60,
    message: "arxiv failed",
    taskFingerprint: "fp-live",
    resumable: false,
    sourcePages: { arxiv: { nextPage: 2, complete: true } },
    sourceResults: [{ source: "arxiv", status: "failed", returned: 0, message: "offline" }],
    errors: [{ source: "arxiv", message: "offline" }]
  }, 5);
  failFetchJob(second, new Error("pipeline failed"), {
    taskFingerprint: "fp-b",
    resumable: true,
    sourcePages: { arxiv: { nextPage: 3, complete: false } },
    sourceResults: [],
    errors: []
  }, 6);
  const failed = fetchJobResponse(second);
  assert.equal(failed.status, "error");
  assert.equal(failed.taskFingerprint, "fp-b");
  assert.equal(failed.resumable, true);
  assert.deepEqual(failed.sourcePages, { arxiv: { nextPage: 3, complete: false } });
  assert.deepEqual(failed.sourceResults, [{ source: "arxiv", status: "failed", returned: 0, message: "offline" }]);
  assert.deepEqual(failed.errors.map(error => error.source), ["arxiv", "server"]);
  mergeFetchJobProgress(second, {
    stage: "sources",
    percent: 75,
    taskFingerprint: "fp-late",
    resumable: false,
    sourcePages: { arxiv: { nextPage: 99, complete: true } },
    sourceResults: [],
    errors: [{ source: "late", message: "must not mutate terminal state" }]
  }, 7);
  assert.equal(second.taskFingerprint, "fp-b");
  assert.equal(second.resumable, true);
  assert.deepEqual(second.sourcePages, { arxiv: { nextPage: 3, complete: false } });
  assert.deepEqual(second.sourceResults, [{ source: "arxiv", status: "failed", returned: 0, message: "offline" }]);
  assert.deepEqual(second.errors.map(error => error.source), ["arxiv", "server"]);
  assert.equal(fetchJobResponse(first).status, "done");
  assert.doesNotMatch(serverSource, /function mergeSourcePages\(/);
});

test("fetch log panel exposes Google rolling page ranges", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /sourcePages/);
  assert.match(html, /fetchLogSourcePageText/);
  assert.match(html, /本次页码/);
  assert.match(html, /下次从 start/);
  assert.match(html, /skippedPages/);
  assert.match(html, /已跳过/);
});

test("fetch log panel exposes failed enrichment retry action", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-fetch-log-retry/);
  assert.match(html, /retryFetchLogEnrichment/);
  assert.match(html, /\/api\/fetch\/log\/retry/);
  assert.match(html, /重试失败富集/);
});

test("all papers page exposes archive LLM refresh actions", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-refresh-archive-llm/);
  assert.match(html, /data-refresh-paper-llm/);
  assert.match(html, /\/api\/archive\/llm/);
  assert.match(html, /\/api\/archive\/llm\/paper/);
  assert.match(html, /payload\.failedCount/);
});

test("today papers page exposes single paper LLM refresh actions", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /page !== "all" && page !== "paper" && scope !== "today" && scope !== "favorites"/);
  assert.match(html, /renderTodayPaperTimeline\(filteredPapers\)/);
  assert.match(html, /todayPapers = mergePaperPool\(todayPapers, \[normalizePaperForView\(payload\.paper\)\]\)/);
  assert.match(html, /document\.querySelectorAll\("\[data-refresh-paper-llm\]"\)/);
  assert.match(html, /\/api\/archive\/llm\/paper/);
});

test("favorites page uses backend json persistence", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\/api\/favorites/);
  assert.match(html, /loadFavoritesData/);
  assert.match(html, /updateFavorite/);
  assert.match(html, /favoriteKeys/);
});

test("saved papers are visually muted outside the favorites page", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\.paper-card\.saved-muted/);
  assert.match(html, /const isSavedMuted = scope !== "favorites" && \(isSaved \|\| \(scope === "today" && paper\.archivedBeforeFetch === true\)\)/);
  assert.match(html, /isSavedMuted \? "saved-muted" : ""/);
  const savedRuleIndex = html.indexOf(".paper-card.saved-muted {");
  const starredSavedRuleIndex = html.indexOf(".paper-card.starred.saved-muted {");
  assert.ok(starredSavedRuleIndex > savedRuleIndex, "starred+saved rule must override the saved background shorthand");
  assert.match(html.slice(starredSavedRuleIndex, html.indexOf("}", starredSavedRuleIndex) + 1), /background-image:/);
});

test("mobile paper timeline stacks its timestamp above the card", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const tabletCss = html.slice(html.indexOf("@media (max-width: 820px)"), html.indexOf("@media (max-width: 420px)"));
  const mobileCss = html.slice(html.indexOf("@media (max-width: 420px)"), html.indexOf("</style>"));
  assert.match(tabletCss, /\.simple-grid\s*>\s*aside\s*\{[^}]*order:\s*-1/);
  assert.match(mobileCss, /\.timeline-item\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobileCss, /\.timeline-sort-button\s*\{[^}]*grid-template-columns:/);
});

test("today papers move to the end after being favorited", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function moveTodayPaperToEnd\(paper\)/);
  assert.match(html, /const targetKeys = new Set\(paperLookupKeys\(paper\)\)/);
  assert.match(html, /nextList\.push\(matchedPaper\)/);
  assert.match(html, /session\.id !== activeTodayFetchSessionId/);
  assert.match(html, /if \(favorite\) moveTodayPaperToEnd\(paper\)/);
});

test("favorites page uses tabbed reading views and defaults to unread", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /let favoriteActiveTab = "reading"/);
  assert.match(html, /favorites-tab/);
  assert.match(html, /data-favorites-tab/);
  assert.match(html, /已收藏论文/);
  assert.match(html, /待阅读/);
  assert.match(html, /已阅读/);
  assert.match(html, /标星/);
  assert.match(html, /bindFavoriteTabs/);
});

test("favorites page exposes the common paper filter panel on the right", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /const favoriteCommonPaperFilters = \{ categories: new Set\(\), stages: new Set\(\) \}/);
  assert.match(html, /const selectedFavoritePaperKeywords = new Set\(\)/);
  assert.match(html, /let favoritePaperSortMode = "published"/);
  assert.match(html, /function favoritePaperSideFilter\(sourcePapers\)/);
  assert.match(html, /个人收藏筛选/);
  assert.match(html, /data-favorite-filter-keyword/);
  assert.match(html, /data-paper-common-category="favorites"/);
  assert.match(html, /data-paper-common-stage="favorites"/);
  assert.match(html, /data-favorite-paper-sort="citation"/);
  assert.match(html, /data-favorite-paper-sort-direction="desc"/);
  assert.match(html, /pageShell\("个人收藏"[\s\S]*favoritePaperSideFilter\(searchableFavorites\)/);
  assert.match(html, /bindFavoriteSideFilters\(\)/);
  assert.match(html, /matchesSelectedFavoritePaperKeywords/);
  assert.match(html, /paperMatchesCommonFilters\(paper, favoriteCommonPaperFilters\)/);
  assert.match(html, /sortPapersByMode\(list, favoritePaperSortMode, favoritePaperSortDirection\)/);
});

test("favorites page exposes mark-read and remove actions for reading workflow", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /favoritePaperWorkflowButton/);
  assert.match(html, /paperLlmRefreshButton\(paper, scope\)/);
  assert.match(html, /scope === "favorites" \? favoritePaperWorkflowButton\(paper, scope\) : ""/);
  assert.match(html, /const llmButton = llmFailureControl \? "" : paperLlmRefreshButton\(paper, scope\)/);
  assert.match(html, /data-favorite-mark-read/);
  assert.match(html, /data-favorite-undo-read/);
  assert.match(html, /data-favorite-mark-unread/);
  assert.match(html, /data-favorite-remove-read/);
  assert.match(html, /标记已读/);
  assert.match(html, /撤销/);
  assert.match(html, /未阅读/);
  assert.match(html, /删除/);
  assert.match(html, /bindFavoriteWorkflowActions/);
  assert.match(html, /pendingFavoriteReadTimers/);
  assert.match(html, /scheduleFavoriteMarkRead/);
  assert.match(html, /undoFavoriteMarkRead/);
  assert.match(html, /setTimeout\(async \(\) =>/);
  assert.match(html, /}, 3000\)/);
  assert.match(html, /favoriteReadFade 3s ease forwards/);
  assert.match(html, /updatePaperNote\(paper, \{ read: true \}\)/);
  assert.match(html, /updatePaperNote\(paper, \{ read: false \}\)/);
  assert.match(html, /updateFavorite\(paper, false\)/);
  assert.match(html, /function findPaperByStableKey\(key\)/);
  assert.match(html, /paperLookupKeys\(item\)\.includes\(normalizedTarget\)/);
});

test("paper notes use backend json persistence for short title, read, and starred state", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\/api\/paper-notes/);
  assert.match(html, /loadPaperNotesData/);
  assert.match(html, /updatePaperNote/);
  assert.match(html, /paperNoteByKey/);
  assert.match(html, /data-remove-paper-category/);
  assert.match(html, /data-add-paper-category/);
  assert.match(html, /data-category-menu-toggle/);
  assert.match(html, /function updatePaperCategories\(paper, categories\)/);
  assert.match(html, /updatePaperNote\(paper, \{ categories \}\)/);
  assert.doesNotMatch(html, /paperhot\.shortTitles\.v1/);
});

test("user background editor keeps multiline formatting readable", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /user-background-input/);
  assert.match(html, /data-integration-field="userBackground"/);
  assert.match(html, /white-space:\s*pre-wrap/);
  assert.match(html, /line-height:\s*1\.6/);
});

test("config page exposes first-run status and local data import export", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /setup-status-panel/);
  assert.match(html, /renderSetupStatus/);
  assert.match(html, /data-export-local/);
  assert.match(html, /data-import-local/);
  assert.match(html, /data-import-allow-secrets/);
  assert.match(html, /data-export-include-profile/);
  assert.match(html, /data-export-include-secrets/);
  assert.match(html, /data-export-include-papers/);
  assert.match(html, /data-export-include-stats/);
  assert.match(html, /data-export-include-logs/);
  assert.match(html, /\/api\/local-data\/export/);
  assert.match(html, /includeProfile/);
  assert.match(html, /includeSecrets/);
  assert.match(html, /includePapers/);
  assert.match(html, /includeStats/);
  assert.match(html, /includeLogs/);
  assert.match(html, /allowSecrets/);
  assert.match(html, /\/api\/local-data\/import/);
  assert.match(html, /不包含 API Key/);
});

test("local data export and import use zip files", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /accept="[^"]*application\/zip[^"]*\.zip/);
  assert.match(html, /response\.blob\(\)/);
  assert.match(html, /paper-hot-local-data[\s\S]*\.zip/);
  assert.match(html, /Content-Type": "application\/zip"/);
  assert.match(html, /file\.arrayBuffer\(\)/);
  assert.match(html, /ZIP\/JSON 文件/);
  assert.match(html, /API 配置已跳过/);
  assert.match(html, /允许导入并覆盖本机 API Key/);
});

test("keyword defaults are empty for open-source first run", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /const defaultKeywordState = \{\s*primary: \[\],\s*secondary: \[\],\s*inspiration: \[\]\s*\}/);
  assert.doesNotMatch(html, /defaultKeywordState[\s\S]*structured illumination microscopy/);
  assert.doesNotMatch(html, /defaultKeywordState[\s\S]*diffusion prior/);
});

test("API config fields expose help links for obtaining keys", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /apiHelpContent/);
  assert.match(html, /data-api-help="llm"/);
  assert.match(html, /data-api-help="serpapi"/);
  assert.match(html, /data-api-help="easyscholar"/);
  assert.match(html, /data-api-help="firecrawl"/);
  assert.match(html, /https:\/\/serpapi\.com\/users\/sign_up/);
  assert.match(html, /https:\/\/www\.easyscholar\.cc\/console\/user\/open/);
  assert.match(html, /openApiHelp/);
});

test("today fetch panel removes disconnected Google manual and rolling controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.doesNotMatch(html, /googleStartItem/);
  assert.doesNotMatch(html, /data-reset-google-start/);
  assert.doesNotMatch(html, /googleRollingStatusText/);
  assert.doesNotMatch(html, /loadGoogleRollingStatus/);
  assert.doesNotMatch(html, /resetGoogleRollingStart/);
  assert.doesNotMatch(html, /留空时按本地滚动游标继续/);
  assert.doesNotMatch(html, /从第几篇开始/);
});

test("today workbench exposes approved discovery controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-search-mode="direction"/);
  assert.match(html, /data-search-mode="exact"/);
  assert.match(html, /方向检索/);
  assert.match(html, /指定论文/);
  assert.match(html, /data-keyword-clear/);
  assert.match(html, /data-keyword-delete/);
  assert.match(html, /AND 使用关键词之间的连接，OR 用于单独点亮关键词/);
  assert.match(html, /继续抓取/);
  assert.match(html, /从头重抓/);
  assert.match(html, /开始新抓取/);
  assert.match(html, /type="date"/);
  assert.match(html, /1个月[\s\S]*3个月[\s\S]*6个月[\s\S]*自定义/);
});

test("today search graph executes connected AND groups and independent OR state", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const groupsSource = readNamedFunction(html, "todaySearchLogicGroups", "buildTodaySearchExpression");
  const expressionSource = readNamedFunction(html, "buildTodaySearchExpression", "clearTodaySearchLogic");
  const clearSource = readNamedFunction(html, "clearTodaySearchLogic", "toggleTodayKeywordOr");
  const toggleSource = readNamedFunction(html, "toggleTodayKeywordOr", "connectTodayKeywords");
  const connectSource = readNamedFunction(html, "connectTodayKeywords", "removeTodayKeyword");
  const removeSource = readNamedFunction(html, "removeTodayKeyword", "todayDiscoveryRequestState");
  const api = new Function(`
    ${groupsSource}
    ${expressionSource}
    ${clearSource}
    ${toggleSource}
    ${connectSource}
    ${removeSource}
    return { buildTodaySearchExpression, clearTodaySearchLogic, toggleTodayKeywordOr, connectTodayKeywords, removeTodayKeyword };
  `)();

  let logic = { activeKeywords: ["SIM", "RIM"], andEdges: [] };
  logic = api.connectTodayKeywords(logic, "SIM", "inverse problem");
  assert.equal(api.buildTodaySearchExpression(logic), "(SIM AND inverse problem) OR RIM");
  logic = api.toggleTodayKeywordOr(logic, "SIM");
  assert.deepEqual(logic, { activeKeywords: ["RIM", "SIM"], andEdges: [] });
  logic = api.connectTodayKeywords(logic, "RIM", "far keyword");
  logic = api.removeTodayKeyword(logic, "far keyword");
  assert.deepEqual(logic, { activeKeywords: ["SIM"], andEdges: [] });
  assert.deepEqual(api.clearTodaySearchLogic(logic), { activeKeywords: [], andEdges: [] });
});

test("today keyword links use raised orthogonal lanes and expose a keyboard connection path", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const pathSource = readNamedFunction(html, "todayKeywordLinkPath", "todayKeyboardConnectionStep");
  const stepSource = readNamedFunction(html, "todayKeyboardConnectionStep", "todayDiscoveryRequestState");
  const api = new Function(`${pathSource}; ${stepSource}; return { todayKeywordLinkPath, todayKeyboardConnectionStep };`)();

  assert.equal(api.todayKeywordLinkPath({ x: 10, y: 20 }, { x: 90, y: 20 }, 5), "M 10 20 L 10 5 L 90 5 L 90 20");
  assert.deepEqual(api.todayKeyboardConnectionStep("", "SIM"), { selected: "SIM", connection: null });
  assert.deepEqual(api.todayKeyboardConnectionStep("SIM", "RIM"), { selected: "", connection: ["SIM", "RIM"] });
  assert.deepEqual(api.todayKeyboardConnectionStep("SIM", "SIM"), { selected: "", connection: null });
  assert.match(html, /data-keyword-connect=/);
  assert.match(html, /aria-label="连接 \$\{escapeHTML\(keyword\)\} 到另一个关键词"/);
  assert.match(html, /title="连接到另一个关键词"/);
  assert.match(html, /event\.key === "Escape"/);
  assert.doesNotMatch(html, /<[^>]+>OR<\/[^>]+>/);
});

test("user config writes serialize snapshots, ignore stale responses, and continue after failure", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const queueSource = readNamedFunction(html, "queueUserConfigWrite", "saveUserConfig");
  const requests = [];
  const applied = [];
  const pending = [];
  const harness = new Function("fetch", "applyUserConfig", "location", `
    let userConfigSaveQueue = Promise.resolve();
    let userConfigSaveRevision = 0;
    ${queueSource}
    return { queueUserConfigWrite };
  `)(
    (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, body: JSON.parse(options.body) });
      pending.push({ resolve, reject });
    }),
    config => applied.push(config),
    { protocol: "http:" }
  );

  const oldConfig = { searchLogic: { activeKeywords: ["old"], andEdges: [] } };
  const newConfig = { searchLogic: { activeKeywords: ["new"], andEdges: [] } };
  const first = harness.queueUserConfigWrite(oldConfig);
  oldConfig.searchLogic.activeKeywords[0] = "mutated-after-enqueue";
  const second = harness.queueUserConfigWrite(newConfig);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1, "second disk write must wait for the first response");
  assert.deepEqual(requests[0].body.searchLogic.activeKeywords, ["old"]);
  pending[0].resolve({ ok: true, json: async () => ({ config: requests[0].body }) });
  await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.deepEqual(applied, [], "the older response must not roll the UI back");
  pending[1].resolve({ ok: true, json: async () => ({ config: requests[1].body }) });
  await second;
  assert.deepEqual(applied.map(config => config.searchLogic.activeKeywords), [["new"]]);

  const failed = harness.queueUserConfigWrite({ searchLogic: { activeKeywords: [], andEdges: [] } });
  const recovered = harness.queueUserConfigWrite({ searchLogic: { activeKeywords: ["after-failure"], andEdges: [] } });
  await new Promise(resolve => setImmediate(resolve));
  pending[2].reject(new Error("disk failed"));
  await assert.rejects(failed, /disk failed/);
  await new Promise(resolve => setImmediate(resolve));
  pending[3].resolve({ ok: true, json: async () => ({ config: requests[3].body }) });
  await recovered;
  assert.deepEqual(applied.at(-1).searchLogic.activeKeywords, ["after-failure"]);
});

test("today calendar ranges use local date parts, clamp month ends, and reject incomplete custom dates", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const dateSource = readNamedFunction(html, "todayDateInputValue", "todayMonthsAgo");
  const monthsSource = readNamedFunction(html, "todayMonthsAgo", "todayPresetRange");
  const presetSource = readNamedFunction(html, "todayPresetRange", "normalizeFetchRange");
  const normalizeSource = readNamedFunction(html, "normalizeFetchRange", "loadFetchRange");
  const validDateSource = readNamedFunction(html, "todayDateIsValid", "todayFetchRangeValidation");
  const validationSource = readNamedFunction(html, "todayFetchRangeValidation", "todaySearchLogicGroups");
  const api = new Function(`${dateSource}; ${monthsSource}; ${presetSource}; ${normalizeSource}; ${validDateSource}; ${validationSource}; return { todayDateInputValue, todayMonthsAgo, todayPresetRange, normalizeFetchRange, todayFetchRangeValidation };`)();

  assert.equal(api.todayDateInputValue({ getFullYear: () => 2026, getMonth: () => 6, getDate: () => 13 }), "2026-07-13");
  assert.equal(api.todayMonthsAgo(1, "2026-03-31"), "2026-02-28");
  assert.equal(api.todayMonthsAgo(1, "2024-03-31"), "2024-02-29");
  assert.deepEqual(api.normalizeFetchRange({ preset: "3m", startDate: "2020-01-01", endDate: "2020-04-01" }, "2026-07-13"), {
    preset: "3m", startDate: "2026-04-13", endDate: "2026-07-13"
  });
  assert.equal(api.normalizeFetchRange({ preset: "3m" }, "2026-07-14").endDate, "2026-07-14");
  assert.equal(api.todayFetchRangeValidation({ preset: "custom", startDate: "", endDate: "2026-07-13" }).valid, false);
  assert.equal(api.todayFetchRangeValidation({ preset: "custom", startDate: "2026-07-14", endDate: "2026-07-13" }).valid, false);
  assert.equal(api.todayFetchRangeValidation({ preset: "custom", startDate: "2026-02-30", endDate: "2026-03-01" }).valid, false);
  assert.deepEqual(api.todayFetchRangeValidation({ preset: "custom", startDate: "2026-07-01", endDate: "2026-07-13" }), { valid: true, error: "" });
  assert.doesNotMatch(monthsSource, /toISOString/);
});

test("today discovery request emits the seven canonical fields from one state", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const groupsSource = readNamedFunction(html, "todaySearchLogicGroups", "buildTodaySearchExpression");
  const expressionSource = readNamedFunction(html, "buildTodaySearchExpression", "clearTodaySearchLogic");
  const requestSource = readNamedFunction(html, "todayDiscoveryRequestBody", "todaySourceKeyForPaper");
  const todayDiscoveryRequestBody = new Function(`
    ${groupsSource}
    ${expressionSource}
    ${requestSource}
    return todayDiscoveryRequestBody;
  `)();
  const directionState = {
    searchMode: "direction",
    exactInput: "must not leak",
    searchLogic: { activeKeywords: ["SIM", "RIM"], andEdges: [["SIM", "RIM"]] },
    sources: ["arxiv", "webofscience"],
    fetchRange: { startDate: "2026-04-13", endDate: "2026-07-13" }
  };
  assert.deepEqual(todayDiscoveryRequestBody("resume", directionState), {
    searchMode: "direction",
    queryExpression: "(SIM AND RIM)",
    searchLogic: directionState.searchLogic,
    sources: ["arxiv", "webofscience"],
    startDate: "2026-04-13",
    endDate: "2026-07-13",
    resumeMode: "resume"
  });
  const exact = todayDiscoveryRequestBody("new", { ...directionState, searchMode: "exact", exactInput: "  WOS:000123  " });
  assert.equal(exact.queryExpression, "WOS:000123");
  assert.deepEqual(Object.keys(exact).sort(), ["endDate", "queryExpression", "resumeMode", "searchLogic", "searchMode", "sources", "startDate"]);

  const blockedLabelSource = readNamedFunction(html, "todayFetchBlockedLabel", "todayFetchActionState");
  const actionSource = readNamedFunction(html, "todayFetchActionState", "loadTodayFetchSessions");
  const actionApi = new Function(`${blockedLabelSource}; ${actionSource}; return { todayFetchBlockedLabel, todayFetchActionState };`)();
  const { todayFetchBlockedLabel, todayFetchActionState } = actionApi;
  assert.equal(todayFetchBlockedLabel({ searchMode: "direction", sources: ["webofscience"] }, "", { valid: true }), "请先点亮关键词");
  assert.equal(todayFetchBlockedLabel({ searchMode: "exact", sources: ["webofscience"] }, "", { valid: true }), "请输入论文信息");
  assert.equal(todayFetchBlockedLabel({ searchMode: "direction", sources: [] }, "SIM", { valid: true }), "请选择抓取信源");
  assert.equal(todayFetchBlockedLabel({ searchMode: "direction", sources: ["webofscience"] }, "SIM", { valid: false }), "请检查时间范围");
  assert.equal(todayFetchBlockedLabel({ searchMode: "direction", sources: ["webofscience"] }, "SIM", { valid: true }), "");
  assert.equal(todayFetchActionState({}, "idle", null, "请先点亮关键词").primaryLabel, "请先点亮关键词");
  assert.deepEqual(todayFetchActionState({ taskFingerprint: "same", resumable: true }, "ready"), {
    primaryLabel: "继续抓取",
    resumeMode: "resume",
    showRestart: true,
    disabled: false
  });
  assert.deepEqual(todayFetchActionState({ taskFingerprint: "same", resumable: false }, "ready"), {
    primaryLabel: "开始新抓取",
    resumeMode: "new",
    showRestart: false,
    disabled: false
  });
  assert.equal(todayFetchActionState({ taskFingerprint: "same", resumable: true }, "loading").resumeMode, "");
  assert.equal(todayFetchActionState({ taskFingerprint: "same", resumable: false }, "error").disabled, true);
});

test("today running task freezes its request and cannot replace current preflight state", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const freezeSource = readNamedFunction(html, "freezeTodayDiscoveryRequest", "syncTodayRunningCanonicalState");
  const syncSource = readNamedFunction(html, "syncTodayRunningCanonicalState", "todaySourceKeyForPaper");
  const api = new Function(`${freezeSource}; ${syncSource}; return { freezeTodayDiscoveryRequest, syncTodayRunningCanonicalState };`)();
  const request = {
    searchMode: "direction",
    queryExpression: "A",
    searchLogic: { activeKeywords: ["A"], andEdges: [["A", "B"]] },
    sources: ["arxiv"],
    startDate: "2026-04-13",
    endDate: "2026-07-13",
    resumeMode: "resume"
  };
  const runningA = {
    frozenRequest: api.freezeTodayDiscoveryRequest(request),
    canonicalState: { taskFingerprint: "A-start", resumable: true, sourcePages: {}, errors: [] },
    conditionRevision: 1
  };
  request.searchLogic.activeKeywords[0] = "mutated";
  request.sources.push("webofscience");
  assert.equal(runningA.frozenRequest.searchLogic.activeKeywords[0], "A");
  assert.deepEqual(runningA.frozenRequest.sources, ["arxiv"]);
  assert.ok(Object.isFrozen(runningA.frozenRequest.searchLogic.andEdges[0]));

  const currentB = { taskFingerprint: "B-current", resumable: true, sourcePages: {}, errors: [] };
  assert.equal(api.syncTodayRunningCanonicalState(runningA, runningA, {
    taskFingerprint: "A-poll", resumable: false, sourcePages: { arxiv: { nextPage: 2 } }, errors: []
  }), true);
  assert.equal(runningA.canonicalState.taskFingerprint, "A-poll");
  assert.equal(currentB.taskFingerprint, "B-current", "A poll must not overwrite B preflight state");

  const runningB = { frozenRequest: api.freezeTodayDiscoveryRequest({ ...request, queryExpression: "B" }), canonicalState: currentB, conditionRevision: 2 };
  assert.equal(api.syncTodayRunningCanonicalState(runningA, runningB, {
    taskFingerprint: "A-late", resumable: false, sourcePages: {}, errors: []
  }), false);
  assert.equal(runningA.canonicalState.taskFingerprint, "A-poll", "late A poll must be ignored after the active run changes");

  const actionSource = readNamedFunction(html, "todayFetchActionState", "loadTodayFetchSessions");
  const todayFetchActionState = new Function(`${actionSource}; return todayFetchActionState;`)();
  assert.deepEqual(todayFetchActionState(currentB, "ready", runningA), {
    primaryLabel: "抓取中",
    resumeMode: "",
    showRestart: false,
    disabled: true
  });
});

test("today results use fixed source tabs and automatic 15-paper batches", async () => {
  const [html, backendSource] = await Promise.all([
    fs.readFile(htmlFile, "utf8"),
    fs.readFile(backendFile, "utf8")
  ]);
  assert.match(html, /Web of Science[\s\S]*Google Scholar[\s\S]*arXiv \/ bioRxiv[\s\S]*所有信源/);
  assert.match(html, /const todayPaperBatchSize = 15/);
  assert.match(html, /const todayLoadedCounts = \{ webofscience: 15, googlescholar: 15, preprints: 15, all: 15 \}/);
  assert.match(html, /data-today-load-sentinel/);
  assert.match(html, /function bindTodayAutoLoad/);
  assert.match(html, /todayAutoLoadObserver\.disconnect\(\)/);
  assert.doesNotMatch(html, /data-load-more-papers/);

  const sourceKeySource = readNamedFunction(html, "todaySourceKeyForPaper", "todayPapersForSource");
  const sourceFilterSource = readNamedFunction(html, "todayPapersForSource", "nextTodayLoadedCount");
  const batchSource = readNamedFunction(html, "nextTodayLoadedCount", "todayFilterValueMatches");
  const api = new Function(`
    ${sourceKeySource}
    ${sourceFilterSource}
    ${batchSource}
    return { todaySourceKeyForPaper, todayPapersForSource, nextTodayLoadedCount };
  `)();
  const papers = [
    { id: "w", retrievalSource: "webofscience" },
    { id: "g", retrievalSource: "googlescholar" },
    { id: "a", retrievalSource: "arxiv" },
    { id: "b", retrievalSource: "biorxiv" },
    { id: "s", retrievalSource: "semanticscholar" }
  ];
  assert.deepEqual(api.todayPapersForSource(papers, "preprints").map(paper => paper.id), ["a", "b"]);
  assert.deepEqual(api.todayPapersForSource(papers, "all").map(paper => paper.id), ["w", "g", "a", "b", "s"]);
  assert.equal(api.nextTodayLoadedCount(15), 30);

  const lookupSource = readNamedFunction(html, "paperLookupKeys", "paperRetryIdentityMatches");
  const resultSource = readNamedFunction(html, "todayResultPapers", "todayDefaultSourceTab");
  const tabSource = readNamedFunction(html, "todayDefaultSourceTab", "todayVisiblePaperList");
  const { todayResultPapers, todayDefaultSourceTab } = new Function(`${lookupSource}; ${sourceKeySource}; ${sourceFilterSource}; ${resultSource}; ${tabSource}; return { todayResultPapers, todayDefaultSourceTab };`)();
  assert.deepEqual(todayResultPapers({ newPapers: [{ id: "new" }], papers: [{ id: "new" }, { id: "archive" }] }, "direction"), [
    { id: "new", archivedBeforeFetch: false },
    { id: "archive", archivedBeforeFetch: true }
  ]);
  assert.deepEqual(todayResultPapers({ exactCandidates: [{ id: "candidate" }], newPapers: [] }, "exact"), [{ id: "candidate" }]);
  assert.deepEqual(todayResultPapers({ exactCandidates: [], newPapers: [], papers: [{ id: "already-archived" }] }, "exact"), [{ id: "already-archived", archivedBeforeFetch: true }]);
  const tabPapers = [
    { id: "a", retrievalSource: "arxiv" },
    { id: "g", retrievalSource: "googlescholar" }
  ];
  assert.equal(todayDefaultSourceTab(tabPapers, ["arXiv", "Google Scholar"]), "googlescholar");
  assert.equal(todayDefaultSourceTab([{ id: "a", retrievalSource: "arxiv" }], ["arXiv"]), "preprints");
  assert.equal(todayDefaultSourceTab([], ["Web of Science"]), "all");
  const applySource = readNamedFunction(html, "applyPaperPayload", "refreshJournalMetrics");
  assert.match(applySource, /本次命中.*其中新增/);
  assert.doesNotMatch(applySource, /本次找到.*篇新论文|本次没有新增论文/);

  const matchSource = readNamedFunction(html, "todayFilterValueMatches", "todayPaperMatchesFilters");
  const todayFilterValueMatches = new Function(`${sourceKeySource}; ${matchSource}; return todayFilterValueMatches;`)();
  assert.equal(todayFilterValueMatches({ citationCount: null }, "citation", "zero"), false);
  assert.equal(todayFilterValueMatches({ citationCount: 0 }, "citation", "zero"), true);
  assert.doesNotMatch(html, /label: "日期精度"/);
  assert.doesNotMatch(html, /label: "日期完整度"/);
  assert.doesNotMatch(html, /data-today-filter-key="precision"/);
  assert.match(backendSource, /publishedPrecision/);
  assert.match(html, /data-paper-common-category="today"/);
  assert.match(html, /data-paper-common-stage="today"/);
  assert.match(html, /data-today-paper-sort/);
});

test("today result tab selects once, preserves manual choice, and resets for a new result set", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const sourceKeySource = readNamedFunction(html, "todaySourceKeyForPaper", "todayPapersForSource");
  const sourceFilterSource = readNamedFunction(html, "todayPapersForSource", "nextTodayLoadedCount");
  const defaultSource = readNamedFunction(html, "todayDefaultSourceTab", "todaySourceTabForResults");
  const selectionSource = readNamedFunction(html, "todaySourceTabForResults", "todayVisiblePaperList");
  const api = new Function(`${sourceKeySource}; ${sourceFilterSource}; ${defaultSource}; ${selectionSource}; return { todaySourceTabForResults };`)();
  const papers = [{ id: "a", retrievalSource: "arxiv" }];

  assert.equal(api.todaySourceTabForResults("webofscience", papers, ["arXiv"], false, false), "preprints");
  assert.equal(api.todaySourceTabForResults("googlescholar", papers, ["arXiv"], true, false), "googlescholar");
  assert.equal(api.todaySourceTabForResults("googlescholar", papers, ["arXiv"], true, true), "preprints");
  assert.match(html, /let todaySourceTabUserSelected = false/);
});

test("today keyboard connection keeps connector focus and uses one document Escape listener", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const renderSource = readNamedFunction(html, "renderTodayKeyboardConnectionState", "handleTodayKeyboardConnectionEscape");
  const escapeSource = readNamedFunction(html, "handleTodayKeyboardConnectionEscape", "bindTodayKeyboardConnectionEscape");
  const bindSource = readNamedFunction(html, "bindTodayKeyboardConnectionEscape", "renderTodayKeywordConnections");
  const listeners = new Set();
  const aria = [];
  let focusCount = 0;
  let renderCount = 0;
  const connector = {
    getAttribute: () => "SIM",
    setAttribute: (name, value) => aria.push([name, value]),
    focus: () => { focusCount += 1; }
  };
  const document = {
    querySelectorAll: () => [connector],
    addEventListener: (type, listener) => { if (type === "keydown") listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === "keydown") listeners.delete(listener); }
  };
  const harness = new Function("document", "window", "renderToday", "location", `
    let todayKeyboardConnectFrom = "SIM";
    ${renderSource}
    ${escapeSource}
    ${bindSource}
    return {
      bindTodayKeyboardConnectionEscape,
      renderTodayKeyboardConnectionState,
      state: () => todayKeyboardConnectFrom
    };
  `)(document, { requestAnimationFrame: callback => callback() }, () => { renderCount += 1; }, { hash: "#today" });

  harness.renderTodayKeyboardConnectionState("SIM");
  assert.equal(focusCount, 1);
  assert.deepEqual(aria.at(-1), ["aria-pressed", "true"]);
  harness.bindTodayKeyboardConnectionEscape();
  harness.bindTodayKeyboardConnectionEscape();
  assert.equal(listeners.size, 1, "rebinding must not leak document listeners");
  [...listeners][0]({ key: "Escape" });
  assert.equal(harness.state(), "");
  assert.equal(renderCount, 2);
  assert.equal(focusCount, 2);
  assert.deepEqual(aria.at(-1), ["aria-pressed", "false"]);
});

test("today keyboard connection Escape is scoped to the today page", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const escapeSource = readNamedFunction(html, "handleTodayKeyboardConnectionEscape", "bindTodayKeyboardConnectionEscape");
  let renderCount = 0;
  const harness = new Function("location", "renderTodayKeyboardConnectionState", `
    let todayKeyboardConnectFrom = "SIM";
    ${escapeSource}
    return {
      escape: handleTodayKeyboardConnectionEscape,
      state: () => todayKeyboardConnectFrom
    };
  `)({ hash: "#config" }, () => { renderCount += 1; });

  harness.escape({ key: "Escape" });
  assert.equal(harness.state(), "SIM");
  assert.equal(renderCount, 0);
});

test("config changes and returning to today invalidate the visible canonical task", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const applySource = readNamedFunction(html, "applyUserConfig", "applyUserState");
  const saveSource = readNamedFunction(html, "saveUserConfig", "renderKeywordConfig");
  const navigationSource = readNamedFunction(html, "handlePageHashChange", "startApp");
  let invalidations = 0;
  let renders = [];
  const localStorage = { setItem() {} };
  const applyHarness = new Function("invalidateTodayCanonicalTask", "localStorage", `
    let userConfig = {};
    let keywordState = {};
    let sourceState = [];
    let todaySearchLogic = { activeKeywords: [], andEdges: [] };
    const mergeSourceDefaults = items => items;
    const saveKeywordStateLocal = () => {};
    const saveSourceStateLocal = () => {};
    ${applySource}
    return { applyUserConfig };
  `)(() => { invalidations += 1; }, localStorage);
  applyHarness.applyUserConfig({
    keywords: { topics: [{ text: "RIM", enabled: true }] },
    sources: [{ title: "arXiv", enabled: true }],
    searchLogic: { activeKeywords: ["RIM"], andEdges: [] }
  });
  assert.equal(invalidations, 1);

  const saveHarness = new Function("invalidateTodayCanonicalTask", `
    const saveKeywordStateLocal = () => {};
    const saveSourceStateLocal = () => {};
    const currentUserConfig = () => ({ searchLogic: {} });
    const queueUserConfigWrite = async () => ({ ok: true });
    const console = { warn() {} };
    ${saveSource.replace(/^function saveUserConfig/, "async function saveUserConfig")}
    return { saveUserConfig };
  `)(() => { invalidations += 1; });
  await saveHarness.saveUserConfig();
  assert.equal(invalidations, 2);

  const location = { hash: "#config" };
  const encodeSource = readNamedFunction(html, "encodePaperRouteKey", "decodePaperRouteKey");
  const decodeSource = readNamedFunction(html, "decodePaperRouteKey", "paperDetailHash");
  const hashSource = readNamedFunction(html, "paperDetailHash", "parseLocationHash");
  const parseSource = readNamedFunction(html, "parseLocationHash", "currentPageName");
  const navigationHarness = new Function("location", "scheduleTodayTaskPreflight", "renderPage", "window", `
    let todayKeyboardConnectFrom = "SIM";
    function paperStableKey(paper) {
      return String(paper.id || paper.doi || paper.url || paper.title || "").trim();
    }
    ${encodeSource}
    ${decodeSource}
    ${hashSource}
    ${parseSource}
    ${navigationSource}
    return { handlePageHashChange, connection: () => todayKeyboardConnectFrom };
  `)(location, () => { invalidations += 1; }, page => renders.push(page), { addEventListener() {} });
  navigationHarness.handlePageHashChange();
  assert.equal(navigationHarness.connection(), "");
  assert.equal(invalidations, 2);
  assert.deepEqual(renders, ["config"]);
  location.hash = "#today";
  navigationHarness.handlePageHashChange();
  assert.equal(invalidations, 3);
  assert.deepEqual(renders, ["config", "today"]);

  assert.doesNotMatch(html, /conditionRevision:/);
});

test("today preflight ignores stale responses and preserves the last canonical state on failure", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const runSource = readNamedFunction(html, "runTodayTaskPreflight", "syncTodayPreflightCanonicalState");
  const pending = new Map();
  const synced = [];
  const harness = new Function("requestTodayTaskPreflight", "syncTodayPreflightCanonicalState", "renderToday", "location", `
    let todayTaskPreflightRevision = 2;
    let todayTaskPreflightStatus = "loading";
    let todayTaskPreflightError = "";
    async ${runSource}
    return {
      runTodayTaskPreflight,
      state: () => ({ todayTaskPreflightStatus, todayTaskPreflightError })
    };
  `)(
    (body, signal) => new Promise((resolve, reject) => pending.set(body.queryExpression, { resolve, reject, signal })),
    state => synced.push(state),
    () => {},
    { hash: "#today" }
  );
  const oldController = new AbortController();
  const newController = new AbortController();
  const oldRun = harness.runTodayTaskPreflight(1, oldController, { queryExpression: "old" });
  const newRun = harness.runTodayTaskPreflight(2, newController, { queryExpression: "new" });
  pending.get("new").resolve({ taskFingerprint: "new-fp", resumable: true, sourcePages: {}, sourceResults: [], errors: [] });
  await newRun;
  pending.get("old").resolve({ taskFingerprint: "old-fp", resumable: false, sourcePages: {}, sourceResults: [], errors: [] });
  await oldRun;
  assert.deepEqual(synced.map(state => state.taskFingerprint), ["new-fp"]);
  assert.equal(harness.state().todayTaskPreflightStatus, "ready");

  const failedController = new AbortController();
  const failedRun = harness.runTodayTaskPreflight(2, failedController, { queryExpression: "failed" });
  pending.get("failed").reject(new Error("offline"));
  await failedRun;
  assert.deepEqual(synced.map(state => state.taskFingerprint), ["new-fp"], "failed preflight must retain the existing canonical state");
  assert.equal(harness.state().todayTaskPreflightStatus, "error");
  assert.match(harness.state().todayTaskPreflightError, /offline/);

  assert.match(html, /clearTimeout\(todayTaskPreflightTimer\)/);
  assert.match(html, /todayTaskPreflightController\?\.abort\(\)/);
  assert.match(html, /scheduleTodayTaskPreflight/);
});

test("today auto-load disconnects stale observers and leaves short lists stable", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const source = readNamedFunction(html, "bindTodayAutoLoad", "bindPaperRefresh");
  let sentinel = null;
  let staleDisconnects = 0;
  let newDisconnects = 0;
  let callback;
  const harness = new Function("document", "window", "nextTodayLoadedCount", "todayVisiblePaperList", "renderToday", "staleObserver", `
    let todayAutoLoadObserver = staleObserver;
    let todaySourceTab = "all";
    const todayPaperBatchSize = 15;
    const todayLoadedCounts = { all: 15 };
    const IntersectionObserver = window.IntersectionObserver;
    ${source}
    return { bindTodayAutoLoad, count: () => todayLoadedCounts.all, observer: () => todayAutoLoadObserver };
  `)(
    { querySelector: () => sentinel },
    { IntersectionObserver: class {
      constructor(next) { callback = next; }
      observe() {}
      disconnect() { newDisconnects += 1; }
    } },
    (current, batch) => current + batch,
    () => [{ id: 1 }],
    () => {},
    { disconnect: () => { staleDisconnects += 1; } }
  );
  harness.bindTodayAutoLoad();
  assert.equal(staleDisconnects, 1);
  assert.equal(harness.observer(), null);
  assert.equal(harness.count(), 15);

  sentinel = {};
  harness.bindTodayAutoLoad();
  callback([{ isIntersecting: true }]);
  assert.equal(harness.count(), 30);
  assert.equal(newDisconnects, 1);
});

test("today polling errors retain existing cards and reset the running state", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const source = readNamedFunction(html, "loadPaperData", "fetchPaperPayloadOnce");
  let applyCalls = 0;
  const harness = new Function("location", "renderPage", "runPaperRefreshJob", "applyPaperPayload", "loadArchiveData", "loadFetchLogData", "freezeTodayDiscoveryRequest", "todayDiscoveryRequestBody", "scheduleTodayTaskPreflight", "persistTodayTaskFailureState", "persistTodayFetchSessionTaskMeta", `
    let todayPapers = [{ id: "kept" }];
    let paperDataStatus = "existing results";
    let paperDataMeta = { taskFingerprint: "old-task", errors: [] };
    let recentDataStatus = "existing results";
    let todayRunningTask = null;
    let todayTaskPreflightRevision = 0;
    let todayTaskPreflightTimer = null;
    let todayTaskPreflightController = null;
    let fetchProgress = { percent: 50 };
    const fetchRange = { startDate: "2026-07-01", endDate: "2026-07-13" };
    const renderCurrentPage = () => renderPage("today");
    async ${source}
    return {
      loadPaperData,
      state: () => ({ todayPapers, paperDataStatus, paperDataMeta, todayRunningTask, fetchProgress })
    };
  `)(
    { protocol: "http:", hash: "#today" },
    () => {},
    async () => {
      const error = new Error("poll offline");
      error.taskState = {
        taskFingerprint: "failed-task",
        sourcePages: { webofscience: { nextPage: 3, complete: false } },
        sourceResults: [{ source: "webofscience", status: "failed", returned: 0, message: "HTTP 429" }],
        errors: [{ source: "webofscience", message: "HTTP 429" }]
      };
      throw error;
    },
    () => { applyCalls += 1; },
    () => {},
    async () => {},
    request => JSON.parse(JSON.stringify(request)),
    resumeMode => ({ searchMode: "direction", queryExpression: "SIM", searchLogic: {}, sources: ["arxiv"], startDate: "2026-07-01", endDate: "2026-07-13", resumeMode }),
    () => {},
    () => {},
    () => {}
  );

  await harness.loadPaperData("range", true, "resume");
  assert.deepEqual(harness.state().todayPapers, [{ id: "kept" }]);
  assert.equal(applyCalls, 0);
  assert.match(harness.state().paperDataStatus, /poll offline/);
  assert.equal(harness.state().todayRunningTask, null);
  assert.equal(harness.state().fetchProgress, null);
  assert.equal(harness.state().paperDataMeta.taskFingerprint, "failed-task");
  assert.equal(harness.state().paperDataMeta.sourcePages.webofscience.nextPage, 3);
  assert.equal(harness.state().paperDataMeta.errors[0].message, "HTTP 429");
});

test("today task failures and LLM retries persist updated session metadata by fingerprint", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const mergeSource = readNamedFunction(html, "mergeTodayFetchSessionTaskMeta", "persistTodayFetchSessionTaskMeta");
  const mergeTodayFetchSessionTaskMeta = new Function(`${mergeSource}; return mergeTodayFetchSessionTaskMeta;`)();
  const sessions = [
    { id: "a", meta: { taskFingerprint: "task-a", errors: [] } },
    { id: "b", meta: { taskFingerprint: "task-b", errors: [{ message: "keep" }] } }
  ];
  const merged = mergeTodayFetchSessionTaskMeta(sessions, {
    taskFingerprint: "task-a",
    sourcePages: { webofscience: { nextPage: 3 } },
    errors: [{ source: "webofscience", message: "HTTP 429" }]
  });

  assert.equal(merged[0].meta.errors[0].message, "HTTP 429");
  assert.equal(merged[0].meta.sourcePages.webofscience.nextPage, 3);
  assert.equal(merged[1], sessions[1]);
  assert.match(html, /persistTodayFetchSessionTaskMeta\(paperDataMeta\)/);
  assert.match(html, /function clearPaperLlmFailure[\s\S]*todayFetchSessions[\s\S]*saveTodayFetchSessions\(\)/);
});

test("archive reload hydrates saved today sessions and clears resolved LLM failures", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const loadSource = readNamedFunction(html, "loadArchiveData", "paperRefreshBody");
  const syncSource = readNamedFunction(html, "syncTodayFetchSessionsFromPaperPool", "saveTodayFetchSession");

  assert.match(loadSource, /syncTodayFetchSessionsFromPaperPool\(recentPapers\)/);
  assert.match(syncSource, /removePaperLlmFailure/);
  assert.match(syncSource, /tokenUsage\?\.status === "已调用 AI"/);
});

test("a first failed today task persists independently of result sessions", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const loadSource = readNamedFunction(html, "loadTodayTaskFailureStates", "saveTodayTaskFailureStates");
  const saveSource = readNamedFunction(html, "saveTodayTaskFailureStates", "persistTodayTaskFailureState");
  const persistSource = readNamedFunction(html, "persistTodayTaskFailureState", "todayTaskFailureState");
  const lookupSource = readNamedFunction(html, "todayTaskFailureState", "loadTodayFetchSessions");
  const memory = new Map();
  const localStorage = {
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value)
  };
  const harness = new Function("localStorage", `
    const taskFailureStorageKey = "paperhot.todayTaskFailures.v1";
    let todayTaskFailureStates = {};
    ${loadSource}
    ${saveSource}
    ${persistSource}
    ${lookupSource}
    return {
      persistTodayTaskFailureState,
      reload: () => loadTodayTaskFailureStates(),
      lookup: fingerprint => todayTaskFailureState(fingerprint)
    };
  `)(localStorage);

  harness.persistTodayTaskFailureState({
    taskFingerprint: "first-failed-task",
    sourcePages: { webofscience: { nextPage: 3, complete: false } },
    errors: [{ source: "webofscience", message: "HTTP 429" }]
  });
  const reloaded = harness.reload();
  assert.equal(reloaded["first-failed-task"].sourcePages.webofscience.nextPage, 3);
  assert.equal(reloaded["first-failed-task"].errors[0].message, "HTTP 429");
  assert.equal(harness.lookup("first-failed-task").taskFingerprint, "first-failed-task");
  assert.match(html, /persistTodayTaskFailureState\(paperDataMeta\)/);
  assert.match(html, /todayTaskFailureState\(currentCanonical\.taskFingerprint\)/);
  assert.match(html, /function clearPaperLlmFailure[\s\S]*todayTaskFailureStates[\s\S]*saveTodayTaskFailureStates\(\)/);
});

test("today fetch sessions keep duplicate ranges with compact timestamp labels", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /fetchSessionTimeLabel/);
  assert.match(html, /const id = `\$\{startDate\}_\$\{endDate\}_\$\{fetchedAt\}`/);
  assert.match(html, /label: `\$\{rangeLabel\} · \$\{timeLabel\}`/);
  assert.match(html, /todayFetchSessions\.unshift\(session\)/);
  assert.match(html, /\$\{parts\[0\]\}\.\$\{parts\[1\]\}\.\$\{parts\[2\]\}/);
  assert.match(html, /\$\{pad\(date\.getHours\(\)\)\}:\$\{pad\(date\.getMinutes\(\)\)\}/);
});

test("today page shows last fetch time and elapsed age in hero", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function todayLastFetchHeroStatus/);
  assert.match(html, /function fetchLogEntryTime/);
  assert.match(html, /function elapsedSinceText/);
  assert.match(html, /上次抓取/);
  assert.match(html, /距今/);
  assert.match(html, /pageShell\("今日论文"[\s\S]*todayLastFetchHeroStatus\(\)/);
  assert.match(html, /loadFetchLogData/);
});

test("paper detail hash route encodes stable keys and exposes by-key API", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const serverSource = await fs.readFile(serverFile, "utf8");
  const backendSource = await fs.readFile(backendFile, "utf8");

  assert.match(backendSource, /function readPaperByKey\(/);
  assert.match(backendSource, /readPaperByKey,/);
  assert.match(serverSource, /pathname === "\/api\/papers\/by-key"/);
  assert.match(serverSource, /url\.searchParams\.get\("key"\)/);
  assert.match(serverSource, /sendJson\(res, 404/);
  assert.match(html, /function parseLocationHash\(/);
  assert.match(html, /function encodePaperRouteKey\(/);
  assert.match(html, /function decodePaperRouteKey\(/);
  assert.match(html, /function paperDetailHash\(/);
  assert.match(html, /#paper\//);
  assert.match(html, /\/api\/papers\/by-key\?key=/);
  assert.match(html, /function renderPaperDetail\(/);
  assert.match(html, /paper-detail/);
  assert.match(html, /data-paper-detail-link|paper-detail-link|paperDetailHash\(paper\)/);
  assert.doesNotMatch(
    html,
    /renderPage\(location\.hash\.replace\("#", ""\)/,
    "async data refreshes must preserve #paper/<stable-key> through parseLocationHash"
  );
  assert.match(html, /function renderCurrentPage\(\)[\s\S]*parseLocationHash\(\)[\s\S]*renderPage\(page, key\)/);

  const encodeSource = readNamedFunction(html, "encodePaperRouteKey", "decodePaperRouteKey");
  const decodeSource = readNamedFunction(html, "decodePaperRouteKey", "paperDetailHash");
  const hashSource = readNamedFunction(html, "paperDetailHash", "parseLocationHash");
  const parseSource = readNamedFunction(html, "parseLocationHash", "currentPageName");
  const api = new Function(`
    function paperStableKey(paper) {
      return String(paper.id || paper.doi || paper.url || paper.title || "").trim();
    }
    ${encodeSource}
    ${decodeSource}
    ${hashSource}
    ${parseSource}
    return { encodePaperRouteKey, decodePaperRouteKey, paperDetailHash, parseLocationHash };
  `)();

  const doiPaper = { doi: "10.1000/Detail/WithSlash", title: "DOI paper" };
  const urlPaper = { url: "https://example.test/a?b=1#c", title: "URL paper" };
  const doiHash = api.paperDetailHash(doiPaper);
  const urlHash = api.paperDetailHash(urlPaper);
  assert.equal(api.encodePaperRouteKey("10.1000/Detail/WithSlash"), encodeURIComponent("10.1000/Detail/WithSlash"));
  assert.equal(doiHash, `#paper/${encodeURIComponent("10.1000/Detail/WithSlash")}`);
  assert.equal(urlHash, `#paper/${encodeURIComponent("https://example.test/a?b=1#c")}`);
  assert.doesNotMatch(doiHash.slice("#paper/".length), /\//);
  assert.equal(api.decodePaperRouteKey(encodeURIComponent("10.1000/Detail/WithSlash")), "10.1000/Detail/WithSlash");
  assert.equal(api.parseLocationHash(doiHash).page, "paper");
  assert.equal(api.parseLocationHash(doiHash).key, "10.1000/Detail/WithSlash");
  assert.equal(api.parseLocationHash("#today").page, "today");
  assert.equal(api.parseLocationHash("").page, "today");
  assert.match(html, /未找到论文|缺少论文|返回全部论文|返回今日论文/);
  assert.match(html, /正在加载|加载论文/);
});

test("paper detail return navigation uses one contextual back control and session-only restore", async () => {
  const html = await fs.readFile(htmlFile, "utf8");

  // Single back control structure (no three-button row).
  assert.match(html, /function paperDetailBackControl\(/);
  assert.match(html, /function wrapPaperDetailPage\(/);
  assert.match(html, /class="paper-detail-toolbar"/);
  assert.match(html, /data-paper-detail-back/);
  assert.match(html, /paper-detail-back:focus-visible/);
  assert.match(html, /\.paper-detail-back\s*\{[\s\S]*min-height:\s*32px[\s\S]*min-width:\s*32px/);
  assert.doesNotMatch(html, /function paperDetailBackActions\(/);
  assert.doesNotMatch(html, /href="#all">返回全部论文[\s\S]*href="#today">返回今日论文[\s\S]*href="#favorites">返回个人收藏/);
  assert.match(html, /paper-detail-page[\s\S]*paper-detail-toolbar[\s\S]*paper-detail-back/);

  // Capture + restore machinery is session memory only.
  assert.match(html, /let paperDetailReturnContext\s*=\s*null/);
  assert.match(html, /function capturePaperDetailReturnContext\(/);
  assert.match(html, /function applyPaperDetailReturnLimits\(/);
  assert.match(html, /function schedulePaperDetailScrollRestore\(/);
  assert.match(html, /function runPaperDetailScrollRestore\(/);
  assert.match(html, /requestAnimationFrame\(\s*\(\)\s*=>\s*requestAnimationFrame\(step\)\s*\)/);
  assert.match(html, /prepareReturnFromPaperDetail/);
  const returnNavSources = [
    readNamedFunction(html, "capturePaperDetailReturnContext", "applyPaperDetailReturnLimits"),
    readNamedFunction(html, "applyPaperDetailReturnLimits", "schedulePaperDetailScrollRestore"),
    readNamedFunction(html, "schedulePaperDetailScrollRestore", "runPaperDetailScrollRestore"),
    readNamedFunction(html, "runPaperDetailScrollRestore", "maybeResumePaperDetailScrollRestore"),
    readNamedFunction(html, "prepareReturnFromPaperDetail", "paperExternalLinks")
  ].join("\n");
  assert.doesNotMatch(returnNavSources, /localStorage/);
  assert.doesNotMatch(returnNavSources, /exportLocalData|importLocalData/);

  // Source pages capture before hash navigation; return paths cover today/all/favorites.
  assert.match(html, /a\.paper-detail-link,\s*a\.paper-detail-action,\s*a\[href\^='#paper\/'\]/);
  assert.match(html, /capturePaperDetailReturnContext\(page,\s*paperKey\)/);
  assert.match(html, /page === "today" \|\| page === "all" \|\| page === "favorites"/);
  assert.match(html, /maybeResumePaperDetailScrollRestore\("today"\)/);
  assert.match(html, /maybeResumePaperDetailScrollRestore\("all"\)/);
  assert.match(html, /maybeResumePaperDetailScrollRestore\("favorites"\)/);

  // Filter/sort module state is not reset by return helpers.
  const applySource = readNamedFunction(html, "applyPaperDetailReturnLimits", "schedulePaperDetailScrollRestore");
  assert.doesNotMatch(applySource, /clearTodayTemporaryFilters|todayOverviewFilter\s*=|allCommonPaperFilters\.categories\.clear|favoriteCommonPaperFilters\.categories\.clear|selectedAllPaperKeywords\.clear|selectedFavoritePaperKeywords\.clear/);
  assert.match(applySource, /todayLoadedCounts|paperVisibleLimits\.set/);

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const labelSource = readNamedFunction(html, "paperDetailBackLabel", "paperDetailBackHref");
  const hrefSource = readNamedFunction(html, "paperDetailBackHref", "paperDetailBackControl");
  const sourcePageSource = readNamedFunction(html, "paperDetailBackSourcePage", "paperDetailBackLabel");
  const controlSource = readNamedFunction(html, "paperDetailBackControl", "wrapPaperDetailPage");
  const wrapSource = readNamedFunction(html, "wrapPaperDetailPage", "capturePaperDetailReturnContext");
  const captureSource = readNamedFunction(html, "capturePaperDetailReturnContext", "applyPaperDetailReturnLimits");
  const applyLimitsSource = readNamedFunction(html, "applyPaperDetailReturnLimits", "schedulePaperDetailScrollRestore");

  const backApi = new Function("escapeHTML", "state", `
    let paperDetailReturnContext = state.context;
    let todaySourceTab = state.todaySourceTab;
    let todaySourceTabUserSelected = state.todaySourceTabUserSelected;
    const todayLoadedCounts = { ...state.todayLoadedCounts };
    const todayPaperBatchSize = 15;
    const paperVisibleLimits = new Map(state.visibleLimitEntries || []);
    function paperVisibleLimitKey(scope) {
      if (scope === "all") return "all:test-key";
      if (scope === "favorites") return "favorites:test-key";
      return scope;
    }
    function paperVisibleLimit(scope) {
      return paperVisibleLimits.get(paperVisibleLimitKey(scope)) || 20;
    }
    function currentPageName() { return state.currentPage; }
    ${sourcePageSource}
    ${labelSource}
    ${hrefSource}
    ${controlSource}
    ${wrapSource}
    ${captureSource}
    ${applyLimitsSource}
    return {
      paperDetailBackControl,
      wrapPaperDetailPage,
      capturePaperDetailReturnContext,
      applyPaperDetailReturnLimits,
      get context() { return paperDetailReturnContext; },
      setContext(next) { paperDetailReturnContext = next; },
      get todayLoadedCounts() { return { ...todayLoadedCounts }; },
      get todaySourceTab() { return todaySourceTab; },
      get visibleLimitAll() { return paperVisibleLimits.get("all:test-key"); },
      get visibleLimitFavorites() { return paperVisibleLimits.get("favorites:test-key"); }
    };
  `);

  // Fallback without context -> #all, single control.
  const fallback = backApi(escapeHTML, {
    context: null,
    currentPage: "paper",
    todaySourceTab: "all",
    todaySourceTabUserSelected: false,
    todayLoadedCounts: { webofscience: 15, googlescholar: 15, preprints: 15, all: 15 }
  });
  const fallbackHtml = fallback.wrapPaperDetailPage("<article class='paper-detail'>body</article>");
  assert.equal((fallbackHtml.match(/data-paper-detail-back/g) || []).length, 1);
  assert.match(fallbackHtml, /data-paper-detail-back="all"/);
  assert.match(fallbackHtml, /href="#all"/);
  assert.match(fallbackHtml, /← 返回全部论文/);
  assert.ok(fallbackHtml.indexOf("paper-detail-toolbar") < fallbackHtml.indexOf("class='paper-detail'"));

  // today / all / favorites labels and hrefs from context.
  for (const [page, label] of [
    ["today", "返回今日论文"],
    ["all", "返回全部论文"],
    ["favorites", "返回个人收藏"]
  ]) {
    const api = backApi(escapeHTML, {
      context: { page, scrollY: 120 },
      currentPage: "paper",
      todaySourceTab: "webofscience",
      todaySourceTabUserSelected: true,
      todayLoadedCounts: { webofscience: 30, googlescholar: 15, preprints: 15, all: 45 }
    });
    const markup = api.paperDetailBackControl();
    assert.match(markup, new RegExp(`data-paper-detail-back="${page}"`));
    assert.match(markup, new RegExp(`href="#${page}"`));
    assert.match(markup, new RegExp(`← ${label}`));
    assert.equal((markup.match(/data-paper-detail-back/g) || []).length, 1);
  }

  // Capture stores route, scrollY and load counts; apply restores limits without inventing scroll.
  const captureApi = backApi(escapeHTML, {
    context: null,
    currentPage: "today",
    todaySourceTab: "webofscience",
    todaySourceTabUserSelected: false,
    todayLoadedCounts: { webofscience: 45, googlescholar: 15, preprints: 15, all: 60 }
  });
  // Fake scrollY for capture (Node has no window; production uses window/globalThis).
  const originalScrollY = Object.getOwnPropertyDescriptor(globalThis, "scrollY");
  Object.defineProperty(globalThis, "scrollY", { configurable: true, get: () => 640 });
  globalThis.pageYOffset = 640;
  const captured = captureApi.capturePaperDetailReturnContext("today");
  if (originalScrollY) Object.defineProperty(globalThis, "scrollY", originalScrollY);
  else delete globalThis.scrollY;
  delete globalThis.pageYOffset;
  assert.equal(captured.page, "today");
  assert.equal(captured.scrollY, 640);
  assert.equal(captured.todaySourceTab, "webofscience");
  assert.equal(captured.todayLoadedCounts.webofscience, 45);
  assert.equal(captured.todayLoadedCounts.all, 60);

  const restoreApi = backApi(escapeHTML, {
    context: null,
    currentPage: "paper",
    todaySourceTab: "all",
    todaySourceTabUserSelected: false,
    todayLoadedCounts: { webofscience: 15, googlescholar: 15, preprints: 15, all: 15 },
    visibleLimitEntries: [["all:test-key", 20], ["favorites:test-key", 20]]
  });
  restoreApi.applyPaperDetailReturnLimits({
    page: "today",
    todaySourceTab: "webofscience",
    todayLoadedCounts: { webofscience: 45, googlescholar: 15, preprints: 15, all: 60 }
  });
  assert.equal(restoreApi.todaySourceTab, "webofscience");
  assert.equal(restoreApi.todayLoadedCounts.webofscience, 45);
  restoreApi.applyPaperDetailReturnLimits({
    page: "all",
    visibleLimitKey: "all:test-key",
    visibleLimit: 80
  });
  assert.equal(restoreApi.visibleLimitAll, 80);
  restoreApi.applyPaperDetailReturnLimits({
    page: "favorites",
    visibleLimitKey: "favorites:test-key",
    visibleLimit: 60
  });
  assert.equal(restoreApi.visibleLimitFavorites, 60);

  // Scroll restore uses rAF chain and does not push history.
  const scheduleSource = readNamedFunction(html, "schedulePaperDetailScrollRestore", "runPaperDetailScrollRestore");
  const runSource = readNamedFunction(html, "runPaperDetailScrollRestore", "maybeResumePaperDetailScrollRestore");
  assert.match(scheduleSource, /paperDetailScrollRestore\s*=/);
  assert.match(runSource, /requestAnimationFrame/);
  assert.doesNotMatch(html, /history\.pushState\([\s\S]{0,80}paperDetail|paperDetail[\s\S]{0,80}history\.pushState/);
  assert.match(html, /prepareReturnFromPaperDetail\(normalized\)/);

  // Entering paper route scrolls to top once; loading/ready re-renders do not, return restore stays intact.
  assert.match(html, /function scrollPaperDetailViewToTop\(/);
  assert.match(
    html,
    /function renderPage\([\s\S]*enteringPaper\s*=\s*lastRenderedPageName\s*!==\s*"paper"[\s\S]*if\s*\(\s*enteringPaper\s*\)\s*paperDetailScrollRestore\s*=\s*null[\s\S]*if\s*\(\s*enteringPaper\s*\)\s*scrollPaperDetailViewToTop\s*\(/
  );
  // Top scroll is gated on enteringPaper only (not every renderPaperDetailView).
  const detailViewSource = readNamedFunction(html, "renderPaperDetailView", "loadPaperDetail");
  assert.doesNotMatch(detailViewSource, /scrollPaperDetailViewToTop|scrollTo\s*\(\s*0\s*,\s*0\s*\)/);
  // Return path still schedules list scroll restore independently of detail top scroll.
  const prepareSource = readNamedFunction(html, "prepareReturnFromPaperDetail", "scrollPaperDetailViewToTop");
  assert.match(prepareSource, /schedulePaperDetailScrollRestore\(ctx\.page,\s*ctx\.scrollY\)/);
  assert.match(prepareSource, /setPaperDetailRecentTitle\(ctx\.page,\s*ctx\.paperKey\)/);
  assert.doesNotMatch(prepareSource, /scrollPaperDetailViewToTop/);

  // Recent title mark: per-source session state, title-link only, no persistence.
  assert.match(html, /const paperDetailRecentTitleByPage\s*=\s*\{\s*today:\s*""\s*,\s*all:\s*""\s*,\s*favorites:\s*""\s*\}/);
  assert.match(html, /function setPaperDetailRecentTitle\(/);
  assert.match(html, /function isPaperDetailRecentTitle\(/);
  assert.match(html, /paper-detail-link-recent/);
  assert.match(html, /data-paper-detail-recent/);
  assert.match(html, /capturePaperDetailReturnContext\(page,\s*paperKey\)/);
  assert.match(html, /parseLocationHash\(href\)\.key/);
  // Light theme: exact muted gray on white, always underline; compound selector beats .paper-title a.
  assert.match(html, /\.paper-title\s+a\.paper-detail-link-recent\s*\{[\s\S]*color:\s*#8896A7[\s\S]*text-decoration:\s*underline/);
  assert.match(html, /\.paper-title\s+a\.paper-detail-link-recent:hover[\s\S]*color:\s*#0b94b2[\s\S]*text-decoration:\s*underline/);
  assert.match(html, /\.paper-title\s+a\.paper-detail-link-recent:focus-visible[\s\S]*color:\s*#0b94b2[\s\S]*text-decoration:\s*underline/);
  // Dark theme: readable muted gray matching auxiliary text, always underline + accent hover/focus.
  assert.match(html, /html\[data-theme="dark"\]\s+\.paper-title\s+a\.paper-detail-link-recent\s*\{[\s\S]*color:\s*#a7b6c9[\s\S]*text-decoration:\s*underline/);
  assert.match(html, /html\[data-theme="dark"\]\s+\.paper-title\s+a\.paper-detail-link-recent:hover[\s\S]*text-decoration:\s*underline/);
  assert.match(html, /html\[data-theme="dark"\]\s+\.paper-title\s+a\.paper-detail-link-recent:focus-visible[\s\S]*text-decoration:\s*underline/);
  assert.doesNotMatch(html, /\.paper-title\s+a\.paper-detail-link-recent[^{]*\{[^}]*!important/);
  assert.doesNotMatch(html, /\.paper-title\s+a\.paper-detail-link-recent[^{]*\{[^}]*opacity\s*:/);
  // Low-specificity-only rule is insufficient against `.paper-title a`.
  assert.doesNotMatch(html, /(?<!\.paper-title\s+a)\.paper-detail-link-recent\s*\{[\s\S]*color:\s*#8896A7/);
  assert.doesNotMatch(html, /paper-card-recent|saved-muted[\s\S]{0,40}recent/);
  // Specificity check: compound selector includes both .paper-title and .paper-detail-link-recent.
  const recentRule = html.match(/\.paper-title\s+a\.paper-detail-link-recent\s*\{[^}]*\}/);
  assert.ok(recentRule, "expected compound recent title rule");
  assert.match(recentRule[0], /\.paper-title/);
  assert.match(recentRule[0], /\.paper-detail-link-recent/);
  assert.match(recentRule[0], /#8896A7/);
  assert.match(recentRule[0], /text-decoration:\s*underline/);
  assert.doesNotMatch(recentRule[0], /!important|opacity\s*:/);
  // Target title remains 18px bold for ~3.01:1 contrast of #8896A7 on white.
  assert.match(html, /\.paper-title\s*\{[\s\S]*font-size:\s*18px[\s\S]*font-weight:\s*850/);
  const titleLinkSource = readNamedFunction(html, "paperTitleLink", "paperStableKey");
  assert.match(titleLinkSource, /isPaperDetailRecentTitle\(paper\)/);
  assert.match(titleLinkSource, /paper-detail-link-recent/);
  assert.doesNotMatch(titleLinkSource, /paper-card|saved-muted/);
  const recentHelpers = [
    readNamedFunction(html, "setPaperDetailRecentTitle", "isPaperDetailRecentTitle"),
    readNamedFunction(html, "isPaperDetailRecentTitle", "paperDetailBackSourcePage")
  ].join("\n");
  assert.doesNotMatch(recentHelpers, /localStorage|exportLocalData|importLocalData/);

  const recentApi = new Function(`
    const paperDetailRecentTitleByPage = { today: "", all: "", favorites: "" };
    function paperStableKey(paper) {
      return String(paper.id || paper.doi || paper.url || paper.title || "").trim();
    }
    function setPaperDetailRecentTitle(page, paperKey) {
      const source = String(page || "").trim();
      if (source !== "today" && source !== "all" && source !== "favorites") return;
      paperDetailRecentTitleByPage[source] = String(paperKey || "").trim();
    }
    function isPaperDetailRecentTitle(paper, page) {
      const source = String(page || "").trim();
      if (source !== "today" && source !== "all" && source !== "favorites") return false;
      const recent = String(paperDetailRecentTitleByPage[source] || "").trim();
      if (!recent) return false;
      const key = paperStableKey(paper);
      return Boolean(key) && key === recent;
    }
    function paperTitleLink(paper, page) {
      const recent = isPaperDetailRecentTitle(paper, page);
      const recentClass = recent ? " paper-detail-link-recent" : "";
      const recentAttr = recent ? ' data-paper-detail-recent="true"' : "";
      return '<a class="paper-detail-link' + recentClass + '" href="#paper/x"' + recentAttr + '>T</a>';
    }
    function prepareReturn(ctx, targetPage) {
      if (ctx && ctx.page === targetPage && ctx.paperKey) {
        setPaperDetailRecentTitle(ctx.page, ctx.paperKey);
      }
    }
    return {
      setPaperDetailRecentTitle,
      isPaperDetailRecentTitle,
      paperTitleLink,
      prepareReturn,
      snapshot: () => ({ ...paperDetailRecentTitleByPage })
    };
  `)();

  const pToday = { id: "t-1", title: "Today paper" };
  const pAll = { id: "a-1", title: "All paper" };
  const pFav = { id: "f-1", title: "Fav paper" };
  const pToday2 = { id: "t-2", title: "Today paper 2" };

  // Independent marks per source page.
  recentApi.setPaperDetailRecentTitle("today", "t-1");
  recentApi.setPaperDetailRecentTitle("all", "a-1");
  recentApi.setPaperDetailRecentTitle("favorites", "f-1");
  assert.equal(recentApi.isPaperDetailRecentTitle(pToday, "today"), true);
  assert.equal(recentApi.isPaperDetailRecentTitle(pAll, "all"), true);
  assert.equal(recentApi.isPaperDetailRecentTitle(pFav, "favorites"), true);
  assert.equal(recentApi.isPaperDetailRecentTitle(pToday, "all"), false);
  assert.equal(recentApi.isPaperDetailRecentTitle(pAll, "today"), false);
  assert.deepEqual(recentApi.snapshot(), { today: "t-1", all: "a-1", favorites: "f-1" });

  // Mark moves when another paper is opened on the same source.
  recentApi.setPaperDetailRecentTitle("today", "t-2");
  assert.equal(recentApi.isPaperDetailRecentTitle(pToday, "today"), false);
  assert.equal(recentApi.isPaperDetailRecentTitle(pToday2, "today"), true);
  assert.equal(recentApi.snapshot().all, "a-1", "other sources unchanged");

  // Fallback / mismatched return does not set mark.
  const before = recentApi.snapshot();
  recentApi.prepareReturn(null, "all");
  recentApi.prepareReturn({ page: "favorites", paperKey: "nope" }, "all");
  assert.deepEqual(recentApi.snapshot(), before);

  // Successful same-source return sets mark; title-only class (not card).
  recentApi.prepareReturn({ page: "all", paperKey: "a-new" }, "all");
  assert.equal(recentApi.snapshot().all, "a-new");
  const recentMarkup = recentApi.paperTitleLink({ id: "a-new" }, "all");
  const plainMarkup = recentApi.paperTitleLink({ id: "other" }, "all");
  assert.match(recentMarkup, /paper-detail-link-recent/);
  assert.match(recentMarkup, /data-paper-detail-recent="true"/);
  assert.doesNotMatch(plainMarkup, /paper-detail-link-recent|data-paper-detail-recent/);
  assert.doesNotMatch(recentMarkup, /paper-card|saved-muted/);
});

test("theme preference stays in versioned localStorage and covers dark mode styles", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /paperhot\.theme\.v1/);
  assert.match(html, /data-theme-toggle/);
  assert.match(html, /data-theme-toggle data-theme-compact/);
  assert.match(html, /@media \(max-width: 820px\)[\s\S]*\.mobile-theme-toggle/);
  assert.match(html, /\[data-theme="dark"\]/);
  assert.match(html, /html\[data-theme="dark"\] \.candidate-table-wrap/);
  assert.match(html, /html\[data-theme="dark"\] \.candidate-table td/);
  assert.match(html, /aria-label="[^"]*(?:暗色|浅色|主题)[^"]*"/);
  assert.match(html, /function applyThemePreference\(/);
  assert.match(html, /function loadThemePreference\(/);
  assert.match(html, /function saveThemePreference\(/);
  assert.match(html, /function toggleThemePreference\(/);
  assert.doesNotMatch(html, /paperhot\.theme\.v1[\s\S]{0,80}exportLocalData|exportLocalData[\s\S]{0,200}paperhot\.theme\.v1/);
  assert.doesNotMatch(html, /writeUserConfig\([^\)]*theme|config\.json[^\n]*theme/i);

  const loadSource = readNamedFunction(html, "loadThemePreference", "saveThemePreference");
  const saveSource = readNamedFunction(html, "saveThemePreference", "applyThemePreference");
  const applySource = readNamedFunction(html, "applyThemePreference", "toggleThemePreference");
  const toggleSource = readNamedFunction(html, "toggleThemePreference", "bindThemeToggle");
  const memory = new Map();
  const documentElement = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name]; }
  };
  const harness = new Function("localStorage", "document", `
    const themeStorageKey = "paperhot.theme.v1";
    let themePreference = "light";
    ${loadSource}
    ${saveSource}
    ${applySource}
    ${toggleSource}
    return {
      loadThemePreference,
      saveThemePreference,
      applyThemePreference,
      toggleThemePreference,
      get preference() { return themePreference; },
      get attrs() { return document.documentElement.attrs; }
    };
  `)({
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value)
  }, { documentElement, querySelectorAll: () => [] });

  assert.equal(harness.loadThemePreference(), "light");
  harness.applyThemePreference("dark");
  assert.equal(harness.preference, "dark");
  assert.equal(harness.attrs["data-theme"], "dark");
  assert.equal(memory.get("paperhot.theme.v1"), "dark");
  harness.toggleThemePreference();
  assert.equal(harness.preference, "light");
  assert.equal(harness.attrs["data-theme"], undefined);
  assert.equal(memory.get("paperhot.theme.v1"), "light");
  memory.set("paperhot.theme.v1", "dark");
  assert.equal(harness.loadThemePreference(), "dark");
});

test("frontend embedded script has valid syntax", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(matches.length >= 1, "expected inline script");
  matches.forEach((match, index) => {
    try {
      new Function(match[1]);
    } catch (error) {
      error.message = `script #${index + 1}: ${error.message}`;
      throw error;
    }
  });
});

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

test("lineage archive button renders from state so async re-renders stay idempotent and cannot double-submit", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const bodySource = readNamedFunction(html, "lineagePaperBody", "renderLineagePaperView");
  assert.match(bodySource, /lineagePaperState\.archiveStatus/, "按钮文案/禁用状态必须来自 lineagePaperState 而非只改 DOM");
  const bindSource = readNamedFunction(html, "bindLineageArchiveButton", "loadLineagePaper");
  assert.match(bindSource, /lineagePaperState\s*=\s*\{\s*\.\.\.lineagePaperState,\s*archiveStatus:\s*"pending"\s*\}/, "点击加入后必须把 pending 写回状态");
  assert.match(bindSource, /archiveStatus:\s*payload\.existed\s*\?\s*"existed"\s*:\s*"added"/, "成功后必须把 added/existed 写回状态");
  assert.match(bindSource, /lineagePaperState\.archiveStatus\s*!==\s*"idle"/, "非 idle 状态下再次点击必须被拦截，避免重复提交");
  // 成功/失败分支完成后必须触发一次 renderLineagePaperView()，而不是写入闭包捕获的 button 节点——
  // 谱系图异步加载可能已经把该节点替换掉，只写 DOM 会让按钮永久卡在“加入中…”。
  const successBranch = bindSource.slice(bindSource.indexOf("existed"));
  assert.match(successBranch.slice(0, successBranch.indexOf("catch")), /renderLineagePaperView\(\)/, "成功分支完成后必须重渲染而不是只写闭包捕获的 button 节点");
  const catchBranch = bindSource.slice(bindSource.indexOf("catch"));
  assert.match(catchBranch, /renderLineagePaperView\(\)/, "失败分支回退 idle 后也必须重渲染");
});

test("lineage archive button ignores late responses after navigating to another lineage paper", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const identitySource = readNamedFunction(html, "lineagePaperIdentity", "bindLineageArchiveButton");
  assert.match(identitySource, /paper\?\.id \|\| paper\?\.doi \|\| paper\?\.openAlexId \|\| paper\?\.url \|\| paper\?\.title/, "归档请求必须使用稳定论文身份判断晚到响应是否仍属于当前页");
  const bindSource = readNamedFunction(html, "bindLineageArchiveButton", "loadLineagePaper");
  assert.match(bindSource, /const requestKey = lineagePaperState\.key/, "点击时必须捕获当前 lineage page key");
  assert.match(bindSource, /const requestId = lineagePaperState\.requestId/, "点击时必须捕获当前 page requestId");
  assert.match(bindSource, /const paperIdentity = lineagePaperIdentity\(paper\)/, "点击时必须捕获当前论文稳定身份");
  assert.match(bindSource, /currentPageName\(\) === "lineage"[\s\S]*parseLocationHash\(\)\.key === requestKey[\s\S]*lineagePaperState\.requestId === requestId[\s\S]*lineagePaperIdentity\(lineagePaperState\.paper\) === paperIdentity/, "完成异步归档前必须确认仍停留在同一个外部论文页");
  assert.match(bindSource, /const response = await fetch[\s\S]*if \(!isCurrentArchiveRequest\(\)\) return;[\s\S]*const payload = await response\.json\(\)[\s\S]*if \(!isCurrentArchiveRequest\(\)\) return;[\s\S]*lineagePaperState = \{ \.\.\.lineagePaperState, archiveStatus: payload\.existed \? "existed" : "added" \}/, "fetch 和 JSON await 之后、写成功状态前都必须阻止晚到请求污染新页面");
  assert.match(bindSource, /catch \(error\) \{[\s\S]*if \(!isCurrentArchiveRequest\(\)\) return;[\s\S]*archiveStatus: "idle"/, "失败分支也不能把新页面 pending 状态重置为 idle");
});

test("renderLineagePaper clears sidebar nav highlight and reports missing key instead of hanging on a spinner", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const renderSource = readNamedFunction(html, "renderLineagePaper", "renderPaperDetail");
  assert.match(renderSource, /setActiveNav\(""\)/, "进入引文谱系外部论文页需清除侧边栏高亮，与 renderPaperDetail 一致");
  assert.match(renderSource, /if\s*\(!cleanKey\)\s*\{[\s\S]*?error[\s\S]*?缺少论文标识/, "空 key 必须直接给出错误态，不能停留在 loading");
  assert.doesNotMatch(renderSource, /if\s*\(cleanKey\)\s*loadLineagePaper/, "空 key 分支需提前 return，不应仍然尝试触发加载");
});

test("leaving a list through the lineage page still restores scroll and recent-title context", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(
    html,
    /\(lastRenderedPageName === "paper" \|\| lastRenderedPageName === "lineage"\) && normalized !== "paper"/,
    "全部论文 -> #paper/X -> #lineage/Y -> 全部论文 不应丢失滚动/展开/最近标记上下文"
  );
});

test("lineage graph styles cover light and dark themes with trail highlight", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\.lineage-graph\s*\{[\s\S]*?width:\s*100%/);
  assert.match(html, /\.paper-detail\s*\{[^}]*min-width:\s*0/);
  assert.match(html, /\.paper-lineage-section\s*\{[^}]*max-width:\s*100%/);
  assert.match(html, /\.lineage-node-trail\s+circle\s*\{[\s\S]*?stroke:\s*#d4a017/);
  assert.match(html, /html\[data-theme="dark"\][^\{]*\.lineage-graph\s+line/);
  assert.match(html, /html\[data-theme="dark"\][^\{]*\.lineage-tooltip/);
});

test("lineage graph prefers short titles, wraps complete labels and scales nodes by citation count", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const titleSource = readNamedFunction(html, "lineageNodeTitle", "lineageTitleUnits");
  const unitsSource = readNamedFunction(html, "lineageTitleUnits", "lineageTitleLines");
  const linesSource = readNamedFunction(html, "lineageTitleLines", "lineageNodeRadius");
  const radiusSource = readNamedFunction(html, "lineageNodeRadius", "lineageNodeMarkup");
  const markupSource = readNamedFunction(html, "lineageNodeMarkup", "lineageGraphSvg");
  const graphSource = readNamedFunction(html, "lineageGraphSvg", "lineageTooltipHtml");
  const api = new Function("paperNoteByKey", `
    function escapeHTML(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    function lineageNodeHref(node) { return node?.doi ? \`#lineage/\${node.doi}\` : ""; }
    function lineageTrailKeys() { return new Set(); }
    ${titleSource}
    ${unitsSource}
    ${linesSource}
    ${radiusSource}
    ${markupSource}
    ${graphSource}
    return { lineageNodeTitle, lineageTitleLines, lineageNodeRadius, lineageGraphSvg };
  `)(new Map([
    ["10.1/local", { shortTitle: "手工短标题" }],
    ["10.1/default", { shortTitle: "2026@" }],
    ["10.1/undated", { shortTitle: "n.d.@" }]
  ]));

  assert.equal(
    api.lineageNodeTitle({ archiveKey: "10.1/local", shortTitle: "归档短标题", title: "完整标题" }),
    "手工短标题",
    "用户手工短标题优先级最高"
  );
  assert.equal(api.lineageNodeTitle({ shortTitle: "归档短标题", title: "完整标题" }), "归档短标题");
  assert.equal(
    api.lineageNodeTitle({ archiveKey: "10.1/default", shortTitle: "2026@", title: "默认占位符对应的完整标题" }),
    "默认占位符对应的完整标题",
    "只有年份和 @ 的默认短标题应视为未设置"
  );
  assert.equal(
    api.lineageNodeTitle({ archiveKey: "10.1/undated", shortTitle: "n.d.@", title: "无年份论文的完整标题" }),
    "无年份论文的完整标题",
    "无年份默认短标题也应视为未设置"
  );
  assert.equal(api.lineageNodeTitle({ shortTitle: "2026@Hessian SIM", title: "完整标题" }), "2026@Hessian SIM");
  assert.equal(api.lineageNodeTitle({ title: "Copper <SUP>2+</SUP> transport" }), "Copper 2+ transport");

  const fullTitle = "A complete foundational microscopy paper title that must remain visible";
  const wrapped = api.lineageTitleLines(fullTitle, 110);
  assert.ok(wrapped.length > 1, "长标题需要换行");
  assert.equal(wrapped.join(" "), fullTitle, "换行不得截断或改写标题");
  assert.doesNotMatch(wrapped.join(" "), /…|\.\.\./, "标题不得以省略号截断");
  const longWord = "SupercalifragilisticexpialidociousMicroscopy";
  assert.equal(api.lineageTitleLines(longWord, 96).join(""), longWord, "无空格超长词拆行后也不得丢字");

  const unknownRadius = api.lineageNodeRadius({ citationCount: null });
  const lowRadius = api.lineageNodeRadius({ citationCount: 1 });
  const mediumRadius = api.lineageNodeRadius({ citationCount: 100 });
  const highRadius = api.lineageNodeRadius({ citationCount: 10000 });
  assert.ok(unknownRadius <= lowRadius);
  assert.ok(lowRadius < mediumRadius);
  assert.ok(mediumRadius < highRadius);
  assert.ok(highRadius <= 18, "高被引节点半径需设上限，避免破坏布局");

  const svg = api.lineageGraphSvg({
    center: { title: "Center paper", citationCount: 100 },
    predecessors: [
      { title: fullTitle, citationCount: 1, doi: "10.1/a" },
      { shortTitle: "Short title in full", title: "Unused full title", citationCount: 10000, doi: "10.1/b" }
    ],
    successors: []
  });
  assert.match(svg, /<tspan/);
  assert.match(svg, /data-citation-count="10000"/);
  assert.match(svg, /Short title in full/);
  assert.doesNotMatch(svg, /…|\.\.\./);

  const denseSvg = api.lineageGraphSvg({
    center: { title: "Center paper", citationCount: 100 },
    predecessors: Array.from({ length: 10 }, (_, index) => ({
      title: `Complete predecessor title ${index + 1} with enough text to wrap`,
      citationCount: 10000,
      doi: `10.1/dense-${index + 1}`
    })),
    successors: []
  });
  const denseWidth = Number(denseSvg.match(/viewBox="0 0 ([\d.]+)/)?.[1]);
  assert.ok(denseWidth >= 1232, "10 个节点时画布需动态扩展，保证每个标签至少 96 宽并保留间隔");
  assert.match(denseSvg, new RegExp(`style="min-width:${denseWidth}px`), "实际 SVG 宽度需同步扩展，不能只放大 viewBox 后再被 CSS 压缩");
  const denseXs = [...denseSvg.matchAll(/data-lineage-node="pred-\d+"[\s\S]*?<circle cx="([\d.]+)"/g)]
    .map(match => Number(match[1]));
  assert.equal(denseXs.length, 10);
  denseXs.slice(1).forEach((x, index) => {
    assert.ok(x - denseXs[index] >= 112, "相邻节点中心需为 96 宽标签保留至少 16 的间隔");
  });

  const crowdedSvg = api.lineageGraphSvg({
    center: { title: "Center paper", citationCount: 100 },
    predecessors: Array.from({ length: 26 }, (_, index) => ({
      title: `P${index + 1}`,
      citationCount: 100000,
      doi: `10.1/crowded-${index + 1}`
    })),
    successors: []
  });
  const crowdedXs = [...crowdedSvg.matchAll(/data-lineage-node="pred-\d+"[\s\S]*?<circle cx="([\d.]+)" cy="[\d.]+" r="([\d.]+)"/g)]
    .map(match => ({ x: Number(match[1]), radius: Number(match[2]) }));
  assert.equal(crowdedXs.length, 26);
  crowdedXs.slice(1).forEach((entry, index) => {
    assert.ok(entry.x - crowdedXs[index].x > entry.radius + crowdedXs[index].radius, "高引用量节点再多也不能相互相交");
  });
});
