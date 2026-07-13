const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const htmlFile = path.join(__dirname, "..", "public", "index.html");
const logoFile = path.join(__dirname, "..", "public", "paperhot-logo.png");
const serverFile = path.join(__dirname, "..", "server.cjs");
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
  assert.match(html, /paper-source-row[\s\S]*publishedDoiControl[\s\S]*paperSourceLabel\(paper\)[\s\S]*journalMetricTags\(journalMetrics\)/);
  assert.match(html, /paper-title-row[\s\S]*paperTitleLink\(paper\)[\s\S]*<\/div>\s*<div class="paper-title-tools">[\s\S]*paperShortTitleEditor\(paper\)/);
  assert.match(html, /paper-signal-row[\s\S]*paperBibliography\(paper\)/);
});

test("all papers page supports combined filters and OR search", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /selectedAllPaperKeywords/);
  assert.match(html, /allPaperDateFilter/);
  assert.match(html, /paperMatchesAllFilters/);
  assert.match(html, /splitSearchOrClauses/);
  assert.match(html, /\\s\+OR\\s\+/i);
  assert.doesNotMatch(html, /data-all-filter-category/);
  assert.match(html, /data-all-filter-keyword/);
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

test("all papers page moves archive actions to the hero and removes type chips from the side filter", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /function pageShell\(title, subtitle, body, side = "", heroActions = ""\)/);
  assert.match(html, /if \(normalized === "all"\) renderAll\(\)/);
  assert.match(html, /pageShell\("全部论文"[\s\S]*archiveActionButtons\(\)/);
  const sideFilterMatch = html.match(/function allPaperSideFilter\(\) \{[\s\S]*?\n    function toggleSetValue/);
  assert.ok(sideFilterMatch, "expected allPaperSideFilter function");
  assert.match(sideFilterMatch[0], /关注标签/);
  assert.doesNotMatch(sideFilterMatch[0], /论文类型/);
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

test("paper card puts publication date in source row and copies DOI", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /published-date-pill/);
  assert.match(html, /data-copy-doi/);
  assert.match(html, /paperPublishedDoiControl/);
  assert.doesNotMatch(html, /paperDoiLine/);
  assert.match(html, /paper-signal-row/);
  assert.match(html, /AI Token/);
});

test("token stats page exposes fetch-log candidate detail view", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /data-fetch-log-detail/);
  assert.match(html, /renderFetchLogCandidateDetail/);
  assert.match(html, /领域过滤前候选论文/);
});

test("token stats cards label LLM usage count as calls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /调用 \$\{formatToken\(bucket\?\.papers\)\} 次/);
  assert.doesNotMatch(html, /输出 \$\{formatToken\(bucket\?\.completion\)\} · \$\{formatToken\(bucket\?\.papers\)\} 篇/);
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
  assert.match(html, /fetch\("\/api\/papers\/refresh\/start"/);
  assert.match(html, /fetch\(`\/api\/papers\/refresh\/status\?id=/);
  const requestBodySource = readNamedFunction(html, "paperRefreshBody", "runPaperRefreshJob");
  for (const field of ["searchMode", "queryExpression", "searchLogic", "sources", "startDate", "endDate", "resumeMode"]) {
    assert.match(requestBodySource, new RegExp(`\\b${field}\\b`));
  }

  const modeSource = readNamedFunction(serverSource, "refreshRequestMode", "buildFrozenRefreshOptions");
  const frozenSource = readNamedFunction(serverSource, "buildFrozenRefreshOptions", "createFetchJob");
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
});

test("today papers page exposes single paper LLM refresh actions", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /page !== "all" && scope !== "today" && scope !== "favorites"/);
  assert.match(html, /renderPaperTimeline\(filteredPapers, "today"\)/);
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
  assert.match(html, /const isSavedMuted = isSaved && scope !== "favorites"/);
  assert.match(html, /isSavedMuted \? "saved-muted" : ""/);
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

test("favorites page exposes mark-read and remove actions for reading workflow", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /favoritePaperWorkflowButton/);
  assert.match(html, /paperLlmRefreshButton\(paper, scope\)/);
  assert.match(html, /scope === "favorites" \? favoritePaperWorkflowButton\(paper, scope\) : paperLlmRefreshButton\(paper, scope\)/);
  assert.match(html, /scope === "favorites" \? paperLlmRefreshButton\(paper, scope\) : favoritePaperWorkflowButton\(paper, scope\)/);
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
  assert.match(html, /favoritePapersCache\.find\(item => paperStableKey\(item\) === key\)/);
});

test("paper notes use backend json persistence for short title, read, and starred state", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\/api\/paper-notes/);
  assert.match(html, /loadPaperNotesData/);
  assert.match(html, /updatePaperNote/);
  assert.match(html, /paperNoteByKey/);
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

test("frontend embedded script has valid syntax", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, "expected inline script");
  new Function(match[1]);
});
