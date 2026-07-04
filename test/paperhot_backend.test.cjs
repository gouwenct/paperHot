const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  classifyPaper,
  filterPapersByKeywords,
  normalizeArxivEntry,
  normalizeBioRxivItem,
  normalizeSemanticScholarPaper,
  normalizeWebOfScienceRecord,
  parseEnabledSources,
  refinePaperPool,
  buildArxivQuery,
  buildTokenStats,
  enrichPapersWithCrossref,
  enrichPapersWithJournalMetrics,
  enrichPapersWithLlmInsights,
  enrichTruncatedGoogleTitles,
  filterPapersByDate,
  fetchJournalMetrics,
  fetchGoogleScholarPapers,
  fetchGoogleSearchPapers,
  fetchPaperPayload,
  fetchWebOfSciencePapers,
  readGoogleRollingCursorStatus,
  resetGoogleRollingCursors,
  fetchLast7DaysPapers,
  fetchRecentPapers,
  filterPapersByDateRange,
  inferPaperShortTitle,
  readFetchLog,
  readOperationLog,
  appendFetchLog,
  appendOperationLog,
  testLlmConfig,
  readIntegrationConfigs,
  readIntegrationSecrets,
  readJournalMetricsConfig,
  readWebOfScienceConfig,
  readJournalMetricsCache,
  readFavoritesPayload,
  readPaperNotesPayload,
  readUserState,
  addCandidatePaperToArchive,
  removeCandidatePaperFromArchive,
  dedupePaperArchive,
  readArchivePayload,
  refreshJournalMetricsForArchive,
  refreshArchiveLlmInsights,
  refreshArchivePaperLlmInsight,
  updateFavoritePaper,
  updatePaperNote,
  retryFailedFetchLogEnrichment,
  writeIntegrationConfigs,
  writeUserConfig,
  writeUserProfile,
  exportLocalData,
  exportLocalDataZip,
  importLocalDataZip,
  importLocalData,
  parseZipEntries,
  scorePaper,
  rescorePaperAfterEnrichment
} = require("../paperhot_backend.cjs");

test("short title defaults to year prefix for manual technique editing", () => {
  const shortTitle = inferPaperShortTitle({
    title: "A deep learning enabled structured illumination microscope",
    summary: "We propose Deep-3D-SIM, a method abbreviation for volumetric structured illumination microscopy reconstruction.",
    published: "2026-02-03"
  });

  assert.equal(shortTitle, "2026@");
});

test("normalizes arXiv entries into the frontend paper schema", () => {
  const paper = normalizeArxivEntry({
    id: "https://arxiv.org/abs/2606.12345v1",
    title: "Diffusion Prior for Computational Microscopy",
    summary: "A neural inverse problem method for microscopy reconstruction.",
    doi: "10.48550/arXiv.2606.12345",
    published: "2026-06-19T09:20:00Z",
    authors: ["A. Researcher", "B. Scientist"],
    categories: ["cs.CV", "eess.IV"]
  });

  assert.equal(paper.id, "arxiv-2606.12345v1");
  assert.equal(paper.doi, "10.48550/arxiv.2606.12345");
  assert.equal(paper.journal, "arXiv");
  assert.match(paper.citation, /A\. Researcher, B\. Scientist \(2026\)\. Diffusion Prior for Computational Microscopy\. arXiv\. doi:10\.48550\/arxiv\.2606\.12345/);
  assert.equal(paper.sourceType, "预印本");
  assert.equal(paper.source, "arXiv cs.CV / eess.IV");
  assert.equal(paper.category, "neural");
  assert.equal(paper.categoryLabel, "带有神经网络算法");
  assert.ok(paper.categories.includes("classic"));
  assert.ok(paper.categoryLabels.includes("偏传统算法"));
  assert.equal(paper.time, "17:20");
  assert.deepEqual(paper.tags.slice(0, 2), ["cs.CV", "eess.IV"]);
  assert.match(paper.reason, /computational microscopy/i);
  assert.deepEqual(paper.tokenUsage, {
    prompt: 0,
    completion: 0,
    total: 0,
    status: "未调用 AI"
  });
  assert.deepEqual(paper.journalMetrics, {
    impactFactor: "",
    partition: "",
    upgradedPartition: "",
    source: "",
    status: "未查询"
  });
});

test("normalizes bioRxiv items into the frontend paper schema", () => {
  const paper = normalizeBioRxivItem({
    doi: "10.1101/2026.06.19.123456",
    title: "Structured illumination imaging of live cells",
    abstract: "This bioimage study uses structured illumination microscopy for live cell analysis.",
    date: "2026-06-19",
    authors: "A. Biologist; B. Microscopist",
    category: "Cell Biology"
  });

  assert.equal(paper.id, "biorxiv-10.1101/2026.06.19.123456");
  assert.equal(paper.doi, "10.1101/2026.06.19.123456");
  assert.equal(paper.journal, "bioRxiv");
  assert.match(paper.citation, /A\. Biologist, B\. Microscopist \(2026\)\. Structured illumination imaging of live cells\. bioRxiv\. doi:10\.1101\/2026\.06\.19\.123456/);
  assert.equal(paper.sourceType, "预印本");
  assert.equal(paper.source, "bioRxiv · Cell Biology");
  assert.equal(paper.category, "bio");
  assert.equal(paper.categoryLabel, "偏生物结果");
  assert.ok(paper.categoryLabels.includes("偏生物结果"));
  assert.equal(paper.time, "00:00");
  assert.match(paper.url, /biorxiv\.org/);
});

test("normalizes Semantic Scholar papers into the frontend paper schema", () => {
  const paper = normalizeSemanticScholarPaper({
    paperId: "abc123",
    title: "Physics-informed neural reconstruction for optical microscopy",
    abstract: "A deep learning inverse problem method improves fluorescence microscopy reconstruction.",
    year: 2026,
    publicationDate: "2026-06-18",
    venue: "Nature Methods",
    externalIds: { DOI: "10.1038/s41592-026-00001-1" },
    url: "https://www.semanticscholar.org/paper/abc123",
    authors: [{ name: "A. Author" }, { name: "B. Author" }],
    openAccessPdf: { url: "https://example.org/paper.pdf" }
  });

  assert.equal(paper.id, "semanticscholar-abc123");
  assert.equal(paper.doi, "10.1038/s41592-026-00001-1");
  assert.equal(paper.journal, "Nature Methods");
  assert.match(paper.citation, /A\. Author, B\. Author \(2026\)\. Physics-informed neural reconstruction for optical microscopy\. Nature Methods\. doi:10\.1038\/s41592-026-00001-1/);
  assert.equal(paper.sourceType, "论文数据库");
  assert.equal(paper.source, "Semantic Scholar · Nature Methods");
  assert.equal(paper.category, "neural");
  assert.ok(paper.categoryLabels.includes("偏传统算法"));
  assert.equal(paper.time, "00:00");
  assert.equal(paper.url, "https://www.semanticscholar.org/paper/abc123");
  assert.equal(paper.pdfUrl, "https://example.org/paper.pdf");
});

test("normalizes year-only Semantic Scholar dates without inventing January first", () => {
  const paper = normalizeSemanticScholarPaper({
    paperId: "year-only",
    title: "Structured illumination microscopy year only",
    abstract: "A structured illumination microscopy method.",
    year: 2025,
    venue: "Optica"
  });

  assert.equal(paper.published, "2025");
});

test("normalizes Web of Science records into the frontend paper schema", () => {
  const paper = normalizeWebOfScienceRecord({
    uid: "WOS:000123456789",
    title: "Structured illumination microscopy reconstruction with diffusion priors",
    names: { authors: [{ displayName: "A. Author" }, { displayName: "B. Scientist" }] },
    source: { sourceTitle: "Nature Methods", publishYear: 2026, publishMonth: "06", publishDay: "18" },
    identifiers: { doi: "10.1038/s41592-026-00001-1" },
    links: { record: "https://www.webofscience.com/wos/woscc/full-record/WOS:000123456789" },
    keywords: { authorKeywords: ["structured illumination microscopy", "diffusion prior"] }
  }, ["structured illumination microscopy"]);

  assert.equal(paper.id, "webofscience-10.1038/s41592-026-00001-1");
  assert.equal(paper.doi, "10.1038/s41592-026-00001-1");
  assert.equal(paper.journal, "Nature Methods");
  assert.equal(paper.sourceType, "论文数据库");
  assert.equal(paper.source, "Web of Science · Nature Methods");
  assert.equal(paper.published, "2026-06-18");
  assert.equal(paper.url, "https://www.webofscience.com/wos/woscc/full-record/WOS:000123456789");
  assert.deepEqual(paper.authors, ["A. Author", "B. Scientist"]);
  assert.ok(paper.tags.includes("Web of Science"));
  assert.match(paper.citation, /A\. Author, B\. Scientist \(2026\)\. Structured illumination microscopy reconstruction with diffusion priors\. Nature Methods\. doi:10\.1038\/s41592-026-00001-1/);
});

test("filters papers by configured keywords", () => {
  const papers = [
    { title: "SIM reconstruction", summary: "structured illumination microscopy", tags: [] },
    { title: "Transformer training", summary: "language modeling", tags: [] }
  ];

  const filtered = filterPapersByKeywords(papers, ["structured illumination", "RIM"]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, "SIM reconstruction");
});

test("does not treat simulation as the microscopy acronym SIM", () => {
  const papers = [
    { title: "Real-to-Sim robot transfer", summary: "A simulation platform for household manipulation.", tags: [] },
    { title: "SIM reconstruction", summary: "Structured illumination microscopy reconstruction.", tags: [] }
  ];

  const filtered = filterPapersByKeywords(papers, ["SIM"]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, "SIM reconstruction");
});

test("refines fetched paper pool before ranking", () => {
  const papers = [
    { title: "Real-to-Sim robot transfer", summary: "A simulation platform for robot learning.", tags: [], score: 98 },
    { title: "Charged Particle Reconstruction", summary: "The model takes \\sim 15 ms for detector hit reconstruction.", tags: [], score: 97 },
    { title: "Structured illumination microscopy reconstruction", summary: "SIM method for optical microscopy.", tags: [], score: 82 }
  ];

  const refined = refinePaperPool(papers, ["SIM"]);

  assert.equal(refined.length, 1);
  assert.equal(refined[0].title, "Structured illumination microscopy reconstruction");
});

test("uses broad method keywords for scoring but not as paper-pool anchors", () => {
  const papers = [
    { title: "Diffusion prior for radio maps", summary: "A diffusion prior estimates radio maps from sparse measurements.", tags: [], score: 96 },
    { title: "Diffusion prior for microscopy", summary: "A diffusion prior improves computational microscopy reconstruction.", tags: [], score: 90 }
  ];

  const refined = refinePaperPool(papers, ["computational microscopy", "diffusion prior"]);

  assert.equal(refined.length, 1);
  assert.equal(refined[0].title, "Diffusion prior for microscopy");
});

test("expands short microscopy acronyms before querying arXiv", () => {
  const query = buildArxivQuery(["SIM", "RIM", "PRIM"]);

  assert.match(query, /structured illumination microscopy/);
  assert.match(query, /random illumination microscopy/);
  assert.doesNotMatch(query, /all:SIM\b/);
});

test("keeps only papers published on the requested Beijing date", () => {
  const papers = [
    { title: "today", published: "2026-06-18T16:30:00Z" },
    { title: "old", published: "2026-06-17T16:30:00Z" },
    { title: "date-only", published: "2026-06-19" }
  ];

  const filtered = filterPapersByDate(papers, "2026-06-19");

  assert.deepEqual(filtered.map(paper => paper.title), ["today", "date-only"]);
});

