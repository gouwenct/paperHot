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
  parseEnabledSources,
  refinePaperPool,
  buildArxivQuery,
  buildTokenStats,
  filterPapersByDate,
  fetchRecentPapers,
  readJournalMetricsConfig,
  readUserState,
  writeUserConfig,
  scorePaper
} = require("../paperhot_backend.cjs");

test("normalizes arXiv entries into the frontend paper schema", () => {
  const paper = normalizeArxivEntry({
    id: "https://arxiv.org/abs/2606.12345v1",
    title: "Diffusion Prior for Computational Microscopy",
    summary: "A neural inverse problem method for microscopy reconstruction.",
    published: "2026-06-19T09:20:00Z",
    authors: ["A. Researcher", "B. Scientist"],
    categories: ["cs.CV", "eess.IV"]
  });

  assert.equal(paper.id, "arxiv-2606.12345v1");
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
    url: "https://www.semanticscholar.org/paper/abc123",
    authors: [{ name: "A. Author" }, { name: "B. Author" }],
    openAccessPdf: { url: "https://example.org/paper.pdf" }
  });

  assert.equal(paper.id, "semanticscholar-abc123");
  assert.equal(paper.sourceType, "论文数据库");
  assert.equal(paper.source, "Semantic Scholar · Nature Methods");
  assert.equal(paper.category, "neural");
  assert.ok(paper.categoryLabels.includes("偏传统算法"));
  assert.equal(paper.time, "00:00");
  assert.equal(paper.url, "https://www.semanticscholar.org/paper/abc123");
  assert.equal(paper.pdfUrl, "https://example.org/paper.pdf");
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

test("recent paper mode does not require today's date", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-paper-cache-"));
  const payload = await fetchRecentPapers({
    dataDir: tempDir,
    keywords: ["structured illumination"],
    fetchers: {
      arxiv: async () => [
        {
          title: "Structured illumination microscopy reconstruction",
          summary: "A structured illumination method.",
          tags: [],
          published: "2026-05-20T06:11:29Z",
          score: 80
        }
      ],
      biorxiv: async () => []
    }
  });

  assert.equal(payload.count, 1);
  assert.equal(payload.mode, "recent");
  assert.match(payload.cacheFile, /paperhot-paper-cache-/);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("parses enabled frontend sources into supported backend source ids", () => {
  const sources = parseEnabledSources(["arXiv", "bioRxiv", "Semantic Scholar", "某个公众号"]);

  assert.deepEqual(sources, ["arxiv", "biorxiv", "semanticscholar"]);
});

test("scores and classifies review papers predictably", () => {
  const text = "A survey and review of microscopy reconstruction theory";

  assert.equal(classifyPaper(text).category, "review");
  assert.ok(scorePaper(text, ["microscopy reconstruction"]) >= 80);
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
  const state = await readUserState({ configFile });

  assert.deepEqual(nextConfig.keywords.primary, [{ text: "structured illumination microscopy", enabled: true }]);
  assert.equal(state.profile.researchArea, "计算显微与成像重建");
  assert.equal(state.config.sources[0].title, "arXiv");
  assert.equal(state.config.papers, undefined);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("reads EasyScholar journal metrics configuration without embedding secrets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-journal-config-"));
  const configFile = path.join(tempDir, "journal-metrics.json");
  await fs.writeFile(configFile, JSON.stringify({
    provider: "easyscholar",
    enabled: true,
    endpoint: "https://www.easyscholar.cc/open/api/journal",
    apiKey: "test-key",
    request: { method: "GET", queryName: "journal" },
    responseMap: {
      impactFactor: "data.impactFactor",
      partition: "data.partition"
    }
  }), "utf8");

  const config = await readJournalMetricsConfig(configFile);

  assert.equal(config.provider, "easyscholar");
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "test-key");
  assert.equal(config.responseMap.impactFactor, "data.impactFactor");
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
