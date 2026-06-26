const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const htmlFile = path.join(__dirname, "..", "public", "index.html");
const logoFile = path.join(__dirname, "..", "public", "paperhot-logo.png");

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
  assert.match(html, /allPaperSideFilter[\s\S]*关注标签/);
  assert.doesNotMatch(html, /allPaperSideFilter[\s\S]*论文类型/);
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

test("source config exposes Google rolling fetch option", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /rollingFetch: false/);
  assert.match(html, /data-source-integration-field="rollingFetch"/);
  assert.match(html, /启动滚动抓取/);
});

test("fetch progress panel exposes source page detail", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /sourcePage/);
  assert.match(html, /fetch-progress-page-detail/);
  assert.match(html, /正在抓第/);
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

test("today fetch panel exposes manual Google start item control", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /googleStartItem/);
  assert.match(html, /data-fetch-range="googleStartItem"/);
  assert.match(html, /从第几篇开始/);
  assert.match(html, /googleStartItem: fetchRange.googleStartItem/);
});

test("today fetch panel exposes Google rolling start status and reset action", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /googleRollingStatusText/);
  assert.match(html, /loadGoogleRollingStatus/);
  assert.match(html, /\/api\/google-rolling\/status/);
  assert.match(html, /\/api\/google-rolling\/reset/);
  assert.match(html, /data-reset-google-start/);
  assert.match(html, /自动：/);
  assert.match(html, /从第 \$\{escapeHTML\(item\.nextItem\)\} 篇开始/);
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