test("recent paper refresh defaults to the 2026-05-01 → today range", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-paper-cache-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    endDate: "2026-06-19",
    keywords: ["structured illumination"],
    fetchers: {
      arxiv: async () => [
        {
          id: "arxiv-test-default-range",
          title: "Structured illumination microscopy reconstruction",
          summary: "A structured illumination method.",
          journal: "arXiv",
          source: "arXiv cs.CV",
          sourceType: "预印本",
          tags: [],
          published: "2026-06-19",
          score: 80
        }
      ],
      biorxiv: async () => [],
      semanticscholar: async () => [],
      crossref: async () => null,
      llm: async ({ paper }) => ({
        abstractZh: `中文摘要：${paper.summary}`,
        reason: "中文推荐理由。",
        tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test-llm", status: "已调用 AI" }
      })
    }
  });

  assert.equal(payload.count, 1);
  assert.equal(payload.mode, "recent");
  assert.equal(payload.startDate, "2026-05-01");
  assert.equal(payload.endDate, payload.date);
  assert.match(payload.cacheFile, /paperhot-paper-cache-/);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("last 7 days paper refresh uses a rolling 7 day range", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-last7-cache-"));
  const payload = await fetchLast7DaysPapers({
    dataDir: tempDir,
    date: "2026-06-22",
    keywords: ["structured illumination"],
    fetchers: {
      arxiv: async () => [
        {
          title: "recent structured illumination microscopy",
          summary: "structured illumination microscopy",
          tags: [],
          published: "2026-06-16T06:11:29Z",
          score: 80
        },
        {
          title: "older structured illumination microscopy",
          summary: "structured illumination microscopy",
          tags: [],
          published: "2026-06-15T06:11:29Z",
          score: 80
        }
      ],
      biorxiv: async () => [],
      semanticscholar: async () => [],
      crossref: async () => null,
      llm: async ({ paper }) => ({
        abstractZh: `中文摘要：${paper.summary}`,
        reason: "中文推荐理由。",
        tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test-llm", status: "已调用 AI" }
      })
    }
  });

  assert.equal(payload.mode, "last7");
  assert.equal(payload.startDate, "2026-06-16");
  assert.equal(payload.endDate, "2026-06-22");
  assert.deepEqual(payload.papers.map(paper => paper.title), ["recent structured illumination microscopy"]);
  assert.match(payload.cacheFile, /2026-06-22-last7\.json$/);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("today fetch includes Web of Science as a first-class source", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-today-"));
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      mode: "today",
      refresh: true,
      date: "2026-06-18",
      keywords: ["structured illumination microscopy"],
      sources: ["Web of Science"],
      fetchers: {
        webofscience: async () => [
          {
            id: "webofscience-wos-1",
            title: "Structured illumination microscopy reconstruction",
            summary: "A structured illumination microscopy method.",
            journal: "Nature Methods",
            source: "Web of Science · Nature Methods",
            sourceType: "论文数据库",
            tags: ["Web of Science", "Nature Methods"],
            published: "2026-06-18",
            score: 90,
            tokenUsage: { prompt: 0, completion: 0, total: 0, status: "未调用 AI" },
            journalMetrics: { impactFactor: "", partition: "", upgradedPartition: "", source: "", status: "未查询" }
          }
        ],
        crossref: async () => null,
        llm: async ({ paper }) => ({
          abstractZh: `中文摘要：${paper.summary}`,
          reason: "与结构光照显微重建直接相关。",
          tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test-llm", status: "已调用 AI" }
        })
      },
      journalMetrics: { config: { enabled: false } }
    });
    const logs = await readFetchLog(tempDir);

    assert.equal(payload.count, 1);
    assert.deepEqual(payload.sources, ["webofscience"]);
    assert.equal(payload.papers[0].source, "Web of Science · Nature Methods");
    assert.equal(payload.fetchReport.apis.find(call => call.api === "webofscience").returned, 1);
    assert.equal(logs[0].sources.find(source => source.api === "webofscience").count, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("fetch report records APIs called, LLM usage, and fetched papers", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-report-cache-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination"],
    fetchers: {
      arxiv: async () => [
        {
          title: "Structured illumination microscopy report test",
          summary: "A structured illumination microscopy method.",
          tags: [],
          published: "2026-05-20T06:11:29Z",
          score: 80
        }
      ],
      biorxiv: async () => { throw new Error("biorxiv down"); },
      semanticscholar: async () => [],
      llm: async () => ({
        summary: "中文摘要",
        reason: "中文推荐理由",
        tokenUsage: { prompt: 100, completion: 50, total: 150, model: "qwen-plus", status: "已调用 AI" }
      })
    }
  });

  const report = payload.fetchReport;
  assert.ok(report, "payload should include fetchReport");
  assert.equal(report.range.startDate, "2026-05-01");
  assert.equal(report.range.endDate, "2026-06-19");

  const arxivCall = report.apis.find(a => a.api === "arxiv");
  assert.equal(arxivCall.status, "ok");
  assert.equal(arxivCall.returned, 1);
  const biorxivCall = report.apis.find(a => a.api === "biorxiv");
  assert.equal(biorxivCall.status, "failed");

  assert.equal(report.llm.calls, 1);
  assert.equal(report.llm.totalTokens, 150);
  assert.equal(report.llm.models[0].model, "qwen-plus");
  assert.equal(report.llm.models[0].total, 150);

  assert.equal(report.fetchedCount, 1);
  assert.equal(report.papers[0].title, "Structured illumination microscopy report test");
  assert.equal(report.papers[0].model, "qwen-plus");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch progress reports pipeline counts while refreshing papers", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-progress-"));
  const progressEvents = [];
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination"],
    onProgress: event => progressEvents.push(event),
    fetchers: {
      arxiv: async () => [
        {
          title: "Structured illumination microscopy progress test",
          summary: "A structured illumination microscopy method.",
          tags: [],
          published: "2026-05-20T06:11:29Z",
          score: 80
        }
      ],
      biorxiv: async () => [],
      semanticscholar: async () => [],
      llm: async () => ({
        abstractZh: "中文摘要",
        reason: "中文推荐理由",
        tokenUsage: { prompt: 100, completion: 50, total: 150, model: "qwen-plus", status: "已调用 AI" }
      })
    }
  });

  assert.equal(payload.count, 1);
  assert.ok(progressEvents.length >= 6);
  assert.ok(progressEvents.some(event => event.stage === "dedupe" && event.counts.raw === 1));
  assert.ok(progressEvents.some(event => event.stage === "keyword" && event.counts.deduped === 1));
  assert.ok(progressEvents.some(event => event.stage === "domain" && event.counts.keywordMatched === 1));
  assert.ok(progressEvents.some(event => event.stage === "date" && event.counts.domainMatched === 1));
  assert.ok(progressEvents.some(event => event.stage === "done" && event.percent === 100 && event.counts.fetched === 1));
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log records per-source counts when papers were fetched", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-"));
  await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination"],
    sources: ["arXiv", "bioRxiv", "Semantic Scholar", "Google 搜索"],
    fetchers: {
      arxiv: async () => [
        { title: "Structured illumination microscopy log test", summary: "structured illumination microscopy", tags: [], published: "2026-05-20T06:11:29Z", score: 80 }
      ],
      biorxiv: async () => [],
      semanticscholar: async () => [],
      googlesearch: async () => { throw new Error("Google 搜索 信源失败：HTTP 401"); }
    }
  });
  const entries = await readFetchLog(tempDir);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].fetchedCount, 1);
  assert.deepEqual(entries[0].pipelineCounts, {
    raw: 1,
    deduped: 1,
    keywordMatched: 1,
    domainMatched: 1,
    dateMatched: 1,
    ranked: 1
  });
  const arxivSource = entries[0].sources.find(s => s.api === "arxiv");
  assert.equal(arxivSource.count, 1);
  const googleSource = entries[0].sources.find(s => s.api === "googlesearch");
  assert.equal(googleSource.status, "failed");
  assert.match(googleSource.message, /HTTP 401/);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log candidate snapshots use precise archive dates when available", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-date-enrich-"));
  await fs.mkdir(tempDir, { recursive: true });
  const titleA = "Fast, three-dimensional, live-cell super-resolution imaging with multiplane structured illumination microscopy";
  const urlA = "https://www.nature.com/articles/s41566-025-01638-9";
  const titleB = "Fast reconstruction and optical-sectioning three-dimensional structured illumination microscopy";
  const urlB = "https://www.cell.com/the-innovation/fulltext/S2666-6758(24)00195-4";
  await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        title: titleA,
        journal: "Nature Photonics",
        source: "Google Scholar · Nature …",
        published: "2025-03-03",
        doi: "10.1038/s41566-025-01638-9",
        url: urlA
      },
      {
        title: titleB,
        journal: "The Innovation",
        source: "Google Scholar · The Innovation",
        published: "2025-03-01",
        doi: "10.1016/j.xinn.2025.100812",
        url: urlB
      }
    ]
  }, null, 2), "utf8");
  const staleCandidates = [
    {
      title: titleA,
      journal: "Nature …",
      source: "Google Scholar · Nature …",
      published: "2025-01-01",
      doi: "",
      url: urlA,
      score: 96
    },
    {
      title: titleB,
      journal: "The Innovation",
      source: "Google Scholar · The Innovation",
      published: "2025-01-01",
      doi: "",
      url: urlB,
      score: 92
    }
  ];
  await appendFetchLog({
    at: "2026-06-23T12:33:52.258Z",
    mode: "recent",
    range: { mode: "recent", startDate: "2024-12-01", endDate: "2025-03-10" },
    candidateSnapshots: {
      beforeDomain: {
        total: 2,
        shown: 2,
        papers: staleCandidates
      },
      dateMatched: {
        total: 2,
        shown: 2,
        papers: staleCandidates
      }
    }
  }, tempDir);

  const [entry] = await readFetchLog(tempDir);
  for (const stageName of ["beforeDomain", "dateMatched"]) {
    const papers = entry.candidateSnapshots[stageName].papers;
    assert.equal(papers[0].published, "2025-03-03");
    assert.equal(papers[0].journal, "Nature Photonics");
    assert.equal(papers[0].doi, "10.1038/s41566-025-01638-9");
    assert.equal(papers[1].published, "2025-03-01");
    assert.equal(papers[1].journal, "The Innovation");
    assert.equal(papers[1].doi, "10.1016/j.xinn.2025.100812");
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log candidate snapshots downgrade unverified January first dates to year only", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-year-only-"));
  await appendFetchLog({
    at: "2026-06-23T12:33:52.258Z",
    mode: "recent",
    range: { mode: "recent", startDate: "2023-01-01", endDate: "2023-12-31" },
    candidateSnapshots: {
      beforeDomain: {
        total: 2,
        shown: 2,
        papers: [
          {
            title: "Open-3DSIM: an open-source three-dimensional structured illumination microscopy reconstruction platform",
            journal: "Nature …",
            source: "Google Scholar · Nature …",
            published: "2023-01-01",
            doi: "",
            url: "https://www.nature.com/articles/s41592-023-01958-0",
            score: 96
          },
          {
            title: "BioRxiv structured illumination microscopy exact date",
            journal: "bioRxiv",
            source: "bioRxiv",
            published: "2023-01-01",
            doi: "10.1101/test",
            url: "https://www.biorxiv.org/content/10.1101/test",
            score: 90
          }
        ]
      }
    }
  }, tempDir);

  const [entry] = await readFetchLog(tempDir);
  const [scholarPaper, preprintPaper] = entry.candidateSnapshots.beforeDomain.papers;
  assert.equal(scholarPaper.published, "2023");
  assert.equal(preprintPaper.published, "2023-01-01");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log records Google rolling page ranges and next offset", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-pages-"));
  const starts = [];
  await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-23",
    startDate: "2025-01-01",
    endDate: "2025-03-01",
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"],
    googleScholar: {
      config: {
        provider: "test-scholar-api",
        enabled: true,
        endpoint: "https://example.test/scholar",
        apiKey: "test-key",
        maxPages: 2,
        num: 20,
        rollingFetch: true,
        request: {
          method: "GET",
          queryName: "q",
          apiKeyQueryName: "api_key",
          useApiKeyHeader: false
        },
        responseMap: {
          items: "organic_results",
          title: "title",
          summary: "snippet",
          journal: "publication_info.summary",
          year: "publication_info.summary",
          url: "link"
        }
      },
      dataDir: tempDir,
      fetchImpl: async url => {
        const start = Number(url.searchParams.get("start") || "0");
        starts.push(start);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            organic_results: [
              {
                title: `Structured illumination microscopy page ${start}`,
                snippet: "A structured illumination microscopy result published on 2025-02-20.",
                publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
                link: `https://example.test/paper-${start}`
              }
            ],
            serpapi_pagination: start === 0 ? {
              next: "https://example.test/scholar?q=structured+illumination+microscopy&start=20"
            } : {}
          })
        };
      }
    },
    fetchers: {
      llm: async () => ({
        abstractZh: "中文摘要",
        reason: "中文推荐理由",
        tokenUsage: { prompt: 100, completion: 50, total: 150, model: "qwen-plus", status: "已调用 AI" }
      })
    }
  });

  const entries = await readFetchLog(tempDir);
  assert.deepEqual(starts, [0, 20]);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].sourcePages.googlescholar, {
    sourceLabel: "Google Scholar",
    firstPage: 1,
    lastPage: 2,
    firstStart: 0,
    lastStart: 20,
    num: 20,
    nextStart: 40,
    pages: 2,
    firstItem: 1,
    lastItem: 40
  });
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log records skipped Google rolling page ranges", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-skipped-pages-"));
  const starts = [];
  await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-23",
    startDate: "2025-01-01",
    endDate: "2025-03-01",
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"],
    googleScholar: {
      startItem: 181,
      config: {
        provider: "test-scholar-api",
        enabled: true,
        endpoint: "https://example.test/scholar",
        apiKey: "test-key",
        maxPages: 2,
        num: 20,
        rollingFetch: true,
        request: {
          method: "GET",
          queryName: "q",
          apiKeyQueryName: "api_key",
          useApiKeyHeader: false
        },
        responseMap: {
          items: "organic_results",
          title: "title",
          summary: "snippet",
          journal: "publication_info.summary",
          year: "publication_info.summary",
          url: "link"
        }
      },
      dataDir: tempDir,
      fetchImpl: async url => {
        const start = Number(url.searchParams.get("start") || "0");
        starts.push(start);
        if (start === 180) {
          return { ok: false, status: 429, text: async () => "Too many requests" };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            organic_results: [
              {
                title: `Structured illumination microscopy page ${start}`,
                snippet: "A structured illumination microscopy result published on 2025-02-20.",
                publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
                link: `https://example.test/paper-${start}`
              }
            ],
            serpapi_pagination: {}
          })
        };
      }
    },
    fetchers: {
      llm: async () => ({
        abstractZh: "中文摘要",
        reason: "中文推荐理由",
        tokenUsage: { prompt: 100, completion: 50, total: 150, model: "qwen-plus", status: "已调用 AI" }
      })
    }
  });

  const entries = await readFetchLog(tempDir);
  assert.deepEqual(starts, [180, 200]);
  assert.equal(entries[0].sourcePages.googlescholar.nextStart, 220);
  assert.equal(entries[0].sourcePages.googlescholar.pages, 1);
  assert.deepEqual(entries[0].sourcePages.googlescholar.skippedPages, [
    {
      start: 180,
      num: 20,
      itemStart: 181,
      itemEnd: 200,
      message: "Google Scholar 信源失败：HTTP 429"
    }
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("manual Google start item overrides the saved rolling cursor", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-start-"));
  const requestedStarts = [];
  const config = {
    provider: "test-scholar-api",
    enabled: true,
    endpoint: "https://example.test/scholar",
    apiKey: "test-key",
    maxPages: 2,
    num: 20,
    rollingFetch: true,
    request: {
      method: "GET",
      queryName: "q",
      apiKeyQueryName: "api_key",
      useApiKeyHeader: false
    },
    responseMap: {
      items: "organic_results",
      title: "title",
      summary: "snippet",
      journal: "publication_info.summary",
      year: "publication_info.summary",
      url: "link"
    }
  };

  await fetchGoogleScholarPapers(["structured illumination microscopy"], {
    dataDir: tempDir,
    config,
    fetchImpl: async url => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        organic_results: [],
        serpapi_pagination: {}
      })
    })
  });

  await fetchGoogleScholarPapers(["structured illumination microscopy"], {
    dataDir: tempDir,
    config,
    startItem: 41,
    fetchImpl: async url => {
      const start = Number(url.searchParams.get("start") || "0");
      requestedStarts.push(start);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          organic_results: [
            {
              title: `Structured illumination microscopy manual start ${start}`,
              snippet: "A structured illumination microscopy result.",
              publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
              link: `https://example.test/paper-${start}`
            }
          ],
          serpapi_pagination: start === 40 ? {
            next: "https://example.test/scholar?q=structured+illumination+microscopy&start=60"
          } : {}
        })
      };
    }
  });

  const cursorAfterManualFetch = JSON.parse(await fs.readFile(path.join(tempDir, "google-rolling-cursors.json"), "utf8"));
  assert.deepEqual(requestedStarts, [40, 60]);
  assert.equal(Object.values(cursorAfterManualFetch.cursors)[0].nextStart, 80);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("reads and resets Google rolling cursor status for current keywords and sources", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-google-cursor-status-"));
  const config = {
    provider: "test-scholar-api",
    enabled: true,
    endpoint: "https://example.test/scholar",
    apiKey: "test-key",
    maxPages: 1,
    num: 20,
    rollingFetch: true,
    request: {
      method: "GET",
      queryName: "q",
      apiKeyQueryName: "api_key",
      useApiKeyHeader: false
    },
    responseMap: {
      items: "organic_results",
      title: "title",
      summary: "snippet",
      journal: "publication_info.summary",
      year: "publication_info.summary",
      url: "link"
    }
  };

  await fetchGoogleScholarPapers(["structured illumination microscopy"], {
    dataDir: tempDir,
    config,
    fetchImpl: async url => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        organic_results: [
          {
            title: "Structured illumination microscopy cursor status",
            snippet: "A structured illumination microscopy result.",
            publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
            link: "https://example.test/paper"
          }
        ],
        serpapi_pagination: {
          next: "https://example.test/scholar?q=structured+illumination+microscopy&start=20"
        }
      })
    })
  });

  const status = await readGoogleRollingCursorStatus({
    dataDir: tempDir,
    config,
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"]
  });
  assert.equal(status.ok, true);
  assert.equal(status.items.length, 1);
  assert.equal(status.items[0].label, "Google Scholar");
  assert.equal(status.items[0].nextStart, 20);
  assert.equal(status.items[0].nextItem, 21);

  const reset = await resetGoogleRollingCursors({
    dataDir: tempDir,
    config,
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"]
  });
  assert.equal(reset.ok, true);
  assert.equal(reset.resetCount, 1);

  const afterReset = await readGoogleRollingCursorStatus({
    dataDir: tempDir,
    config,
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"]
  });
  assert.equal(afterReset.items[0].nextStart, 0);
  assert.equal(afterReset.items[0].nextItem, 1);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log keeps keyword-matched paper candidates before domain filtering", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-candidates-"));
  await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["diffusion prior"],
    sources: ["Google Scholar"],
    fetchers: {
      googlescholar: async () => [
        {
          title: "Structured illumination microscopy candidate kept",
          summary: "A diffusion prior improves structured illumination microscopy.",
          journal: "Nature Methods",
          source: "Google Scholar · Nature Methods",
          published: "2026-05-20",
          url: "https://example.test/kept",
          score: 90
        },
        {
          title: "Diffusion prior candidate before filter",
          summary: "A diffusion prior for a statistical benchmark.",
          journal: "Statistics Journal",
          source: "Google Scholar · Statistics Journal",
          published: "2026-05-21",
          url: "https://example.test/filtered",
          score: 88
        }
      ]
    }
  });

  const [entry] = await readFetchLog(tempDir);
  assert.equal(entry.pipelineCounts.keywordMatched, 2);
  assert.equal(entry.pipelineCounts.domainMatched, 1);
  assert.equal(entry.candidateSnapshots.beforeDomain.total, 2);
  assert.deepEqual(entry.candidateSnapshots.beforeDomain.papers.map(paper => paper.title), [
    "Structured illumination microscopy candidate kept",
    "Diffusion prior candidate before filter"
  ]);
  assert.equal(entry.candidateSnapshots.beforeDomain.papers[0].journal, "Nature Methods");
  assert.equal(entry.candidateSnapshots.beforeDomain.papers[1].journal, "Statistics Journal");
  assert.equal(entry.candidateSnapshots.beforeDomain.papers[0].summary, "A diffusion prior improves structured illumination microscopy.");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("adds candidate paper snapshots to archive without duplicating existing papers", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-candidate-add-"));
  const candidate = {
    title: "Structured illumination microscopy candidate",
    journal: "Nature Methods",
    source: "Google Scholar · Nature Methods",
    published: "2026-05-20",
    url: "https://example.test/candidate",
    doi: "10.1038/test-candidate",
    score: 92
  };

  const first = await addCandidatePaperToArchive(candidate, { dataDir: tempDir });
  const second = await addCandidatePaperToArchive(candidate, { dataDir: tempDir });

  assert.equal(first.added, true);
  assert.equal(first.existed, false);
  assert.equal(first.paper.title, candidate.title);
  assert.equal(first.paper.journal, "Nature Methods");
  assert.equal(first.paper.sourceType, "候选论文");
  assert.equal(second.added, false);
  assert.equal(second.existed, true);
  assert.equal(second.archive.count, 1);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("enriches candidate paper snapshots with abstract translation and recommendation before archiving", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-candidate-enrich-"));
  const candidate = {
    title: "Structured illumination microscopy candidate without saved abstract",
    journal: "Advances in Optics and Photonics",
    source: "Google Scholar · Advances in Optics and Photonics",
    published: "2015-01-01",
    url: "https://example.test/structured-illumination-microscopy",
    score: 96
  };
  let abstractCalls = 0;
  let llmSummary = "";

  const result = await addCandidatePaperToArchive(candidate, {
    dataDir: tempDir,
    fetchers: {
      abstract: async paper => {
        abstractCalls += 1;
        assert.equal(paper.title, candidate.title);
        return "This review explains structured illumination microscopy and its resolution improvement principles.";
      },
      llm: async ({ paper }) => {
        llmSummary = paper.summary;
        return {
          abstractZh: "这篇综述解释了结构光照明显微镜及其分辨率提升原理。",
          reason: "这篇综述适合作为SIM原理入口，能帮助快速校准后续PRIM阅读的基础概念。",
          tokenUsage: { prompt: 12, completion: 8, total: 20, status: "已调用 AI", model: "test-llm" }
        };
      }
    }
  });

  assert.equal(abstractCalls, 1);
  assert.equal(llmSummary, "This review explains structured illumination microscopy and its resolution improvement principles.");
  assert.equal(result.added, true);
  assert.equal(result.paper.summary, llmSummary);
  assert.equal(result.paper.abstractZh, "这篇综述解释了结构光照明显微镜及其分辨率提升原理。");
  assert.equal(result.paper.reason, "这篇综述适合作为SIM原理入口，能帮助快速校准后续PRIM阅读的基础概念。");
  assert.equal(result.paper.tokenUsage.status, "已调用 AI");

  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  assert.equal(archive.papers[0].abstractZh, result.paper.abstractZh);
  assert.equal(archive.papers[0].reason, result.paper.reason);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("removes candidate paper snapshots from archive by paper identity", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-candidate-remove-"));
  const candidate = {
    title: "Structured illumination microscopy removable candidate",
    journal: "Nature Methods",
    source: "Google Scholar · Nature Methods",
    published: "2026-05-20",
    url: "https://example.test/removable-candidate",
    doi: "10.1038/test-removable-candidate",
    score: 92
  };
  const otherPaper = {
    title: "Structured illumination microscopy other candidate",
    journal: "Optica",
    source: "Google Scholar · Optica",
    published: "2026-05-21",
    url: "https://example.test/other-candidate",
    doi: "10.1364/test-other-candidate",
    score: 88
  };

  await addCandidatePaperToArchive(candidate, { dataDir: tempDir });
  await addCandidatePaperToArchive(otherPaper, { dataDir: tempDir });
  const removed = await removeCandidatePaperFromArchive(candidate, { dataDir: tempDir });
  const secondRemove = await removeCandidatePaperFromArchive(candidate, { dataDir: tempDir });

  assert.equal(removed.removed, true);
  assert.equal(removed.existed, true);
  assert.equal(removed.archive.count, 1);
  assert.deepEqual(removed.archive.papers.map(paper => paper.title), [otherPaper.title]);
  assert.equal(secondRemove.removed, false);
  assert.equal(secondRemove.existed, false);
  assert.equal(secondRemove.archive.count, 1);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetch log records zero-result refreshes for diagnosis", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-zero-"));
  await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination"],
    fetchers: {
      arxiv: async () => [],
      biorxiv: async () => [],
      semanticscholar: async () => []
    }
  });
  const entries = await readFetchLog(tempDir);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].fetchedCount, 0);
  assert.equal(entries[0].newFetchedCount, 0);
  assert.equal(entries[0].pipelineCounts.raw, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recent refresh displays only papers fetched in the current run", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-current-run-only-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [
      {
        id: "archived-structured-illumination",
        title: "Archived structured illumination microscopy paper",
        summary: "A structured illumination microscopy paper already in the local archive.",
        published: "2026-05-20",
        source: "Google Scholar · Nature Methods",
        sourceType: "论文搜索",
        tags: ["Nature Methods"],
        score: 96
      }
    ]
  }), "utf8");

  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination"],
    sources: ["arXiv", "Google Scholar"],
    fetchers: {
      arxiv: async () => [],
      googlescholar: async () => []
    }
  });
  const entries = await readFetchLog(tempDir);

  assert.equal(payload.fetchedCount, 0);
  assert.equal(payload.count, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].fetchedCount, 0);
  assert.equal(entries[0].newFetchedCount, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recent paper mode filters papers from configured date range", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-range-cache-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination"],
    fetchers: {
      arxiv: async () => [
        {
          title: "Structured illumination microscopy in range",
          summary: "A structured illumination microscopy method.",
          tags: [],
          published: "2026-05-20T06:11:29Z",
          score: 80
        },
        {
          title: "Structured illumination microscopy too old",
          summary: "A structured illumination microscopy method.",
          tags: [],
          published: "2026-04-20T06:11:29Z",
          score: 99
        }
      ],
      biorxiv: async () => [],
      semanticscholar: async () => []
    }
  });

  assert.equal(payload.count, 1);
  assert.equal(payload.papers[0].title, "Structured illumination microscopy in range");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recent paper mode filters Google web papers after Crossref fills an old publication date", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-crossref-date-filter-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination microscopy"],
    sources: ["Google 搜索"],
    fetchers: {
      googlesearch: async () => [
        {
          id: "old-google-result",
          title: "Fast, faster, and the fastest structured illumination microscopy",
          summary: "structured illumination microscopy",
          source: "Google 搜索 · Nature",
          sourceType: "网页搜索",
          published: "",
          url: "https://www.nature.com/articles/s41377-024-01505-2",
          tags: ["Nature"],
          score: 96
        }
      ],
      crossref: async () => ({
        doi: "10.1038/s41377-024-01505-2",
        title: "Fast, faster, and the fastest structured illumination microscopy",
        journal: "Light: Science & Applications",
        published: "2024-08-12",
        authors: ["Tianyu Zhao"]
      })
    }
  });

  assert.equal(payload.count, 0);
  assert.equal(payload.fetchedCount, 0);
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  assert.equal(archive.papers.length, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recent paper mode does not archive undated Google web papers after enrichment", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-undated-google-filter-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-19",
    startDate: "2026-05-01",
    keywords: ["structured illumination microscopy"],
    sources: ["Google 搜索"],
    fetchers: {
      googlesearch: async () => [
        {
          id: "undated-google-result",
          title: "Structured illumination microscopy",
          summary: "structured illumination microscopy",
          source: "Google 搜索 · Optica Publishing Group",
          sourceType: "网页搜索",
          published: "",
          url: "https://opg.optica.org/viewmedia.cfm?uri=aop-7-2-241",
          tags: ["Optica"],
          score: 92
        }
      ],
      crossref: async () => null
    }
  });

  assert.equal(payload.count, 0);
  assert.equal(payload.fetchedCount, 0);
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  assert.equal(archive.papers.length, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recent paper refresh keeps previous cache in archive without displaying it", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-cache-"));
  await fs.writeFile(path.join(tempDir, "2026-06-19-recent.json"), JSON.stringify({
    date: "2026-06-19",
    mode: "recent",
    count: 1,
    papers: [
      {
        id: "arxiv-2604.24407v1",
        title: "AD-Relight",
        summary: "A diffusion prior relighting paper that was fetched earlier.",
        published: "2026-05-27T12:30:04Z",
        source: "arXiv cs.CV",
        tags: ["cs.CV"],
        score: 94
      }
    ]
  }), "utf8");

  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    fetchers: {
      arxiv: async () => [],
      biorxiv: async () => [],
      semanticscholar: async () => []
    }
  });

  assert.equal(payload.count, 0);
  assert.equal(payload.archivedCount, 1);
  assert.equal(payload.papers.length, 0);
  assert.match(payload.archiveFile, /archive\.json$/);
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  assert.equal(archive.papers[0].title, "AD-Relight");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recent paper refresh does not display archive-only papers", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-recent-archive-range-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        id: "old-2024",
        title: "Old structured illumination microscopy paper",
        summary: "A structured illumination microscopy paper from 2024.",
        published: "2024-08-12",
        source: "Google 搜索 · Nature",
        sourceType: "网页搜索",
        tags: ["Nature"],
        score: 96
      },
      {
        id: "new-2026",
        title: "New structured illumination microscopy paper",
        summary: "A structured illumination microscopy paper from 2026.",
        published: "2026-05-20",
        source: "arXiv cs.CV",
        tags: ["cs.CV"],
        score: 90
      }
    ]
  }), "utf8");

  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    startDate: "2026-05-01",
    keywords: ["structured illumination microscopy"],
    fetchers: {
      arxiv: async () => [],
      biorxiv: async () => [],
      semanticscholar: async () => []
    }
  });

  assert.equal(payload.count, 0);
  assert.equal(payload.papers.length, 0);
  assert.equal(payload.archivedCount, 2);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("archive appends newly fetched papers even when DOI already exists", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-doi-archive-"));
  await fs.writeFile(path.join(tempDir, "2026-06-19-recent.json"), JSON.stringify({
    date: "2026-06-19",
    mode: "recent",
    count: 1,
    papers: [
      {
        id: "existing",
        doi: "10.1101/2026.06.19.123456",
        title: "Existing DOI paper",
        summary: "The first local copy.",
        journal: "bioRxiv",
        citation: "A. Author (2026). Existing DOI paper. bioRxiv. doi:10.1101/2026.06.19.123456",
        published: "2026-06-19",
        source: "bioRxiv",
        tags: ["bioRxiv"],
        score: 70
      }
    ]
  }), "utf8");

  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    fetchers: {
      arxiv: async () => [
        {
          id: "duplicate",
          doi: "https://doi.org/10.1101/2026.06.19.123456",
          title: "Duplicate DOI paper should not be archived",
          summary: "Same DOI for structured illumination microscopy.",
          journal: "bioRxiv",
          citation: "Duplicate citation",
          published: "2026-06-20",
          source: "bioRxiv",
          tags: ["bioRxiv"],
          score: 99
        }
      ],
      biorxiv: async () => [],
      semanticscholar: async () => []
    }
  });

  assert.equal(payload.archivedCount, 2);
  assert.equal(payload.papers[0].title, "Duplicate DOI paper should not be archived");
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  assert.equal(archive.papers.length, 2);
  assert.ok(archive.papers.some(paper => paper.title === "Existing DOI paper"));
  assert.ok(archive.papers.some(paper => paper.title === "Duplicate DOI paper should not be archived"));
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("manual archive dedupe collapses duplicate DOI records only when requested", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-dedupe-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        id: "existing",
        doi: "10.1101/2026.06.19.123456",
        title: "Existing DOI paper",
        summary: "The first local copy.",
        journal: "bioRxiv",
        published: "2026-06-19",
        source: "bioRxiv",
        score: 70
      },
      {
        id: "duplicate",
        doi: "https://doi.org/10.1101/2026.06.19.123456",
        title: "Duplicate DOI paper",
        summary: "The enriched local copy.",
        abstractZh: "重复论文的中文摘要。",
        reason: "重复论文的推荐理由。",
        journal: "bioRxiv",
        published: "2026-06-20",
        source: "bioRxiv",
        score: 99,
        tokenUsage: { status: "已调用 AI", total: 20 }
      }
    ]
  }), "utf8");

  const before = await readArchivePayload({ dataDir: tempDir });
  const result = await dedupePaperArchive({ dataDir: tempDir });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(before.count, 2);
  assert.equal(result.beforeCount, 2);
  assert.equal(result.afterCount, 1);
  assert.equal(result.removedCount, 1);
  assert.equal(archive.papers.length, 1);
  assert.equal(archive.papers[0].abstractZh, "重复论文的中文摘要。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("operation log appends entries without trimming old records", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-operation-log-"));
  await appendOperationLog({ action: "add", operation: "test-add", paperCount: 1 }, tempDir);
  await appendOperationLog({ action: "modify", operation: "test-modify", modifiedCount: 1 }, tempDir);

  const text = await fs.readFile(path.join(tempDir, "operation-log.jsonl"), "utf8");
  const entries = await readOperationLog(tempDir);

  assert.equal(text.trim().split(/\r?\n/).length, 2);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].operation, "test-modify");
  assert.equal(entries[1].operation, "test-add");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("archive add delete and dedupe write operation log entries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-operation-log-"));
  const firstPaper = {
    title: "Structured illumination microscopy operation log paper",
    journal: "Nature Methods",
    source: "Google Scholar · Nature Methods",
    published: "2026-06-20",
    url: "https://example.test/log-paper",
    doi: "10.1038/log-paper",
    score: 92
  };
  const duplicatePaper = {
    title: "Structured illumination microscopy operation log duplicate",
    journal: "Nature Methods",
    source: "Google Scholar · Nature Methods",
    published: "2026-06-21",
    url: "https://example.test/log-paper-duplicate",
    doi: "10.1038/log-paper",
    score: 90
  };

  await addCandidatePaperToArchive(firstPaper, { dataDir: tempDir });
  await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      { ...firstPaper, id: "first-log-paper" },
      { ...duplicatePaper, id: "duplicate-log-paper" }
    ]
  }), "utf8");
  await dedupePaperArchive({ dataDir: tempDir });
  await removeCandidatePaperFromArchive(firstPaper, { dataDir: tempDir });

  const entries = await readOperationLog(tempDir);
  const operations = entries.map(entry => entry.operation);

  assert.ok(operations.includes("candidate-add"));
  assert.ok(operations.includes("archive-dedupe"));
  assert.ok(operations.includes("candidate-delete"));
  assert.equal(entries.find(entry => entry.operation === "candidate-delete").action, "delete");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("favorites are stored in a local json file with stable paper keys", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-favorites-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [
      {
        id: "archive-paper-id",
        doi: "10.1000/stable",
        title: "Stable favorite paper",
        url: "https://example.test/stable",
        summary: "A structured illumination microscopy paper."
      }
    ]
  }, null, 2)}\n`, "utf8");

  const added = await updateFavoritePaper({
    paper: {
      id: "temporary-view-id",
      doi: "10.1000/stable",
      title: "Stable favorite paper",
      url: "https://example.test/stable"
    },
    favorite: true
  }, { dataDir: tempDir });
  const afterAdd = await readFavoritesPayload({ dataDir: tempDir });
  const removed = await updateFavoritePaper({
    paper: { doi: "10.1000/stable" },
    favorite: false
  }, { dataDir: tempDir });
  const rawFile = JSON.parse(await fs.readFile(path.join(tempDir, "favorites.json"), "utf8"));

  assert.equal(added.count, 1);
  assert.equal(afterAdd.count, 1);
  assert.equal(afterAdd.papers[0].id, "archive-paper-id");
  assert.equal(afterAdd.favorites[0].keys.includes("10.1000/stable"), true);
  assert.equal(removed.count, 0);
  assert.deepEqual(rawFile.favorites, []);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("paper notes store short title, read state, and starred state in one local json file", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-notes-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        id: "archive-note-id",
        doi: "10.1000/note",
        title: "Stable note paper",
        url: "https://example.test/note",
        summary: "A structured illumination microscopy paper."
      },
      {
        id: "archive-other-id",
        title: "Other paper",
        url: "https://example.test/other"
      }
    ]
  }, null, 2)}\n`, "utf8");

  const saved = await updatePaperNote({
    paper: {
      id: "temporary-note-id",
      doi: "10.1000/note",
      title: "Stable note paper",
      url: "https://example.test/note"
    },
    note: {
      shortTitle: "SIM liver",
      read: true,
      starred: true
    }
  }, { dataDir: tempDir });
  const afterSave = await readPaperNotesPayload({ dataDir: tempDir });
  const updated = await updatePaperNote({
    paper: { doi: "10.1000/note" },
    note: {
      shortTitle: "",
      read: false
    }
  }, { dataDir: tempDir });
  const rawFile = JSON.parse(await fs.readFile(path.join(tempDir, "paper-notes.json"), "utf8"));

  assert.equal(saved.count, 1);
  assert.equal(afterSave.notes[0].shortTitle, "SIM liver");
  assert.equal(afterSave.notes[0].read, true);
  assert.equal(afterSave.notes[0].starred, true);
  assert.equal(afterSave.notes[0].keys.includes("10.1000/note"), true);
  assert.equal(afterSave.papers[0].id, "archive-note-id");
  assert.equal(updated.notes[0].shortTitle, "");
  assert.equal(updated.notes[0].read, false);
  assert.equal(updated.notes[0].starred, true);
  assert.equal(rawFile.notes.length, 1);
  assert.equal(rawFile.notes[0].shortTitle, "");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("retrying failed fetch log enrichment reprocesses saved papers without searching again", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-retry-failed-enrichment-"));
  await appendFetchLog({
    at: "2026-06-24T13:00:00.000Z",
    mode: "recent",
    range: { startDate: "2026-05-01", endDate: "2026-06-24" },
    keywords: ["structured illumination microscopy"],
    fetchedCount: 1,
    newFetchedCount: 1,
    errors: [
      {
        source: "llm",
        message: "LLM 摘要失败：HTTP 429",
        paper: {
          id: "retry-paper",
          title: "Structured illumination microscopy retry paper",
          summary: "A structured illumination microscopy paper.",
          published: "2026-06-20",
          source: "Google Scholar · Nature Methods",
          journal: "Nature Methods",
          score: 80
        }
      }
    ],
    papers: [
      {
        id: "retry-paper",
        title: "Structured illumination microscopy retry paper",
        summary: "A structured illumination microscopy paper.",
        published: "2026-06-20",
        source: "Google Scholar · Nature Methods",
        journal: "Nature Methods",
        score: 80
      }
    ]
  }, tempDir);

  let llmCalls = 0;
  const payload = await retryFailedFetchLogEnrichment(0, {
    dataDir: tempDir,
    fetchers: {
      llm: async ({ paper }) => {
        llmCalls += 1;
        assert.equal(paper.title, "Structured illumination microscopy retry paper");
        return {
          abstractZh: "结构光照明显微镜重试摘要。",
          reason: "重试后补全推荐理由。",
          tokenUsage: { status: "已调用 AI", total: 20, model: "test-llm" }
        };
      }
    }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.retried, true);
  assert.equal(payload.attemptedCount, 1);
  assert.equal(llmCalls, 1);
  assert.equal(archive.papers[0].abstractZh, "结构光照明显微镜重试摘要。");
  assert.equal(archive.papers[0].reason, "重试后补全推荐理由。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("enriches missing DOI papers through Crossref before archiving", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-crossref-archive-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"],
    userBackground: "用户背景：3D-SIM、多层聚焦结构光照明 MPSIM、RIM、PRIM 伪随机结构光照明显微镜算法。",
    fetchers: {
      googlescholar: async () => [
        {
          id: "googlescholar-local-title",
          doi: "",
          title: "Structured illumination microscopy for live-cell imaging",
          summary: "A structured illumination microscopy method improves biological imaging.",
          journal: "Google Scholar",
          citation: "Unknown authors (2026). Structured illumination microscopy for live-cell imaging. Google Scholar.",
          published: "2026-06-20",
          source: "Google Scholar · Google Scholar",
          tags: ["Google Scholar"],
          score: 92,
          authors: []
        }
      ],
      crossref: async paper => {
        assert.equal(paper.title, "Structured illumination microscopy for live-cell imaging");
        return {
          doi: "https://doi.org/10.1038/s41592-026-00002-2",
          journal: "Nature Methods",
          authors: ["A Author", "B Author"],
          published: "2026-06-20"
        };
      }
    }
  });

  assert.equal(payload.archivedCount, 1);
  assert.equal(payload.papers[0].doi, "10.1038/s41592-026-00002-2");
  assert.equal(payload.papers[0].journal, "Nature Methods");
  assert.match(payload.papers[0].citation, /A Author, B Author \(2026\)\. Structured illumination microscopy for live-cell imaging\. Nature Methods\. doi:10\.1038\/s41592-026-00002-2/);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("Crossref year-only dates do not invent January first", async () => {
  const [paper] = await enrichPapersWithCrossref([
    {
      title: "Structured illumination microscopy year-only Crossref date",
      summary: "A structured illumination microscopy paper.",
      journal: "Optica",
      published: "2025",
      url: "https://example.test/year-only",
      score: 90
    }
  ], {
    fetcher: async () => ({
      doi: "10.1364/year-only",
      title: "Structured illumination microscopy year-only Crossref date",
      journal: "Optica",
      authors: ["A. Author"],
      published: "2025"
    })
  });

  assert.equal(paper.published, "2025");
});

test("uses Nature article URLs to fetch DOI metadata for truncated Google titles", async () => {
  const [paper] = await enrichPapersWithCrossref([
    {
      id: "googlesearch-nature-truncated",
      title: "Superresolution structured illumination microscopy ...",
      summary: "structured illumination microscopy method",
      source: "Google 搜索 · Nature",
      sourceType: "网页搜索",
      journal: "Nature",
      url: "https://www.nature.com/articles/s41377-023-01204-4",
      published: "",
      authors: [],
      score: 96
    }
  ], {
    fetchImpl: async url => {
      assert.match(String(url), /10\.1038%2Fs41377-023-01204-4/i);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            DOI: "10.1038/s41377-023-01204-4",
            title: ["Superresolution structured illumination microscopy for live-cell imaging"],
            "container-title": ["Light: Science & Applications"],
            published: { "date-parts": [[2023, 9, 1]] },
            author: [{ given: "A", family: "Author" }]
          }
        })
      };
    }
  });

  assert.equal(paper.title, "Superresolution structured illumination microscopy for live-cell imaging");
  assert.equal(paper.doi, "10.1038/s41377-023-01204-4");
  assert.equal(paper.journal, "Light: Science & Applications");
  assert.equal(paper.source, "Google 搜索 · Light: Science & Applications");
  assert.equal(paper.published, "2023-09-01");
});

test("uses publisher HTML metadata to expand truncated Google Search titles", async () => {
  const [paper] = await enrichTruncatedGoogleTitles([
    {
      id: "googlesearch-optica-truncated",
      title: "High-speed multicolor structured illumination microscopy ...",
      summary: "structured illumination microscopy method",
      source: "Google 搜索 · Optica Publishing Group",
      sourceType: "网页搜索",
      journal: "Optica Publishing Group",
      url: "https://opg.optica.org/boe/fulltext.cfm?uri=boe-8-7-3147",
      published: "2017-04-13",
      authors: [],
      score: 92
    }
  ], {
    fetchImpl: async url => {
      assert.equal(String(url), "https://opg.optica.org/boe/fulltext.cfm?uri=boe-8-7-3147");
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html><head>
            <meta name="citation_title" content="High-speed multicolor structured illumination microscopy of living cells">
            <title>High-speed multicolor structured illumination microscopy of living cells | Optica Publishing Group</title>
          </head></html>
        `
      };
    }
  });

  assert.equal(paper.title, "High-speed multicolor structured illumination microscopy of living cells");
  assert.match(paper.citation, /High-speed multicolor structured illumination microscopy of living cells/);
});


test("writes integration configs and returns masked API keys", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-integrations-"));
  const files = {
    llmConfigFile: path.join(tempDir, "llm.json"),
    googleScholarConfigFile: path.join(tempDir, "google-scholar.json"),
    journalMetricsConfigFile: path.join(tempDir, "journal-metrics.json")
  };

  const saved = await writeIntegrationConfigs({
    llm: {
      enabled: true,
      provider: "aliyun-modelstudio",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "llm-secret",
      model: "qwen-plus",
      userBackground: "用户背景：PRIM 伪随机结构光照明显微镜算法\n关注问题：频谱分离、像差鲁棒性"
    },
    googleScholar: {
      enabled: true,
      endpoint: "https://serpapi.com/search.json",
      apiKey: "serp-secret",
      maxPages: 4,
      num: 20,
      rollingFetch: true
    },
    journalMetrics: {
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "easy-secret"
    }
  }, files);
  const rawLlm = JSON.parse(await fs.readFile(files.llmConfigFile, "utf8"));
  const rawGoogle = JSON.parse(await fs.readFile(files.googleScholarConfigFile, "utf8"));
  const rawEasy = JSON.parse(await fs.readFile(files.journalMetricsConfigFile, "utf8"));

  assert.equal(rawLlm.apiKey, "llm-secret");
  assert.equal(rawLlm.userBackground, "用户背景：PRIM 伪随机结构光照明显微镜算法\n关注问题：频谱分离、像差鲁棒性");
  assert.equal(rawGoogle.apiKey, "serp-secret");
  assert.equal(rawGoogle.maxPages, 4);
  assert.equal(rawGoogle.num, 20);
  assert.equal(rawGoogle.rollingFetch, true);
  assert.equal(rawEasy.apiKey, "easy-secret");
  assert.equal(saved.llm.apiKey, "");
  assert.equal(saved.llm.hasApiKey, true);
  assert.equal(saved.googleScholar.apiKey, "");
  assert.equal(saved.googleScholar.hasApiKey, true);
  assert.equal(saved.googleScholar.maxPages, 4);
  assert.equal(saved.googleScholar.num, 20);
  assert.equal(saved.googleScholar.rollingFetch, true);
  assert.equal(saved.journalMetrics.apiKey, "");
  assert.equal(saved.journalMetrics.hasApiKey, true);

  const readBack = await readIntegrationConfigs(files);
  assert.equal(readBack.llm.endpoint, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(readBack.llm.userBackground, "用户背景：PRIM 伪随机结构光照明显微镜算法\n关注问题：频谱分离、像差鲁棒性");
  assert.equal(readBack.llm.apiKey, "");
  assert.equal(readBack.llm.hasApiKey, true);
  const secrets = await readIntegrationSecrets(files);
  assert.equal(secrets.llm.apiKey, "llm-secret");
  assert.equal(secrets.googleScholar.apiKey, "serp-secret");
  assert.equal(secrets.journalMetrics.apiKey, "easy-secret");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("stores multiple LLM providers with one active provider", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-providers-"));
  const files = {
    llmConfigFile: path.join(tempDir, "llm.json"),
    googleScholarConfigFile: path.join(tempDir, "google-scholar.json"),
    journalMetricsConfigFile: path.join(tempDir, "journal-metrics.json")
  };

  const saved = await writeIntegrationConfigs({
    llm: {
      activeProviderId: "custom",
      providers: [
        {
          id: "aliyun-coding",
          name: "阿里百炼 Coding Plan",
          enabled: false,
          apiMode: "openai",
          endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          apiKey: "aliyun-secret",
          model: "qwen3-coder-plus",
          contextWindow: 131000,
          reasoning: "auto"
        },
        {
          id: "custom",
          name: "Custom",
          enabled: true,
          apiMode: "openai",
          endpoint: "http://127.0.0.1:8080/v1",
          apiKey: "custom-secret",
          model: "gpt-5.5",
          contextWindow: 262000,
          reasoning: "off"
        }
      ]
    }
  }, files);
  const rawLlm = JSON.parse(await fs.readFile(files.llmConfigFile, "utf8"));

  assert.equal(rawLlm.activeProviderId, "custom");
  assert.equal(rawLlm.providers.find(provider => provider.id === "custom").apiKey, "custom-secret");
  assert.equal(rawLlm.providers.find(provider => provider.id === "aliyun-coding").enabled, false);
  assert.equal(saved.llm.activeProviderId, "custom");
  assert.equal(saved.llm.providers.find(provider => provider.id === "custom").apiKey, "");
  assert.equal(saved.llm.providers.find(provider => provider.id === "custom").hasApiKey, true);
  assert.equal(saved.llm.providers.find(provider => provider.id === "aliyun-coding").apiKey, "");
  assert.equal(saved.llm.providers.filter(provider => provider.enabled).length, 1);
  const secrets = await readIntegrationSecrets(files);
  assert.equal(secrets.llm.providers.find(provider => provider.id === "custom").apiKey, "custom-secret");
  assert.equal(secrets.llm.providers.find(provider => provider.id === "aliyun-coding").apiKey, "aliyun-secret");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("tests an LLM provider using saved or submitted configuration", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-test-log-"));
  let seenUrl = "";
  const result = await testLlmConfig({
    llm: {
      enabled: true,
      activeProviderId: "aliyun-coding",
      providers: [
        {
          id: "aliyun-coding",
          provider: "aliyun-modelstudio",
          enabled: true,
          apiMode: "openai",
          endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          apiKey: "test-key",
          model: "qwen-plus"
        }
      ],
      userBackground: "PRIM 伪随机结构光照明显微镜算法"
    }
  }, {
    dataDir: tempDir,
    fetchImpl: async (url, request) => {
      seenUrl = String(url);
      assert.equal(request.headers.Authorization, "Bearer test-key");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "qwen-plus");
      assert.match(body.messages[1].content, /connectivity test/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ summary: "测试中文摘要", reason: "测试中文理由" }) } }],
          usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 }
        })
      };
    }
  });

  assert.equal(seenUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(result.ok, true);
  assert.equal(result.model, "qwen-plus");
  assert.equal(result.llmSummary, "");
  assert.equal(result.tokenUsage.total, 10);
  const operations = await readOperationLog(tempDir);
  assert.equal(operations[0].operation, "llm-config-test");
  assert.deepEqual(operations[0].llm, {
    models: [
      { model: "qwen-plus", calls: 1, prompt: 6, completion: 4, total: 10 }
    ],
    calls: 1,
    totalTokens: 10
  });
  await fs.rm(tempDir, { recursive: true, force: true });
});
test("calls OpenAI-compatible LLM with chat completions path", async () => {
  let seenUrl = "";
  const papers = await enrichPapersWithLlmInsights([
    {
      title: "Structured illumination microscopy paper",
      summary: "A structured illumination microscopy method.",
      reason: "规则理由",
      tokenUsage: { status: "未调用 AI" }
    }
  ], {
    config: {
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "qwen-plus",
      userBackground: "PRIM 伪随机结构光照明显微镜算法"
    },
    fetchImpl: async (url, request) => {
      seenUrl = String(url);
      assert.equal(request.headers.Authorization, "Bearer test-key");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "qwen-plus");
      assert.match(body.messages[1].content, /PRIM 伪随机/);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "原摘要中文翻译", reason: "中文理由" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    }
  });

  assert.equal(seenUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(papers[0].summary, "A structured illumination microscopy method.");
  assert.equal(papers[0].abstractZh, "原摘要中文翻译");
  assert.equal(papers[0].llmSummary || "", "");
  assert.equal(papers[0].reason, "中文理由");
  assert.equal(papers[0].tokenUsage.model, "qwen-plus");
});

test("uses LLM output for Chinese summaries and background-aware recommendations", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-archive-"));
  const llmBackgrounds = [];
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"],
    userBackground: "用户背景：3D-SIM、多层聚焦结构光照明 MPSIM、RIM、PRIM 伪随机结构光照明显微镜算法。",
    fetchers: {
      googlescholar: async () => [
        {
          id: "googlescholar-llm-title",
          doi: "10.1038/s41592-026-00003-3",
          title: "Programmable pseudo-random structured illumination for microscopy",
          summary: "This paper studies pseudo-random structured illumination microscopy patterns for optical microscopy sectioning and reconstruction.",
          journal: "Nature Methods",
          citation: "Unknown authors (2026). Programmable pseudo-random structured illumination for microscopy. Nature Methods. doi:10.1038/s41592-026-00003-3",
          published: "2026-06-20",
          source: "Google Scholar · Nature Methods",
          tags: ["Nature Methods"],
          score: 94,
          authors: []
        }
      ],
      llm: async ({ paper, userBackground }) => {
        llmBackgrounds.push(userBackground);
        assert.equal(paper.title, "Programmable pseudo-random structured illumination for microscopy");
        return {
          abstractZh: "本文研究用于光学层切和重建的可编程伪随机结构光照明显微图案。",
          reason: "与你当前的 PRIM 伪随机结构光照明显微镜算法直接相关，可重点看照明图案设计、重建模型和与 3D-SIM/MPSIM 的差异。",
          shortTitle: "2026@PRIM",
          tokenUsage: {
            prompt: 120,
            completion: 80,
            total: 200,
            model: "test-llm",
            status: "已调用 AI"
          }
        };
      }
    }
  });

  assert.equal(payload.papers[0].title, "Programmable pseudo-random structured illumination for microscopy");
  assert.equal(payload.papers[0].summary, "This paper studies pseudo-random structured illumination microscopy patterns for optical microscopy sectioning and reconstruction.");
  assert.equal(payload.papers[0].abstractZh, "本文研究用于光学层切和重建的可编程伪随机结构光照明显微图案。");
  assert.equal(payload.papers[0].llmSummary, "");
  assert.equal(payload.papers[0].reason, "与你当前的 PRIM 伪随机结构光照明显微镜算法直接相关，可重点看照明图案设计、重建模型和与 3D-SIM/MPSIM 的差异。");
  assert.equal(payload.papers[0].shortTitle, "2026@");
  assert.equal(payload.papers[0].tokenUsage.total, 200);
  assert.equal(payload.papers[0].tokenUsage.model, "test-llm");
  assert.ok(llmBackgrounds.some(text => /3D-SIM/.test(text) && /MPSIM/.test(text) && /PRIM 伪随机/.test(text)));
  await fs.rm(tempDir, { recursive: true, force: true });
});
test("refresh enriches archived papers that have not called LLM yet", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-archive-refresh-"));
  const archive = {
    mode: "archive",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    count: 1,
    papers: [
      {
        id: "archive-old-english",
        title: "Old structured illumination microscopy paper",
        summary: "English abstract that should be replaced.",
        reason: "旧规则理由",
        source: "arXiv cs.CV",
        sourceType: "预印本",
        published: "2026-06-18T00:00:00Z",
        tags: ["cs.CV"],
        score: 91,
        tokenUsage: { prompt: 0, completion: 0, total: 0, status: "未调用 AI" }
      }
    ]
  };
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify(archive, null, 2)}\n`, "utf8");

  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    sources: ["arXiv"],
    fetchers: {
      arxiv: async () => [],
      llm: async ({ paper }) => ({
        abstractZh: `原摘要中文翻译：${paper.summary}`,
        reason: "中文补充理由：与 PRIM/SIM 方向相关。",
        tokenUsage: { prompt: 30, completion: 20, total: 50, model: "test-llm", status: "已调用 AI" }
      })
    }
  });
  const savedArchive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.fetchedCount, 0);
  assert.equal(payload.count, 0);
  assert.equal(payload.papers.length, 0);
  assert.equal(savedArchive.papers[0].summary, "English abstract that should be replaced.");
  assert.equal(savedArchive.papers[0].abstractZh, "原摘要中文翻译：English abstract that should be replaced.");
  assert.equal(savedArchive.papers[0].llmSummary, "");
  assert.equal(savedArchive.papers[0].reason, "中文补充理由：与 PRIM/SIM 方向相关。");
  assert.equal(savedArchive.papers[0].tokenUsage.status, "已调用 AI");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("refreshes one archived paper with LLM when requested", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-one-"));
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        id: "needs-one",
        title: "Single structured illumination microscopy paper",
        summary: "A structured illumination microscopy abstract.",
        abstractZh: "",
        reason: "旧理由",
        tokenUsage: { prompt: 0, completion: 0, total: 0, status: "未调用 AI" }
      },
      {
        id: "keep-other",
        title: "Other paper",
        summary: "Other abstract.",
        abstractZh: "其他中文摘要",
        reason: "其他推荐理由",
        tokenUsage: { prompt: 1, completion: 1, total: 2, model: "old-llm", status: "已调用 AI" }
      }
    ]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({
    id: "needs-one",
    fetcher: async ({ paper }) => {
      assert.equal(paper.id, "needs-one");
      return {
        abstractZh: "单篇中文摘要。",
        reason: "单篇推荐理由。",
        tokenUsage: { prompt: 12, completion: 8, total: 20, model: "test-llm", status: "已调用 AI" }
      };
    }
  }, { dataDir: tempDir });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  const operations = await readOperationLog(tempDir);

  assert.equal(payload.ok, true);
  assert.equal(payload.updated, true);
  assert.equal(payload.paper.abstractZh, "单篇中文摘要。");
  assert.equal(archive.papers.find(paper => paper.id === "needs-one").reason, "单篇推荐理由。");
  assert.equal(archive.papers.find(paper => paper.id === "keep-other").reason, "其他推荐理由");
  assert.equal(operations[0].operation, "archive-llm-refresh-one");
  assert.deepEqual(operations[0].llm, {
    models: [
      { model: "test-llm", calls: 1, prompt: 12, completion: 8, total: 20 }
    ],
    calls: 1,
    totalTokens: 20
  });
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("refreshes missing archive LLM insights in bulk and skips completed papers", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-bulk-"));
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 3,
    papers: [
      {
        id: "done-paper",
        title: "Done structured illumination microscopy paper",
        summary: "Done abstract.",
        abstractZh: "已有中文摘要",
        reason: "已有推荐理由",
        shortTitle: "2026@SIM",
        tokenUsage: { prompt: 10, completion: 5, total: 15, model: "old-llm", status: "已调用 AI" }
      },
      {
        id: "missing-abstract",
        title: "Missing abstract translation",
        summary: "Missing abstract source.",
        abstractZh: "",
        reason: "已有理由",
        tokenUsage: { prompt: 0, completion: 0, total: 0, status: "未调用 AI" }
      },
      {
        id: "missing-reason",
        title: "Missing recommendation reason",
        summary: "Missing reason source.",
        abstractZh: "已有中文摘要",
        reason: "",
        tokenUsage: { prompt: 0, completion: 0, total: 0, status: "未调用 AI" }
      }
    ]
  }, null, 2)}\n`, "utf8");
  const calledIds = [];

  const payload = await refreshArchiveLlmInsights({
    fetcher: async ({ paper }) => {
      calledIds.push(paper.id);
      return {
        abstractZh: `${paper.id} 中文摘要`,
        reason: `${paper.id} 推荐理由`,
        shortTitle: `2026@${paper.id === "missing-abstract" ? "SIM" : "PRIM"}`,
        tokenUsage: { prompt: 5, completion: 4, total: 9, model: "test-llm", status: "已调用 AI" }
      };
    }
  }, { dataDir: tempDir });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  const operations = await readOperationLog(tempDir);

  assert.deepEqual(calledIds.sort(), ["missing-abstract", "missing-reason"]);
  assert.equal(payload.updatedCount, 2);
  assert.equal(payload.skippedCount, 1);
  assert.equal(archive.papers.find(paper => paper.id === "done-paper").reason, "已有推荐理由");
  assert.equal(archive.papers.find(paper => paper.id === "missing-abstract").abstractZh, "missing-abstract 中文摘要");
  assert.equal(archive.papers.find(paper => paper.id === "missing-abstract").shortTitle, "2026@");
  assert.equal(archive.papers.find(paper => paper.id === "missing-reason").reason, "missing-reason 推荐理由");
  assert.equal(operations[0].operation, "archive-llm-refresh-missing");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("refreshes truncated archive abstract translations instead of treating them as complete", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-truncated-"));
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        id: "truncated-scholar",
        title: "Truncated Google Scholar structured illumination paper",
        url: "https://example.test/truncated",
        summary: "… structured illumination microscopy summary fragment …",
        abstractZh: "结构光照明显微镜摘要片段……",
        reason: "已有推荐理由",
        tokenUsage: { prompt: 10, completion: 5, total: 15, model: "old-llm", status: "已调用 AI" }
      },
      {
        id: "done-paper",
        title: "Complete structured illumination paper",
        summary: "Complete source abstract.",
        abstractZh: "完整中文摘要。",
        reason: "已有推荐理由",
        shortTitle: "2026@SIM",
        tokenUsage: { prompt: 10, completion: 5, total: 15, model: "old-llm", status: "已调用 AI" }
      }
    ]
  }, null, 2)}\n`, "utf8");
  const calledIds = [];

  const payload = await refreshArchiveLlmInsights({
    abstractFetcher: async paper => {
      assert.equal(paper.id, "truncated-scholar");
      return "This is the complete source abstract for structured illumination microscopy.";
    },
    fetcher: async ({ paper }) => {
      calledIds.push(paper.id);
      assert.equal(paper.summary, "This is the complete source abstract for structured illumination microscopy.");
      return {
        abstractZh: "这是完整原始摘要的中文翻译。",
        reason: "新的推荐理由。",
        shortTitle: "2026@SIM",
        tokenUsage: { prompt: 8, completion: 6, total: 14, model: "test-llm", status: "已调用 AI" }
      };
    }
  }, { dataDir: tempDir });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.deepEqual(calledIds, ["truncated-scholar"]);
  assert.equal(payload.updatedCount, 1);
  assert.equal(payload.skippedCount, 1);
  assert.equal(archive.papers.find(paper => paper.id === "truncated-scholar").summary, "This is the complete source abstract for structured illumination microscopy.");
  assert.equal(archive.papers.find(paper => paper.id === "truncated-scholar").abstractZh, "这是完整原始摘要的中文翻译。");
  assert.equal(archive.papers.find(paper => paper.id === "truncated-scholar").shortTitle, "2026@");
  assert.equal(archive.papers.find(paper => paper.id === "done-paper").abstractZh, "完整中文摘要。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("recovers original abstracts before translating generated Chinese summaries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-generated-summary-"));
  const archive = {
    mode: "archive",
    count: 1,
    papers: [
      {
        id: "archive-generated-summary",
        title: "Already summarized structured illumination paper",
        summary: "该论文提出一种结构光重建方法，重点是模型总结而不是原始摘要。",
        reason: "旧推荐理由",
        source: "arXiv cs.CV",
        sourceType: "预印本",
        published: "2026-06-18T00:00:00Z",
        tags: ["cs.CV"],
        score: 91,
        tokenUsage: { prompt: 10, completion: 8, total: 18, status: "已调用 AI" }
      }
    ]
  };
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify(archive, null, 2)}\n`, "utf8");

  let llmCalls = 0;
  let abstractCalls = 0;
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    sources: ["arXiv"],
    fetchers: {
      arxiv: async () => [],
      abstract: async paper => {
        abstractCalls += 1;
        assert.equal(paper.title, "Already summarized structured illumination paper");
        return "This is the original structured illumination microscopy abstract.";
      },
      llm: async ({ paper }) => {
        llmCalls += 1;
        assert.equal(paper.summary, "This is the original structured illumination microscopy abstract.");
        return {
          abstractZh: "这是原始结构光显微论文摘要的中文翻译。",
          reason: "这是推荐理由。",
          tokenUsage: { prompt: 8, completion: 6, total: 14, model: "test-llm", status: "已调用 AI" }
        };
      }
    }
  });

  assert.equal(abstractCalls, 1);
  assert.equal(llmCalls, 1);
  assert.equal(payload.count, 0);
  assert.equal(payload.papers.length, 0);
  const savedArchive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  assert.equal(savedArchive.papers[0].summary, "This is the original structured illumination microscopy abstract.");
  assert.equal(savedArchive.papers[0].abstractZh, "这是原始结构光显微论文摘要的中文翻译。");
  assert.equal(savedArchive.papers[0].reason, "这是推荐理由。");
  await fs.rm(tempDir, { recursive: true, force: true });
});
test("filters papers by date range", () => {
  const papers = [
    { title: "old", published: "2026-04-30" },
    { title: "start", published: "2026-05-01" },
    { title: "middle", published: "2026-06-01T12:00:00Z" },
    { title: "future", published: "2026-06-20" }
  ];

  const filtered = filterPapersByDateRange(papers, "2026-05-01", "2026-06-19");

  assert.deepEqual(filtered.map(paper => paper.title), ["start", "middle"]);
});

test("recent date range keeps undated Google Search web results", () => {
  const papers = [
    { title: "Nature web result", sourceType: "网页搜索", source: "Google 搜索 · Nature", published: "" },
    { title: "Undated scholar result", sourceType: "论文搜索", source: "Google Scholar · Nature", published: "" },
    { title: "old", sourceType: "预印本", source: "arXiv", published: "2026-04-30" },
    { title: "middle", sourceType: "预印本", source: "arXiv", published: "2026-06-01T12:00:00Z" }
  ];

  const filtered = filterPapersByDateRange(papers, "2026-05-01", "2026-06-19");

  assert.deepEqual(filtered.map(paper => paper.title), ["Nature web result", "middle"]);
});

test("recent date range keeps year-only Scholar candidates without inventing January first", () => {
  const papers = [
    { title: "year only in range", published: "2025", sourceType: "论文搜索" },
    { title: "year only outside", published: "2024", sourceType: "论文搜索" }
  ];

  const filtered = filterPapersByDateRange(papers, "2025-03-01", "2025-03-10");

  assert.deepEqual(filtered.map(paper => paper.title), ["year only in range"]);
  assert.equal(filtered[0].published, "2025");
});


test("parses enabled frontend sources into supported backend source ids", () => {
  const sources = parseEnabledSources(["Google 搜索", "arXiv", "bioRxiv", "Semantic Scholar", "Google Scholar", "谷歌学术", "某个公众号"]);

  assert.deepEqual(sources, ["arxiv", "biorxiv", "semanticscholar", "googlescholar", "googlesearch"]);
});

test("fetches ordinary Google Search papers through SerpApi", async () => {
  const requestedStarts = [];
  const papers = await fetchGoogleSearchPapers(["structured illumination microscopy"], {
    config: {
      provider: "serpapi-google",
      enabled: true,
      endpoint: "https://serpapi.com/search.json?engine=google&hl=en",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        journal: "source",
        year: "date",
        url: "link"
      }
    },
    fetchImpl: async url => {
      assert.equal(url.searchParams.get("engine"), "google");
      assert.equal(url.searchParams.get("q"), "structured illumination microscopy");
      assert.equal(url.searchParams.get("api_key"), "test-key");
      requestedStarts.push(url.searchParams.get("start") || "0");
      const isSecondPage = url.searchParams.get("start") === "10";
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          organic_results: isSecondPage ? [
            {
              title: "Structured illumination microscopy pagination result",
              snippet: "A structured illumination microscopy pagination method.",
              source: "Optica",
              date: "Jun 21, 2026",
              link: "https://opg.optica.org/example"
            }
          ] : [
            {
              title: "Structured illumination microscopy for live-cell imaging",
              snippet: "A structured illumination microscopy method improves biological imaging.",
              source: "Nature Methods",
              date: "Jun 20, 2026",
              link: "https://www.nature.com/articles/s41592-026-00002-2"
            }
          ],
          serpapi_pagination: isSecondPage ? {} : {
            next: "https://serpapi.com/search.json?engine=google&hl=en&q=structured+illumination+microscopy&start=10"
          }
        })
      };
    }
  });

  assert.deepEqual(requestedStarts, ["0", "10"]);
  assert.equal(papers.length, 2);
  assert.equal(papers[0].source, "Google 搜索 · Nature Methods");
  assert.equal(papers[0].journal, "Nature Methods");
  assert.equal(papers[0].published, "2026-06-20");
  assert.equal(papers[0].url, "https://www.nature.com/articles/s41592-026-00002-2");
  assert.equal(papers[1].source, "Google 搜索 · Optica");
});


test("keeps Google Search ids distinct when different titles share one URL", async () => {
  const papers = await fetchGoogleSearchPapers(["structured illumination microscopy"], {
    config: {
      provider: "serpapi-google",
      enabled: true,
      endpoint: "https://serpapi.com/search.json?engine=google&hl=en",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        journal: "source",
        year: "date",
        url: "link"
      }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        organic_results: [
          {
            title: "Superresolution fluorescence microscopy with structured illumination",
            snippet: "A structured illumination microscopy dissertation.",
            source: "Nature",
            link: "https://www.nature.com/articles/s41377-023-01204-4"
          },
          {
            title: "Superresolution structured illumination microscopy reconstruction algorithms: a review",
            snippet: "A structured illumination microscopy review.",
            source: "Nature",
            link: "https://www.nature.com/articles/s41377-023-01204-4"
          }
        ]
      })
    })
  });

  assert.equal(papers.length, 2);
  assert.notEqual(papers[0].id, papers[1].id);
});

test("does not trust a Nature URL DOI when Crossref title conflicts with the Google title", async () => {
  const [paper] = await enrichPapersWithCrossref([
    {
      id: "googlesearch-suspect-nature",
      title: "Superresolution fluorescence microscopy with structured illumination",
      summary: "structured illumination microscopy dissertation",
      source: "Google 搜索 · Nature",
      sourceType: "网页搜索",
      journal: "Nature",
      url: "https://www.nature.com/articles/s41377-023-01204-4",
      published: "",
      authors: [],
      score: 96
    }
  ], {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          DOI: "10.1038/s41377-023-01204-4",
          title: ["Superresolution structured illumination microscopy reconstruction algorithms: a review"],
          "container-title": ["Light: Science & Applications"],
          published: { "date-parts": [[2023, 7, 12]] },
          author: [{ given: "Xin", family: "Chen" }]
        }
      })
    })
  });

  assert.equal(paper.doi, "");
  assert.equal(paper.url, "");
  assert.equal(paper.sourceWarning, "Google 搜索链接与 Crossref 标题不一致，已移除可疑链接");
});


test("fetches Google Scholar papers through a configured API source", async () => {
  const requestedStarts = [];
  const requestedNums = [];
  const papers = await fetchGoogleScholarPapers(["structured illumination microscopy"], {
    config: {
      provider: "test-scholar-api",
      enabled: true,
      endpoint: "https://example.test/scholar",
      apiKey: "test-key",
      maxPages: 2,
      num: 20,
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        doi: "doi",
        journal: "publication_info.summary",
        year: "publication_info.summary",
        url: "link"
      }
    },
    fetchImpl: async url => {
      assert.equal(url.searchParams.get("q"), "structured illumination microscopy");
      assert.equal(url.searchParams.get("api_key"), "test-key");
      requestedStarts.push(url.searchParams.get("start") || "0");
      requestedNums.push(url.searchParams.get("num"));
      const isSecondPage = url.searchParams.get("start") === "10";
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({
          organic_results: isSecondPage ? [
            {
              title: "Structured illumination microscopy pagination study",
              snippet: "A structured illumination microscopy method from the second page.",
              publication_info: { summary: "C Author - Optica, 2025 - optica.org" },
              link: "https://example.test/paper-2"
            }
          ] : [
            {
              title: "Structured illumination microscopy for live-cell imaging",
              snippet: "A structured illumination microscopy method improves biological imaging.",
              doi: "10.1038/s41592-026-00002-2",
              publication_info: { summary: "A Author, B Author - Nature Methods, 2026 - nature.com" },
              link: "https://example.test/paper"
            }
          ],
          serpapi_pagination: isSecondPage ? {} : {
            next: "https://example.test/scholar?q=structured+illumination+microscopy&start=10"
          }
        })
      };
    }
  });

  assert.deepEqual(requestedStarts, ["0", "10"]);
  assert.deepEqual(requestedNums, ["20", "20"]);
  assert.equal(papers.length, 2);
  assert.equal(papers[0].source, "Google Scholar · Nature Methods");
  assert.equal(papers[0].doi, "10.1038/s41592-026-00002-2");
  assert.equal(papers[0].journal, "Nature Methods");
  assert.deepEqual(papers[0].authors, ["A Author", "B Author"]);
  assert.equal(papers[0].published, "2026");
  assert.match(papers[0].citation, /Structured illumination microscopy for live-cell imaging\. Nature Methods\. doi:10\.1038\/s41592-026-00002-2/);
  assert.equal(papers[1].source, "Google Scholar · Optica");
});

test("fetches Web of Science papers through a configured API source with limited pages", async () => {
  const seen = [];
  const papers = await fetchWebOfSciencePapers(["structured illumination microscopy"], {
    config: {
      provider: "web-of-science",
      enabled: true,
      endpoint: "https://api.clarivate.test/apis/wos-starter/v1/documents",
      apiKey: "wos-key",
      databaseId: "WOS",
      maxPages: 2,
      pageSize: 2,
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
      responseMap: {
        items: "hits",
        title: "title",
        summary: "abstract",
        doi: "identifiers.doi",
        journal: "source.sourceTitle",
        year: "source.publishYear",
        url: "links.record",
        authors: "names.authors"
      }
    },
    fetchImpl: async (url, options) => {
      const page = Number(url.searchParams.get("page"));
      seen.push({
        page,
        limit: url.searchParams.get("limit"),
        db: url.searchParams.get("db"),
        query: url.searchParams.get("q"),
        apiKey: options.headers["X-ApiKey"]
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hits: page === 1
            ? [{
                uid: "WOS:1",
                title: "Structured illumination microscopy reconstruction",
                abstract: "A structured illumination microscopy method.",
                identifiers: { doi: "10.1000/wos1" },
                source: { sourceTitle: "Nature Methods", publishYear: 2026, publishMonth: "06", publishDay: "18" },
                names: { authors: [{ displayName: "A. Author" }] },
                links: { record: "https://www.webofscience.com/wos/woscc/full-record/WOS:1" }
              }, {
                uid: "WOS:1B",
                title: "Structured illumination microscopy optics",
                abstract: "Another structured illumination microscopy record on the first page.",
                identifiers: { doi: "10.1000/wos1b" },
                source: { sourceTitle: "Light Science", publishYear: 2026, publishMonth: "06", publishDay: "18" },
                names: { authors: [{ displayName: "A. Second" }] },
                links: { record: "https://www.webofscience.com/wos/woscc/full-record/WOS:1B" }
              }]
            : [{
                uid: "WOS:2",
                title: "Structured illumination microscopy reconstruction with adaptive optics",
                abstract: "A structured illumination microscopy method.",
                identifiers: { doi: "10.1000/wos2" },
                source: { sourceTitle: "Optica", publishYear: 2026, publishMonth: "06", publishDay: "17" },
                names: { authors: [{ displayName: "B. Author" }] },
                links: { record: "https://www.webofscience.com/wos/woscc/full-record/WOS:2" }
              }]
        })
      };
    }
  });

  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map(item => item.page), [1, 2]);
  assert.equal(seen[0].limit, "2");
  assert.equal(seen[0].db, "WOS");
  assert.match(seen[0].query, /TS=\(structured illumination microscopy\)/);
  assert.equal(seen[0].apiKey, "wos-key");
  assert.equal(papers.length, 3);
  assert.equal(papers[0].source, "Web of Science · Nature Methods");
  assert.equal(papers[2].source, "Web of Science · Optica");
});

test("continues Google Scholar rolling fetch from the next saved offset", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-scholar-roll-"));
  const requestedStarts = [];
  const makePayload = url => {
    const start = Number(url.searchParams.get("start") || "0");
    return {
      organic_results: [
        {
          title: `Structured illumination microscopy result ${start}`,
          snippet: "A structured illumination microscopy result.",
          publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
          link: `https://example.test/paper-${start}`
        }
      ],
      serpapi_pagination: start % 20 === 0 ? {
        next: `https://example.test/scholar?q=structured+illumination+microscopy&start=${start + 10}`
      } : {}
    };
  };
  const options = {
    dataDir: tempDir,
    config: {
      provider: "test-scholar-api",
      enabled: true,
      endpoint: "https://example.test/scholar",
      apiKey: "test-key",
      maxPages: 2,
      num: 10,
      rollingFetch: true,
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        journal: "publication_info.summary",
        year: "publication_info.summary",
        url: "link"
      }
    },
    fetchImpl: async url => {
      requestedStarts.push(url.searchParams.get("start") || "0");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(makePayload(url))
      };
    }
  };

  await fetchGoogleScholarPapers(["structured illumination microscopy"], options);
  const cursorAfterFirstFetch = JSON.parse(await fs.readFile(path.join(tempDir, "google-rolling-cursors.json"), "utf8"));
  assert.equal(Object.values(cursorAfterFirstFetch.cursors)[0].nextStart, 20);
  await fetchGoogleScholarPapers(["structured illumination microscopy"], options);

  assert.deepEqual(requestedStarts, ["0", "10", "20", "30"]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("skips blocked Google Scholar rolling page and continues from the later offset", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-scholar-skip-"));
  const requestedStarts = [];
  const options = {
    dataDir: tempDir,
    startItem: 181,
    config: {
      provider: "test-scholar-api",
      enabled: true,
      endpoint: "https://example.test/scholar",
      apiKey: "test-key",
      maxPages: 2,
      num: 20,
      rollingFetch: true,
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        journal: "publication_info.summary",
        year: "publication_info.summary",
        url: "link"
      }
    },
    fetchImpl: async url => {
      const start = Number(url.searchParams.get("start") || "0");
      requestedStarts.push(String(start));
      if (start === 180) {
        return {
          ok: false,
          status: 429,
          text: async () => "Too many requests"
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          organic_results: [
            {
              title: `Structured illumination microscopy result ${start}`,
              snippet: "A structured illumination microscopy result after a skipped page.",
              publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
              link: `https://example.test/paper-${start}`
            }
          ],
          serpapi_pagination: {}
        })
      };
    }
  };

  const papers = await fetchGoogleScholarPapers(["structured illumination microscopy"], options);
  const cursorAfterFetch = JSON.parse(await fs.readFile(path.join(tempDir, "google-rolling-cursors.json"), "utf8"));

  assert.deepEqual(requestedStarts, ["180", "200"]);
  assert.equal(papers.length, 1);
  assert.match(papers[0].title, /result 200/);
  assert.equal(Object.values(cursorAfterFetch.cursors)[0].nextStart, 220);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("reports Google Scholar page progress with page and result range", async () => {
  const progressEvents = [];
  await fetchGoogleScholarPapers(["structured illumination microscopy"], {
    config: {
      provider: "test-scholar-api",
      enabled: true,
      endpoint: "https://example.test/scholar",
      apiKey: "test-key",
      maxPages: 2,
      num: 20,
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        journal: "publication_info.summary",
        year: "publication_info.summary",
        url: "link"
      }
    },
    onProgress: event => progressEvents.push(event),
    fetchImpl: async url => {
      const start = Number(url.searchParams.get("start") || "0");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          organic_results: [
            {
              title: `Structured illumination microscopy page ${start}`,
              snippet: "A structured illumination microscopy result.",
              publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
              link: `https://example.test/paper-${start}`
            }
          ],
          serpapi_pagination: start === 0 ? {
            next: "https://example.test/scholar?q=structured+illumination+microscopy&start=20"
          } : {}
        })
      };
    }
  });

  const pageEvents = progressEvents.filter(event => event.stage === "source-page");
  assert.equal(pageEvents.length, 2);
  assert.deepEqual(pageEvents.map(event => event.sourcePage), [
    { sourceLabel: "Google Scholar", page: 1, maxPages: 2, start: 0, num: 20, itemStart: 1, itemEnd: 20 },
    { sourceLabel: "Google Scholar", page: 2, maxPages: 2, start: 20, num: 20, itemStart: 21, itemEnd: 40 }
  ]);
  assert.match(pageEvents[1].message, /Google Scholar 第 2 页/);
  assert.match(pageEvents[1].detail, /第 21-40 篇/);
});

test("keeps Google Scholar papers whose normal JSON text mentions robot", async () => {
  const papers = await fetchGoogleScholarPapers(["structured illumination microscopy"], {
    config: {
      provider: "test-scholar-api",
      enabled: true,
      endpoint: "https://example.test/scholar",
      apiKey: "test-key",
      maxPages: 1,
      num: 10,
      request: {
        method: "GET",
        queryName: "q",
        apiKeyQueryName: "api_key",
        useApiKeyHeader: false
      },
      responseMap: {
        items: "organic_results",
        title: "title",
        summary: "snippet",
        journal: "publication_info.summary",
        year: "publication_info.summary",
        url: "link"
      }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        organic_results: [
          {
            title: "Robot-assisted structured illumination microscopy",
            snippet: "A structured illumination microscopy method for robot-guided imaging.",
            publication_info: { summary: "A Author - Optica, 2025 - optica.org" },
            link: "https://example.test/robot-sim"
          }
        ],
        serpapi_pagination: {}
      })
    })
  });

  assert.equal(papers.length, 1);
  assert.equal(papers[0].title, "Robot-assisted structured illumination microscopy");
});

test("reports Google Scholar robot challenges as source errors", async () => {
  await assert.rejects(
    () => fetchGoogleScholarPapers(["structured illumination microscopy"], {
      config: {
        provider: "direct-scholar",
        enabled: true,
        endpoint: "https://scholar.google.com/scholar",
        apiKey: "",
        request: { method: "GET", queryName: "q", useApiKeyHeader: false },
        responseMap: { items: "organic_results" }
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => "<html>Our systems have detected unusual traffic from your computer network. CAPTCHA</html>"
      })
    }),
    /机器人访问|反爬|Google Scholar/
  );
});

test("scores and classifies review papers predictably", () => {
  const text = "A survey and review of microscopy reconstruction theory";

  assert.equal(classifyPaper(text).category, "review");
  assert.ok(scorePaper(text, ["microscopy reconstruction"]) >= 80);
});

test("rescoring uses LLM translated abstract and journal impact tier", () => {
  const paradigmPaper = rescorePaperAfterEnrichment({
    title: "New structured illumination microscopy paradigm",
    summary: "A structured illumination microscopy paper.",
    abstractZh: "提出一种传统结构光照明显微镜的新范式和全新理念，用于突破成像限制。",
    journal: "Nature Methods",
    score: 60,
    journalMetrics: { impactFactor: "35.2", status: "已查询" }
  }, ["structured illumination microscopy"]);
  const algorithmPaper = rescorePaperAfterEnrichment({
    title: "SIM reconstruction algorithm",
    summary: "A structured illumination microscopy paper.",
    abstractZh: "提出传统结构光照明显微镜重建算法改进，提升重建稳定性。",
    journal: "Optics Express",
    score: 60,
    journalMetrics: { impactFactor: "4.1", status: "已查询" }
  }, ["structured illumination microscopy"]);
  const preprintPaper = rescorePaperAfterEnrichment({
    title: "Deep learning structured illumination microscopy",
    summary: "A structured illumination microscopy paper.",
    abstractZh: "利用深度学习结合结构光照明显微镜进行图像重建。",
    journal: "arXiv",
    sourceType: "预印本",
    score: 60,
    journalMetrics: { status: "未查询" }
  }, ["structured illumination microscopy"]);

  assert.equal(paradigmPaper.scoreBreakdown.journalTier, "A");
  assert.equal(algorithmPaper.scoreBreakdown.journalTier, "C");
  assert.equal(preprintPaper.scoreBreakdown.journalTier, "B");
  assert.equal(paradigmPaper.scoreBreakdown.llmRelevanceTier, "A");
  assert.equal(algorithmPaper.scoreBreakdown.llmRelevanceTier, "B");
  assert.equal(preprintPaper.scoreBreakdown.llmRelevanceTier, "B");
  assert.ok(paradigmPaper.score > algorithmPaper.score);
  assert.ok(preprintPaper.score > 60);
});

test("fetch pipeline ranks papers after LLM and journal metric enrichment", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-rescore-rank-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    date: "2026-06-20",
    startDate: "2026-06-01",
    endDate: "2026-06-20",
    keywords: ["structured illumination microscopy"],
    sources: ["Google Scholar"],
    fetchers: {
      googlescholar: async () => [
        {
          id: "keyword-heavy-paper",
          title: "Structured illumination microscopy reconstruction method",
          summary: "structured illumination microscopy reconstruction method with repeated keyword hits",
          journal: "arXiv",
          sourceType: "预印本",
          source: "Google Scholar · arXiv",
          tags: ["structured illumination microscopy"],
          score: 96,
          published: "2026-06-10"
        },
        {
          id: "paradigm-paper",
          title: "New paradigm for structured illumination microscopy",
          summary: "structured illumination microscopy optical imaging",
          journal: "Nature Methods",
          source: "Google Scholar · Nature Methods",
          tags: ["structured illumination microscopy"],
          score: 70,
          published: "2026-06-10"
        }
      ],
      llm: async ({ paper }) => ({
        abstractZh: paper.id === "paradigm-paper"
          ? "提出一种传统结构光照明显微镜的新范式和全新理念。"
          : "提出传统结构光照明显微镜重建算法改进。",
        reason: "中文推荐理由。",
        tokenUsage: { prompt: 10, completion: 10, total: 20, model: "test-llm", status: "已调用 AI" }
      })
    },
    journalMetrics: {
      config: {
        provider: "easyscholar",
        enabled: true,
        endpoint: "https://easyscholar.test/rank",
        apiKey: "test-key",
        request: { method: "GET", queryName: "publicationName", apiKeyQueryName: "secretKey", useApiKeyHeader: false },
        responseMap: {
          impactFactor: "data.officialRank.all.sciif",
          partition: "data.officialRank.all.sci",
          upgradedPartition: "data.officialRank.all.sciUp"
        }
      },
      fetchImpl: async url => {
        const journal = url.searchParams.get("publicationName");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { officialRank: { all: { sciif: journal === "Nature Methods" ? "35.2" : "", sci: "Q1", sciUp: "" } } }
          })
        };
      }
    }
  });

  assert.equal(payload.papers[0].id, "paradigm-paper");
  assert.equal(payload.papers[0].scoreBreakdown.journalTier, "A");
  assert.equal(payload.papers[0].scoreBreakdown.llmRelevanceTier, "A");
  assert.ok(payload.papers[0].score > 90);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("classifies papers with multiple research tags", () => {
  const text = [
    "A neural network reconstruction method for live-cell structured illumination microscopy",
    "combines optical hardware calibration and inverse problem theory."
  ].join(" ");

  const classified = classifyPaper(text);

  assert.deepEqual(classified.categories, ["neural", "bio", "hardware", "theory", "classic"]);
  assert.deepEqual(classified.categoryLabels, [
    "带有神经网络算法",
    "偏生物结果",
    "偏硬件创新",
    "偏理论创新",
    "偏传统算法"
  ]);
  assert.equal(classified.category, "neural");
  assert.equal(classified.categoryLabel, "带有神经网络算法");
});

test("keeps user configuration separate from fetched paper data", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-user-config-"));
  const configFile = path.join(tempDir, "config.json");
  const profileFile = path.join(tempDir, "profile.json");
  const nextConfig = await writeUserConfig({
    keywords: {
      primary: [{ text: "structured illumination microscopy", enabled: true }],
      secondary: [{ text: "SIM", enabled: true }],
      inspiration: [{ text: "diffusion prior", enabled: false }]
    },
    sources: [
      { title: "arXiv", desc: "论文源", tags: ["论文源"], enabled: true }
    ],
    papers: [{ title: "should not be stored in user config" }]
  }, configFile);
  const state = await readUserState({ configFile, profileFile });

  assert.deepEqual(nextConfig.keywords.primary, [{ text: "structured illumination microscopy", enabled: true }]);
  assert.equal(state.profile.researchArea, "填写你的研究方向");
  assert.equal(state.config.sources[0].title, "arXiv");
  assert.equal(state.config.papers, undefined);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("exports local research data without API secrets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-user-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
      mode: "archive",
      count: 1,
      papers: [{ id: "paper-1", title: "Structured illumination microscopy", doi: "10.1000/export" }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "favorites.json"), `${JSON.stringify({
      mode: "favorites",
      favorites: [{ key: "doi:10.1000/export", keys: ["doi:10.1000/export"], paper: { title: "Structured illumination microscopy" } }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "operation-log.jsonl"), `${JSON.stringify({
      operation: "debug",
      apiKey: "should-not-export",
      message: ["Bearer", "shouldNotExportToken123456"].join(" ")
    })}\n`, "utf8");
    await writeUserConfig({
      keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "config.json"));
    await writeUserProfile({
      name: "Local Researcher",
      researchArea: "Private Research Area",
      background: "Private background"
    }, path.join(userDir, "profile.json"));

    const exported = await exportLocalData({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json")
    });
    const serialized = JSON.stringify(exported);

    assert.equal(exported.ok, true);
    assert.equal(exported.data.papers.archive.papers[0].doi, "10.1000/export");
    assert.equal(exported.data.user.config.keywords.primary[0].text, "SIM");
    assert.equal(exported.data.user.profile, undefined);
    assert.equal(exported.data.integrations, undefined);
    assert.equal(serialized.includes("apiKey"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("should-not-export"), false);
    assert.equal(serialized.includes("shouldNotExportToken123456"), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("local data export declares a backup format version", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-format-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-format-user-"));
  try {
    await writeUserConfig({
      keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "config.json"));

    const exported = await exportLocalData({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json")
    });

    assert.equal(exported.format, "paperhot-local-data");
    assert.equal(exported.version, 1);
    assert.equal(exported.minimumImporterVersion, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("local data import rejects unsupported backup versions before writing files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-unsupported-version-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-unsupported-version-user-"));
  try {
    await assert.rejects(
      importLocalData({
        format: "paperhot-local-data",
        version: 999,
        data: {
          user: {
            config: {
              keywords: { primary: [{ text: "SHOULD-NOT-WRITE", enabled: true }], secondary: [], inspiration: [] },
              sources: []
            }
          }
        }
      }, {
        dataDir: tempDir,
        userConfigFile: path.join(userDir, "config.json")
      }),
      /不支持的本地数据备份版本/
    );

    await assert.rejects(fs.readFile(path.join(userDir, "config.json"), "utf8"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("can export optional profile and API secrets when explicitly requested", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-secrets-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-secrets-user-"));
  try {
    await writeUserConfig({
      keywords: { primary: [{ text: "RIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "config.json"));
    await writeUserProfile({
      name: "Local Researcher",
      researchArea: "Private Area",
      background: "Private background"
    }, path.join(userDir, "profile.json"));
    await fs.writeFile(path.join(userDir, "llm.json"), JSON.stringify({
      enabled: true,
      apiKey: "sk-private-llm-key-123456",
      providers: [{ id: "custom", apiKey: "sk-private-llm-key-123456" }]
    }), "utf8");
    await fs.writeFile(path.join(userDir, "google-scholar.json"), JSON.stringify({
      enabled: true,
      apiKey: "serp-private-key"
    }), "utf8");
    await fs.writeFile(path.join(userDir, "journal-metrics.json"), JSON.stringify({
      enabled: true,
      apiKey: "easyscholar-private-key"
    }), "utf8");

    const exported = await exportLocalData({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json"),
      llmConfigFile: path.join(userDir, "llm.json"),
      googleScholarConfigFile: path.join(userDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(userDir, "journal-metrics.json"),
      includeProfile: true,
      includeSecrets: true
    });

    assert.equal(exported.data.user.profile.background, "Private background");
    assert.equal(exported.data.integrations.llm.apiKey, "sk-private-llm-key-123456");
    assert.equal(exported.data.integrations.llm.providers[0].apiKey, "sk-private-llm-key-123456");
    assert.equal(exported.data.integrations.googleScholar.apiKey, "serp-private-key");
    assert.equal(exported.data.integrations.journalMetrics.apiKey, "easyscholar-private-key");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("exports local research data as zip without API secrets by default", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-zip-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-zip-user-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
      mode: "archive",
      count: 1,
      papers: [{ id: "paper-zip-1", title: "Structured illumination microscopy", doi: "10.1000/exportzip" }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "operation-log.jsonl"), `${JSON.stringify({
      operation: "debug",
      apiKey: "should-not-export",
      message: ["Bearer", "shouldNotExportToken123456"].join(" ")
    })}\n`, "utf8");
    await writeUserConfig({
      keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "config.json"));
    await writeUserProfile({
      name: "Local Researcher",
      researchArea: "Private Research Area",
      background: "Private background"
    }, path.join(userDir, "profile.json"));

    const zip = await exportLocalDataZip({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json")
    });
    const entries = parseZipEntries(zip);
    const serialized = Buffer.concat(Object.values(entries)).toString("utf8");

    assert.ok(Buffer.isBuffer(zip));
    assert.deepEqual(Object.keys(entries).sort(), [
      "data/papers/archive.json",
      "data/papers/favorites.json",
      "data/papers/paper-notes.json",
      "data/user/config.json",
      "paperhot-local-data.json"
    ].sort());
    assert.equal(JSON.parse(entries["data/user/config.json"].toString("utf8")).keywords.primary[0].text, "SIM");
    assert.equal(JSON.parse(entries["data/papers/archive.json"].toString("utf8")).papers[0].doi, "10.1000/exportzip");
    assert.equal(entries["data/user/profile.json"], undefined);
    assert.equal(entries["config/llm.json"], undefined);
    assert.equal(entries["data/papers/fetch-log.json"], undefined);
    assert.equal(entries["data/papers/operation-log.jsonl"], undefined);
    assert.equal(entries["data/papers/journal-metrics-cache.json"], undefined);
    assert.equal(serialized.includes("apiKey"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("should-not-export"), false);
    assert.equal(serialized.includes("shouldNotExportToken123456"), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("can export optional stats and logs in zip when selected", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-zip-stats-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-zip-stats-user-"));
  try {
    await writeUserConfig({
      keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "config.json"));
    await fs.writeFile(path.join(tempDir, "2026-06-25.json"), `${JSON.stringify({
      date: "2026-06-25",
      papers: [{ id: "cache-paper", tokenUsage: { total: 12, prompt: 7, completion: 5, model: "test-model" } }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "fetch-log.json"), `${JSON.stringify({
      logs: [{ id: "fetch-log-1", mode: "recent" }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "operation-log.jsonl"), `${JSON.stringify({ operation: "manual", action: "modify" })}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "journal-metrics-cache.json"), `${JSON.stringify({
      updatedAt: "2026-06-25T00:00:00.000Z",
      journals: {
        "nature methods": {
          journal: "Nature Methods",
          metrics: { impactFactor: "32", status: "已查询" }
        }
      }
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "google-rolling-cursors.json"), `${JSON.stringify({
      cursors: { "SIM::googlescholar": { nextStart: 200 } }
    }, null, 2)}\n`, "utf8");

    const zip = await exportLocalDataZip({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      includeStats: true,
      includeLogs: true
    });
    const entries = parseZipEntries(zip);

    assert.ok(entries["data/papers/fetch-log.json"]);
    assert.ok(entries["data/papers/operation-log.jsonl"]);
    assert.ok(entries["data/papers/journal-metrics-cache.json"]);
    assert.ok(entries["data/papers/google-rolling-cursors.json"]);
    assert.ok(entries["data/papers/2026-06-25.json"]);
    assert.equal(JSON.parse(entries["data/papers/google-rolling-cursors.json"].toString("utf8")).cursors["SIM::googlescholar"].nextStart, 200);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("can export optional profile and API secrets in zip when explicitly requested", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-zip-secrets-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-export-zip-secrets-user-"));
  try {
    await writeUserConfig({
      keywords: { primary: [{ text: "RIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "config.json"));
    await writeUserProfile({
      name: "Local Researcher",
      researchArea: "Private Area",
      background: "Private background"
    }, path.join(userDir, "profile.json"));
    await fs.writeFile(path.join(userDir, "llm.json"), JSON.stringify({
      enabled: true,
      apiKey: "sk-private-llm-key-123456",
      providers: [{ id: "custom", apiKey: "sk-private-llm-key-123456" }]
    }), "utf8");
    await fs.writeFile(path.join(userDir, "google-scholar.json"), JSON.stringify({
      enabled: true,
      apiKey: "serp-private-key"
    }), "utf8");
    await fs.writeFile(path.join(userDir, "journal-metrics.json"), JSON.stringify({
      enabled: true,
      apiKey: "easyscholar-private-key"
    }), "utf8");
    await fs.writeFile(path.join(userDir, "web-of-science.json"), JSON.stringify({
      enabled: true,
      apiKey: "wos-private-key"
    }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json"),
      llmConfigFile: path.join(userDir, "llm.json"),
      googleScholarConfigFile: path.join(userDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(userDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(userDir, "web-of-science.json"),
      includeProfile: true,
      includeSecrets: true
    });
    const entries = parseZipEntries(zip);

    assert.equal(JSON.parse(entries["data/user/profile.json"].toString("utf8")).background, "Private background");
    assert.equal(JSON.parse(entries["config/llm.json"].toString("utf8")).apiKey, "sk-private-llm-key-123456");
    assert.equal(JSON.parse(entries["config/google-scholar.json"].toString("utf8")).apiKey, "serp-private-key");
    assert.equal(JSON.parse(entries["config/journal-metrics.json"].toString("utf8")).apiKey, "easyscholar-private-key");
    assert.equal(JSON.parse(entries["config/web-of-science.json"].toString("utf8")).apiKey, "wos-private-key");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("skips imported API configs by default and reports the skip", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-skip-secrets-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-skip-secrets-target-"));
  const sourceUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-skip-secrets-source-user-"));
  const targetUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-skip-secrets-target-user-"));
  try {
    await writeUserConfig({ keywords: { primary: [], secondary: [], inspiration: [] }, sources: [] }, path.join(sourceUserDir, "config.json"));
    await fs.writeFile(path.join(sourceUserDir, "llm.json"), JSON.stringify({ enabled: true, apiKey: "imported-llm-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "google-scholar.json"), JSON.stringify({ enabled: true, apiKey: "imported-serp-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "journal-metrics.json"), JSON.stringify({ enabled: true, apiKey: "imported-easy-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "web-of-science.json"), JSON.stringify({ enabled: true, apiKey: "imported-wos-secret" }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: sourceDir,
      userConfigFile: path.join(sourceUserDir, "config.json"),
      llmConfigFile: path.join(sourceUserDir, "llm.json"),
      googleScholarConfigFile: path.join(sourceUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(sourceUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(sourceUserDir, "web-of-science.json"),
      includeSecrets: true
    });
    const imported = await importLocalDataZip(zip, {
      dataDir: targetDir,
      userConfigFile: path.join(targetUserDir, "config.json"),
      llmConfigFile: path.join(targetUserDir, "llm.json"),
      googleScholarConfigFile: path.join(targetUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(targetUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(targetUserDir, "web-of-science.json")
    });

    assert.deepEqual(imported.skipped, ["integrations"]);
    assert.equal(imported.imported.includes("integrations"), false);
    await assert.rejects(fs.readFile(path.join(targetUserDir, "llm.json"), "utf8"));
    await assert.rejects(fs.readFile(path.join(targetUserDir, "google-scholar.json"), "utf8"));
    await assert.rejects(fs.readFile(path.join(targetUserDir, "journal-metrics.json"), "utf8"));
    await assert.rejects(fs.readFile(path.join(targetUserDir, "web-of-science.json"), "utf8"));
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(sourceUserDir, { recursive: true, force: true });
    await fs.rm(targetUserDir, { recursive: true, force: true });
  }
});

test("imports API configs from zip only when explicitly allowed", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-allow-secrets-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-allow-secrets-target-"));
  const sourceUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-allow-secrets-source-user-"));
  const targetUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-allow-secrets-target-user-"));
  try {
    await writeUserConfig({ keywords: { primary: [], secondary: [], inspiration: [] }, sources: [] }, path.join(sourceUserDir, "config.json"));
    await fs.writeFile(path.join(sourceUserDir, "llm.json"), JSON.stringify({ enabled: true, apiKey: "imported-llm-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "google-scholar.json"), JSON.stringify({ enabled: true, apiKey: "imported-serp-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "journal-metrics.json"), JSON.stringify({ enabled: true, apiKey: "imported-easy-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "web-of-science.json"), JSON.stringify({ enabled: true, apiKey: "imported-wos-secret" }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: sourceDir,
      userConfigFile: path.join(sourceUserDir, "config.json"),
      llmConfigFile: path.join(sourceUserDir, "llm.json"),
      googleScholarConfigFile: path.join(sourceUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(sourceUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(sourceUserDir, "web-of-science.json"),
      includeSecrets: true
    });
    const imported = await importLocalDataZip(zip, {
      dataDir: targetDir,
      userConfigFile: path.join(targetUserDir, "config.json"),
      llmConfigFile: path.join(targetUserDir, "llm.json"),
      googleScholarConfigFile: path.join(targetUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(targetUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(targetUserDir, "web-of-science.json"),
      allowSecrets: true
    });

    assert.equal(imported.imported.includes("integrations"), true);
    assert.deepEqual(imported.skipped, []);
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "llm.json"), "utf8")).apiKey, "imported-llm-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "google-scholar.json"), "utf8")).apiKey, "imported-serp-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "journal-metrics.json"), "utf8")).apiKey, "imported-easy-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "web-of-science.json"), "utf8")).apiKey, "imported-wos-secret");
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(sourceUserDir, { recursive: true, force: true });
    await fs.rm(targetUserDir, { recursive: true, force: true });
  }
});

test("imports local research data through a whitelist", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-user-"));
  try {
    const imported = await importLocalData({
      user: {
        config: {
          keywords: { primary: [{ text: "RIM", enabled: true }], secondary: [], inspiration: [] },
          sources: []
        },
        profile: { name: "Local Researcher", researchArea: "SIM", locale: "zh-CN" }
      },
      papers: {
        archive: { mode: "archive", papers: [{ id: "paper-2", title: "Random illumination microscopy", doi: "10.1000/import" }] },
        favorites: { favorites: [{ key: "doi:10.1000/import", keys: ["doi:10.1000/import"], paper: { title: "Random illumination microscopy" } }] },
        notes: { notes: [{ key: "doi:10.1000/import", keys: ["doi:10.1000/import"], shortTitle: "2026@RIM", read: true, starred: true }] },
        operationLog: [{ operation: "manual-import", action: "import" }],
        fetchLog: { logs: [{ id: "fetch-1", mode: "recent" }] },
        journalMetricsCache: { journals: { "Nature Methods": { impactFactor: "32" } } }
      },
      integrations: { llm: { apiKey: "must-not-import" } }
    }, {
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json")
    });

    assert.equal(imported.ok, true);
    assert.deepEqual(imported.imported.sort(), ["archive", "favorites", "fetchLog", "journalMetricsCache", "notes", "operationLog", "userConfig", "userProfile"].sort());
    assert.equal((await readArchivePayload({ dataDir: tempDir })).papers[0].doi, "10.1000/import");
    assert.equal((await readFavoritesPayload({ dataDir: tempDir })).favorites.length, 1);
    assert.equal((await readPaperNotesPayload({ dataDir: tempDir })).notes[0].shortTitle, "2026@RIM");
    assert.equal((await readUserState({ configFile: path.join(userDir, "config.json"), profileFile: path.join(userDir, "profile.json") })).config.keywords.primary[0].text, "RIM");
    await assert.rejects(fs.readFile(path.join(userDir, "llm.json"), "utf8"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  }
});

test("imports local research data from zip through a whitelist", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-zip-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-zip-target-"));
  const sourceUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-zip-source-user-"));
  const targetUserDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-import-zip-target-user-"));
  try {
    await writeUserConfig({
      keywords: { primary: [{ text: "RIM", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(sourceUserDir, "config.json"));
    await writeUserProfile({
      name: "Local Researcher",
      researchArea: "SIM",
      locale: "zh-CN"
    }, path.join(sourceUserDir, "profile.json"));
    await fs.writeFile(path.join(sourceDir, "archive.json"), `${JSON.stringify({
      mode: "archive",
      papers: [{ id: "paper-zip-2", title: "Random illumination microscopy", doi: "10.1000/importzip" }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(sourceDir, "favorites.json"), `${JSON.stringify({
      favorites: [{ key: "doi:10.1000/importzip", keys: ["doi:10.1000/importzip"], paper: { title: "Random illumination microscopy" } }]
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(sourceDir, "paper-notes.json"), `${JSON.stringify({
      notes: [{ key: "doi:10.1000/importzip", keys: ["doi:10.1000/importzip"], shortTitle: "2026@RIM", read: true, starred: true }]
    }, null, 2)}\n`, "utf8");

    const zip = await exportLocalDataZip({
      dataDir: sourceDir,
      userConfigFile: path.join(sourceUserDir, "config.json"),
      userProfileFile: path.join(sourceUserDir, "profile.json"),
      includeProfile: true,
      includeStats: true,
      includeLogs: true
    });
    const imported = await importLocalDataZip(zip, {
      dataDir: targetDir,
      userConfigFile: path.join(targetUserDir, "config.json"),
      userProfileFile: path.join(targetUserDir, "profile.json")
    });

    assert.equal(imported.ok, true);
    assert.deepEqual(imported.imported.sort(), ["archive", "favorites", "fetchLog", "googleRollingCursors", "journalMetricsCache", "notes", "operationLog", "userConfig", "userProfile"].sort());
    assert.equal((await readArchivePayload({ dataDir: targetDir })).papers[0].doi, "10.1000/importzip");
    assert.equal((await readPaperNotesPayload({ dataDir: targetDir })).notes[0].shortTitle, "2026@RIM");
    assert.equal((await readUserState({ configFile: path.join(targetUserDir, "config.json"), profileFile: path.join(targetUserDir, "profile.json") })).config.keywords.primary[0].text, "RIM");
    await assert.rejects(fs.readFile(path.join(targetUserDir, "llm.json"), "utf8"));
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(sourceUserDir, { recursive: true, force: true });
    await fs.rm(targetUserDir, { recursive: true, force: true });
  }
});

test("uses empty keyword defaults when user config is missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-default-config-"));
  const configFile = path.join(tempDir, "config.json");
  const profileFile = path.join(tempDir, "profile.json");

  const state = await readUserState({ configFile, profileFile });

  assert.deepEqual(state.config.keywords, {
    primary: [],
    secondary: [],
    inspiration: []
  });
  assert.ok(state.config.sources.length > 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("reads Web of Science configuration without embedding secrets in integration state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-config-"));
  const webOfScienceConfigFile = path.join(tempDir, "web-of-science.json");
  await fs.writeFile(webOfScienceConfigFile, JSON.stringify({
    provider: "web-of-science",
    enabled: true,
    endpoint: "https://api.clarivate.com/apis/wos-starter/v1/documents",
    apiKey: "wos-private-key",
    databaseId: "WOS",
    maxPages: 2,
    pageSize: 25,
    queryTemplate: "TS=({query})",
    request: { method: "GET", queryName: "q", databaseQueryName: "db", pageQueryName: "page", limitQueryName: "limit", apiKeyHeader: "X-ApiKey", useApiKeyHeader: true },
    responseMap: { items: "hits", title: "title", journal: "source.sourceTitle" }
  }), "utf8");

  const config = await readWebOfScienceConfig(webOfScienceConfigFile);
  const integrations = await readIntegrationConfigs({
    webOfScienceConfigFile,
    llmConfigFile: path.join(tempDir, "missing-llm.json"),
    googleScholarConfigFile: path.join(tempDir, "missing-google.json"),
    journalMetricsConfigFile: path.join(tempDir, "missing-journal.json")
  });
  const secrets = await readIntegrationSecrets({
    webOfScienceConfigFile,
    llmConfigFile: path.join(tempDir, "missing-llm.json"),
    googleScholarConfigFile: path.join(tempDir, "missing-google.json"),
    journalMetricsConfigFile: path.join(tempDir, "missing-journal.json")
  });

  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "wos-private-key");
  assert.equal(config.databaseId, "WOS");
  assert.equal(config.maxPages, 2);
  assert.equal(config.pageSize, 25);
  assert.equal(integrations.webOfScience.apiKey, "");
  assert.equal(integrations.webOfScience.hasApiKey, true);
  assert.equal(secrets.webOfScience.apiKey, "wos-private-key");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("preserves stored Web of Science API key when saving blank key fields", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-save-"));
  const webOfScienceConfigFile = path.join(tempDir, "web-of-science.json");
  await fs.writeFile(webOfScienceConfigFile, JSON.stringify({
    enabled: true,
    endpoint: "https://old.example.test/wos",
    apiKey: "stored-wos-key"
  }), "utf8");

  const integrations = await writeIntegrationConfigs({
    webOfScience: {
      enabled: true,
      endpoint: "https://new.example.test/wos",
      apiKey: "",
      maxPages: 1,
      pageSize: 10
    }
  }, {
    webOfScienceConfigFile,
    llmConfigFile: path.join(tempDir, "llm.json"),
    googleScholarConfigFile: path.join(tempDir, "google-scholar.json"),
    journalMetricsConfigFile: path.join(tempDir, "journal-metrics.json")
  });
  const saved = JSON.parse(await fs.readFile(webOfScienceConfigFile, "utf8"));

  assert.equal(saved.endpoint, "https://new.example.test/wos");
  assert.equal(saved.apiKey, "stored-wos-key");
  assert.equal(integrations.webOfScience.hasApiKey, true);
  assert.equal(integrations.webOfScience.apiKey, "");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("reads EasyScholar journal metrics configuration without embedding secrets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-config-"));
  const configFile = path.join(tempDir, "journal-metrics.json");
  await fs.writeFile(configFile, JSON.stringify({
    provider: "easyscholar",
    enabled: true,
    endpoint: "https://easyscholar.cc/open/getPublicationRank",
    apiKey: "test-key",
    minIntervalMs: 500,
    request: { method: "GET", queryName: "publicationName", apiKeyQueryName: "secretKey", useApiKeyHeader: false },
    responseMap: {
      impactFactor: "data.officialRank.all.sciif",
      partition: "data.officialRank.all.sci"
    }
  }), "utf8");

  const config = await readJournalMetricsConfig(configFile);

  assert.equal(config.provider, "easyscholar");
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "test-key");
  assert.equal(config.minIntervalMs, 500);
  assert.equal(config.request.queryName, "publicationName");
  assert.equal(config.request.apiKeyQueryName, "secretKey");
  assert.equal(config.responseMap.impactFactor, "data.officialRank.all.sciif");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("fetches EasyScholar journal metrics with query key auth", async () => {
  const seen = {};
  const metrics = await fetchJournalMetrics("Nature Methods", {
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    fetchImpl: async url => {
      seen.url = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          msg: "SUCCESS",
          data: {
            officialRank: {
              all: {
                sci: "Q1",
                sciif: "28.3",
                sciUp: "生物学1区"
              }
            }
          }
        })
      };
    }
  });

  assert.equal(seen.url.searchParams.get("publicationName"), "Nature Methods");
  assert.equal(seen.url.searchParams.get("secretKey"), "test-key");
  assert.deepEqual(metrics, {
    impactFactor: "28.3",
    partition: "Q1",
    upgradedPartition: "生物学1区",
    source: "easyscholar · Nature Methods",
    status: "已查询"
  });
});

test("limits EasyScholar journal metric requests to two per second by default", async () => {
  let currentTime = 1000;
  const waits = [];
  const seenTimes = [];
  const baseOptions = {
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      minIntervalMs: 500,
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    rateLimiter: { lastRequestAt: 0, chain: Promise.resolve() },
    now: () => currentTime,
    sleep: async ms => {
      waits.push(ms);
      currentTime += ms;
    },
    fetchImpl: async () => {
      seenTimes.push(currentTime);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { officialRank: { all: { sci: "Q1", sciif: "28.3", sciUp: "生物学1区" } } }
        })
      };
    }
  };

  await fetchJournalMetrics("Nature Methods", baseOptions);
  await fetchJournalMetrics("Bioinformatics", baseOptions);

  assert.deepEqual(waits, [500]);
  assert.deepEqual(seenTimes, [1000, 1500]);
});

test("enriches papers with EasyScholar journal metrics", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-enrich-"));
  const papers = [
    { title: "method paper", source: "Semantic Scholar · Nature Methods", journalMetrics: { status: "未查询" } },
    { title: "preprint", journal: "arXiv", source: "arXiv cs.CV", sourceType: "预印本", doi: "10.48550/arXiv.2601.00001", journalMetrics: { status: "未查询" } }
  ];
  let requestCount = 0;

  const enriched = await enrichPapersWithJournalMetrics(papers, {
    dataDir: tempDir,
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        requestCount += 1;
        return {
          code: 200,
          msg: "SUCCESS",
          data: {
            officialRank: {
              all: {
                sci: "Q1",
                sciif: "28.3",
                sciUp: "生物学1区"
              }
            }
          }
        };
      }
    })
  });

  assert.equal(enriched[0].journalMetrics.impactFactor, "28.3");
  assert.equal(enriched[0].journalMetrics.partition, "Q1");
  assert.equal(enriched[1].journalMetrics.status, "未查询");
  assert.equal(requestCount, 1);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("reuses local EasyScholar journal metrics cache across enrich runs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-cache-"));
  const papers = [
    { title: "method paper", journal: "Nature Methods", journalMetrics: { status: "未查询" } }
  ];
  let requestCount = 0;
  const options = {
    dataDir: tempDir,
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          msg: "SUCCESS",
          data: { officialRank: { all: { sci: "Q1", sciif: "28.3", sciUp: "生物学1区" } } }
        })
      };
    }
  };

  const first = await enrichPapersWithJournalMetrics(papers, options);
  const second = await enrichPapersWithJournalMetrics(papers, options);
  const cache = await readJournalMetricsCache(tempDir);

  assert.equal(first[0].journalMetrics.impactFactor, "28.3");
  assert.equal(second[0].journalMetrics.impactFactor, "28.3");
  assert.equal(requestCount, 1);
  assert.equal(cache.journals["nature methods"].metrics.partition, "Q1");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("keeps unresolved EasyScholar responses out of paper records", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-unresolved-"));
  const papers = [
    { title: "rate limited paper", journal: "Light: Science & Applications", source: "Google 搜索 · Light: Science & Applications", journalMetrics: { status: "未查询" } }
  ];

  const enriched = await enrichPapersWithJournalMetrics(papers, {
    dataDir: tempDir,
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 429, msg: "请求频繁，请稍后再试", data: {} })
    })
  });

  assert.equal(enriched[0].journalMetrics.status, "未查询");
  assert.notEqual(enriched[0].journalMetrics.status, "未匹配：请求频繁，请稍后再试");
  assert.notEqual(enriched[0].journalMetrics.source, "easyscholar");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("refreshes archived journal metrics by unique journal and writes local cache", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-refresh-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 3,
    papers: [
      { id: "a", title: "a", journal: "Nature Methods", published: "2026-06-21", journalMetrics: { status: "未查询" } },
      { id: "b", title: "b", journal: "Nature Methods", published: "2026-06-20", journalMetrics: { status: "未查询" } },
      { id: "c", title: "c", journal: "arXiv", sourceType: "预印本", published: "2026-06-19", journalMetrics: { status: "未查询" } }
    ]
  }, null, 2)}\n`, "utf8");

  let requestCount = 0;
  const payload = await refreshJournalMetricsForArchive({
    dataDir: tempDir,
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          msg: "SUCCESS",
          data: { officialRank: { all: { sci: "Q1", sciif: "28.3", sciUp: "生物学1区" } } }
        })
      };
    }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
  const cache = await readJournalMetricsCache(tempDir);

  assert.equal(requestCount, 1);
  assert.equal(payload.journalCount, 1);
  assert.equal(payload.matchedCount, 1);
  assert.equal(payload.updatedCount, 2);
  assert.equal(cache.journals["nature methods"].metrics.impactFactor, "28.3");
  assert.equal(archive.papers.filter(paper => paper.journal === "Nature Methods" && paper.journalMetrics.partition === "Q1").length, 2);
  assert.equal(archive.papers.find(paper => paper.id === "c").journalMetrics.status, "未查询");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("seeds journal metrics cache from successful archived paper metrics", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-seed-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [
      {
        id: "a",
        title: "a",
        journal: "Nature Biotechnology",
        published: "2026-06-21",
        journalMetrics: {
          impactFactor: "44.5",
          partition: "Q1",
          upgradedPartition: "生物学1区",
          source: "easyscholar · Nature Biotechnology",
          status: "已查询"
        }
      }
    ]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshJournalMetricsForArchive({
    dataDir: tempDir,
    config: {
      provider: "easyscholar",
      enabled: true,
      endpoint: "https://easyscholar.cc/open/getPublicationRank",
      apiKey: "test-key",
      request: {
        method: "GET",
        queryName: "publicationName",
        apiKeyQueryName: "secretKey",
        useApiKeyHeader: false
      },
      responseMap: {
        impactFactor: "data.officialRank.all.sciif",
        partition: "data.officialRank.all.sci",
        upgradedPartition: "data.officialRank.all.sciUp"
      }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: 429, msg: "请求频繁，请稍后再试", data: {} })
    })
  });
  const cache = await readJournalMetricsCache(tempDir);

  assert.equal(payload.matchedCount, 0);
  assert.equal(cache.journals["nature biotechnology"].metrics.impactFactor, "44.5");
  assert.equal(payload.papers[0].journalMetrics.partition, "Q1");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("builds token statistics from cached paper files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-token-stats-"));
  const writePayload = async (name, papers) => {
    await fs.writeFile(path.join(tempDir, name), `${JSON.stringify({ papers }, null, 2)}\n`, "utf8");
  };
  await writePayload("2026-06-19.json", [
    { title: "today-a", tokenUsage: { prompt: 100, completion: 40, total: 140, model: "gpt-4.1-mini" } },
    { title: "today-b", tokenUsage: { prompt: 60, completion: 20, total: 80, model: "gpt-4.1-mini" } }
  ]);
  await writePayload("2026-06-18-recent.json", [
    { title: "recent", tokenUsage: { prompt: 30, completion: 10, total: 40, model: "gpt-4.1" } }
  ]);
  await writePayload("2026-05-18.json", [
    { title: "old", tokenUsage: { prompt: 999, completion: 1, total: 1000, model: "gpt-4.1" } }
  ]);

  const stats = await buildTokenStats({ dataDir: tempDir, today: "2026-06-19" });

  assert.equal(stats.today.total, 220);
  assert.equal(stats.last7Days.total, 260);
  assert.equal(stats.last30Days.total, 260);
  assert.deepEqual(stats.byModel, [
    { model: "gpt-4.1-mini", prompt: 160, completion: 60, total: 220, papers: 2 },
    { model: "gpt-4.1", prompt: 30, completion: 10, total: 40, papers: 1 }
  ]);
  assert.equal(stats.daily.length, 30);
  assert.equal(stats.daily.at(-1).date, "2026-06-19");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("builds today's token statistics from archive fetch timestamps", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-token-stats-archive-"));
  const writePayload = async (name, papers) => {
    await fs.writeFile(path.join(tempDir, name), `${JSON.stringify({ papers }, null, 2)}\n`, "utf8");
  };
  await writePayload("2026-06-24.json", [
    {
      id: "cached-same-paper",
      doi: "10.1000/same",
      title: "Cached same paper",
      tokenUsage: { prompt: 100, completion: 40, total: 140, model: "qwen-plus" }
    }
  ]);
  await writePayload("archive.json", [
    {
      id: "archive-only-today",
      title: "Archive only today",
      fetchedAt: "2026-06-24T14:06:36.543Z",
      tokenUsage: { prompt: 200, completion: 60, total: 260, model: "qwen-plus", status: "已调用 AI" }
    },
    {
      id: "archive-same-paper",
      doi: "10.1000/same",
      title: "Archive same paper",
      fetchedAt: "2026-06-24T14:06:36.543Z",
      tokenUsage: { prompt: 100, completion: 40, total: 140, model: "qwen-plus", status: "已调用 AI" }
    },
    {
      id: "archive-yesterday",
      title: "Archive yesterday",
      fetchedAt: "2026-06-23T14:06:36.543Z",
      tokenUsage: { prompt: 30, completion: 10, total: 40, model: "qwen-plus", status: "已调用 AI" }
    }
  ]);

  const stats = await buildTokenStats({ dataDir: tempDir, today: "2026-06-24" });

  assert.equal(stats.today.total, 400);
  assert.equal(stats.today.papers, 2);
  assert.equal(stats.last7Days.total, 440);
  assert.equal(stats.daily.at(-1).date, "2026-06-24");
  assert.equal(stats.daily.at(-1).total, 400);
  assert.deepEqual(stats.byModel, [
    { model: "qwen-plus", prompt: 330, completion: 110, total: 440, papers: 3 }
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("builds token statistics from fetch log LLM usage before cached paper totals", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-token-stats-fetch-log-"));
  await fs.writeFile(path.join(tempDir, "2026-06-26-recent.json"), `${JSON.stringify({
    papers: [
      { title: "shown-a", tokenUsage: { prompt: 500, completion: 100, total: 600, model: "qwen-plus" } },
      { title: "shown-b", tokenUsage: { prompt: 400, completion: 200, total: 600, model: "qwen-plus" } }
    ]
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(tempDir, "fetch-log.json"), `${JSON.stringify({
    entries: [
      {
        at: "2026-06-26T02:05:25.430Z",
        llm: {
          models: [
            { model: "qwen-plus", calls: 30, prompt: 15159, completion: 5340, total: 20499 }
          ],
          calls: 30,
          totalTokens: 20499
        }
      },
      {
        at: "2026-06-25T08:25:16.249Z",
        llm: {
          models: [
            { model: "qwen-plus", calls: 10, prompt: 7379, completion: 3589, total: 10968 }
          ],
          calls: 10,
          totalTokens: 10968
        }
      }
    ]
  }, null, 2)}\n`, "utf8");

  const stats = await buildTokenStats({ dataDir: tempDir, today: "2026-06-26" });

  assert.equal(stats.today.total, 20499);
  assert.equal(stats.today.prompt, 15159);
  assert.equal(stats.today.completion, 5340);
  assert.equal(stats.today.papers, 30);
  assert.equal(stats.last7Days.total, 31467);
  assert.equal(stats.daily.at(-1).total, 20499);
  assert.deepEqual(stats.byModel, [
    { model: "qwen-plus", prompt: 22538, completion: 8929, total: 31467, papers: 40 }
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("builds token statistics from operation log LLM usage for manual refreshes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-token-stats-operation-log-"));
  await fs.writeFile(path.join(tempDir, "operation-log.jsonl"), [
    JSON.stringify({
      at: "2026-06-26T12:39:25.774Z",
      action: "modify",
      operation: "archive-llm-refresh-one",
      paper: { id: "manual-refresh-paper", title: "Manual LLM refresh paper" },
      llm: {
        models: [
          { model: "qwen-plus", calls: 1, prompt: 730, completion: 288, total: 1018 }
        ],
        calls: 1,
        totalTokens: 1018
      }
    }),
    JSON.stringify({
      at: "2026-06-26T13:00:00.000Z",
      action: "modify",
      operation: "archive-llm-refresh-missing",
      papers: [{ id: "bulk-refresh-paper", title: "Bulk LLM refresh paper" }],
      llm: {
        models: [
          { model: "qwen-plus", calls: 2, prompt: 20, completion: 10, total: 30 }
        ],
        calls: 2,
        totalTokens: 30
      }
    })
  ].join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    papers: [
      {
        id: "manual-refresh-paper",
        title: "Manual LLM refresh paper",
        llmUpdatedAt: "2026-06-26T12:39:25.774Z",
        tokenUsage: { prompt: 730, completion: 288, total: 1018, model: "qwen-plus", status: "已调用 AI" }
      }
    ]
  }, null, 2)}\n`, "utf8");

  const stats = await buildTokenStats({ dataDir: tempDir, today: "2026-06-26" });

  assert.equal(stats.today.total, 1048);
  assert.equal(stats.today.prompt, 750);
  assert.equal(stats.today.completion, 298);
  assert.equal(stats.today.papers, 3);
  assert.deepEqual(stats.byModel, [
    { model: "qwen-plus", prompt: 750, completion: 298, total: 1048, papers: 3 }
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("uses archived llmUpdatedAt token usage as fallback for older manual LLM refreshes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-token-stats-llm-updated-fallback-"));
  await fs.writeFile(path.join(tempDir, "fetch-log.json"), `${JSON.stringify({
    entries: [
      {
        at: "2026-06-26T02:05:25.430Z",
        llm: {
          models: [
            { model: "qwen-plus", calls: 30, prompt: 15159, completion: 5340, total: 20499 }
          ],
          calls: 30,
          totalTokens: 20499
        }
      }
    ]
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    papers: [
      {
        id: "old-manual-refresh",
        title: "Old manual refresh paper",
        fetchedAt: "2026-06-20T08:00:00.000Z",
        llmUpdatedAt: "2026-06-26T12:39:25.774Z",
        tokenUsage: { prompt: 730, completion: 288, total: 1018, model: "qwen-plus", status: "已调用 AI" }
      },
      {
        id: "new-manual-refresh",
        title: "New manual refresh paper",
        llmUpdatedAt: "2026-06-26T13:00:00.000Z",
        tokenUsage: { prompt: 20, completion: 10, total: 30, model: "qwen-plus", status: "已调用 AI" }
      }
    ]
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(tempDir, "operation-log.jsonl"), `${JSON.stringify({
    at: "2026-06-26T12:40:00.000Z",
    action: "modify",
    operation: "paper-note-update",
    paper: { id: "old-manual-refresh", title: "Old manual refresh paper" }
  })}\n${JSON.stringify({
    at: "2026-06-26T13:00:00.000Z",
    action: "modify",
    operation: "archive-llm-refresh-one",
    paper: { id: "new-manual-refresh", title: "New manual refresh paper" },
    llm: {
      models: [
        { model: "qwen-plus", calls: 1, prompt: 20, completion: 10, total: 30 }
      ],
      calls: 1,
      totalTokens: 30
    }
  })}\n`, "utf8");

  const stats = await buildTokenStats({ dataDir: tempDir, today: "2026-06-26" });

  assert.equal(stats.today.total, 21547);
  assert.equal(stats.today.prompt, 15909);
  assert.equal(stats.today.completion, 5638);
  assert.equal(stats.today.papers, 32);
  assert.deepEqual(stats.byModel, [
    { model: "qwen-plus", prompt: 15909, completion: 5638, total: 21547, papers: 32 }
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
});
