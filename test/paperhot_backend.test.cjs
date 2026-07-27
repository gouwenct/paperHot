const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  classifyPaper,
  dedupePapers,
  filterPapersByKeywords,
  normalizeArxivEntry,
  normalizeBioRxivItem,
  normalizeSemanticScholarPaper,
  normalizeOpenAlexWork,
  normalizeWebOfScienceRecord,
  parseEnabledSources,
  paperMatchesSearchLogic,
  refinePaperPool,
  buildArxivQuery,
  buildDiscoveryTaskFingerprint,
  buildSearchExpression,
  abstractMatchText,
  buildTokenStats,
  enrichPapersWithCrossref,
  enrichPapersWithPublisherDates,
  enrichPapersWithJournalMetrics,
  enrichPapersWithLlmInsights,
  enrichTruncatedGoogleTitles,
  filterPapersByDate,
  fetchJournalMetrics,
  fetchArxivPapers,
  fetchBioRxivPapers,
  fetchGoogleScholarPapers,
  fetchGoogleSearchPapers,
  fetchCrossrefWorkByTitle,
  fetchFirecrawlAbstractForPaper,
  fetchPaperPayload,
  fetchOpenAlexPapers,
  fetchWebOfSciencePapers,
  googleScholarCitationCount,
  readGoogleRollingCursorStatus,
  readRecentFetchCursors,
  readWebOfScienceUsage,
  recordWebOfScienceRequest,
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
  testFirecrawlConfig,
  readLlmConfig,
  readAliyunTextModelRegistry,
  readLlmModelPoolState,
  readLlmModelPoolStatus,
  updateLlmModelPoolModel,
  testLlmPoolModel,
  writeLlmModelPoolState,
  cleanLlmModelPool,
  modelPoolStatusForModel,
  selectLlmPoolModel,
  isRetryableLlmModelFailure,
  callConfiguredLlmWithPool,
  resetLlmModelPoolState,
  todayString,
  readIntegrationConfigs,
  readIntegrationSecrets,
  readAcademicApisConfig,
  readOpenAlexConfig,
  readJournalMetricsConfig,
  readFirecrawlConfig,
  readWebOfScienceConfig,
  readJournalMetricsCache,
  readFavoritesPayload,
  readPaperByKey,
  readPaperNotesPayload,
  readUserState,
  addCandidatePaperToArchive,
  removeCandidatePaperFromArchive,
  clearUnstarredPaperArchive,
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
  webOfScienceCitationCount,
  exportLocalData,
  exportLocalDataZip,
  importLocalDataZip,
  importLocalData,
  parseZipEntries,
  scorePaper,
  selectMatchingAbstractCandidate,
  rescorePaperAfterEnrichment,
  writeRecentFetchCursor,
  clearRecentFetchCursor,
  readDiscoveryTaskState,
  detectExactPaperInput,
  fetchCrossrefWorkByDoi,
  fetchOpenAlexLineage,
  fetchSemanticScholarLineage,
  lineageNodeFromOpenAlex,
  lineageNodeFromSemanticScholar,
  lineageNodeKey,
  mergeLineageNodes,
  rankLineageNodes,
  recoverGeneratedSummaryPapers,
  restoreOpenAlexAbstract,
  buildPaperLineage,
  fetchCrossrefLineagePredecessors,
  fetchLineagePaperDetail,
  lineageCacheFileName,
  lineagePaperRecord,
  lookupLineageNodeByTitle,
  enrichLineageNodesWithoutIdentifiers
} = require("../paperhot_backend.cjs");

const llmPoolStateKey = (providerId, model) => `${providerId}::${model}`;

function matchingAbstractSources(value, onCall = () => {}) {
  const load = async paper => {
    onCall(paper);
    return {
      doi: paper.doi,
      title: paper.title,
      authors: paper.authors,
      abstract: typeof value === "function" ? value(paper) : value
    };
  };
  return { wos: load, semanticScholar: load };
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  const records = [];
  let offset = 0;

  Object.entries(entries).forEach(([name, value]) => {
    const nameBuffer = Buffer.from(name, "utf8");
    const content = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, content);
    records.push({ nameBuffer, size: content.length, offset });
    offset += localHeader.length + nameBuffer.length + content.length;
  });

  records.forEach(record => {
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(record.size, 20);
    centralHeader.writeUInt32LE(record.size, 24);
    centralHeader.writeUInt16LE(record.nameBuffer.length, 28);
    centralHeader.writeUInt32LE(record.offset, 42);
    centralParts.push(centralHeader, record.nameBuffer);
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

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

test("normalizes OpenAlex works and restores inverted abstracts", () => {
  const abstract = restoreOpenAlexAbstract({ Structured: [0], illumination: [1], microscopy: [2], improves: [3], reconstruction: [4] });
  const paper = normalizeOpenAlexWork({
    id: "https://openalex.org/W123",
    title: "OpenAlex structured illumination microscopy",
    doi: "https://doi.org/10.1000/openalex",
    publication_date: "2026-07-15",
    type: "article",
    cited_by_count: 17,
    abstract_inverted_index: { Structured: [0], illumination: [1], microscopy: [2], improves: [3], reconstruction: [4] },
    authorships: [{ author: { display_name: "A. Researcher" } }],
    primary_location: {
      landing_page_url: "https://example.org/openalex",
      pdf_url: "https://example.org/openalex.pdf",
      source: { display_name: "Nature Methods" }
    },
    topics: [{ display_name: "Computational microscopy" }]
  });

  assert.equal(abstract, "Structured illumination microscopy improves reconstruction");
  assert.equal(paper.id, "openalex-W123");
  assert.equal(paper.doi, "10.1000/openalex");
  assert.deepEqual(paper.authors, ["A. Researcher"]);
  assert.equal(paper.journal, "Nature Methods");
  assert.equal(paper.published, "2026-07-15");
  assert.equal(paper.citationCount, 17);
  assert.equal(paper.citationSource, "OpenAlex");
  assert.equal(paper.pdfUrl, "https://example.org/openalex.pdf");
  assert.deepEqual(paper.tags, ["Computational microscopy"]);
});

test("fetches OpenAlex works with API key, contact email, dates and pagination", async () => {
  const requests = [];
  const papers = await fetchOpenAlexPapers(["structured illumination microscopy"], {
    config: { enabled: true, endpoint: "https://api.openalex.org/works", apiKey: "oa-test", maxPages: 1, perPage: 100 },
    academicApis: { contactEmail: "researcher@example.org" },
    queryExpression: "structured illumination microscopy",
    searchMode: "direction",
    startDate: "2026-06-01",
    endDate: "2026-07-16",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{
          id: "https://openalex.org/W456",
          title: "Structured illumination microscopy from OpenAlex",
          publication_year: 2026,
          abstract_inverted_index: { Structured: [0], illumination: [1], microscopy: [2] }
        }] })
      };
    }
  });

  assert.equal(requests[0].url.searchParams.get("api_key"), "oa-test");
  assert.equal(requests[0].url.searchParams.get("search"), "structured illumination microscopy");
  assert.equal(requests[0].url.searchParams.get("filter"), "from_publication_date:2026-06-01,to_publication_date:2026-07-16");
  assert.match(requests[0].options.headers["User-Agent"], /researcher@example\.org/);
  assert.equal(papers[0].source, "OpenAlex · OpenAlex");
});

test("reads and masks OpenAlex integration config while preserving a saved key", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-openalex-config-"));
  const openAlexConfigFile = path.join(tempDir, "openalex.json");
  const options = {
    openAlexConfigFile,
    llmConfigFile: path.join(tempDir, "llm.json"),
    googleScholarConfigFile: path.join(tempDir, "google-scholar.json"),
    journalMetricsConfigFile: path.join(tempDir, "journal-metrics.json"),
    webOfScienceConfigFile: path.join(tempDir, "web-of-science.json"),
    firecrawlConfigFile: path.join(tempDir, "firecrawl.json"),
    academicApisConfigFile: path.join(tempDir, "academic-apis.json"),
    firecrawlFetchImpl: async () => ({ ok: false, status: 401 })
  };
  try {
    await fs.writeFile(openAlexConfigFile, JSON.stringify({ enabled: true, apiKey: "oa-secret", maxPages: 2, perPage: 50 }), "utf8");
    assert.equal((await readOpenAlexConfig(openAlexConfigFile)).apiKey, "oa-secret");
    const integrations = await readIntegrationConfigs(options);
    assert.equal(integrations.openAlex.apiKey, "");
    assert.equal(integrations.openAlex.hasApiKey, true);
    await writeIntegrationConfigs({ openAlex: { enabled: true, apiKey: "" } }, options);
    assert.equal((await readOpenAlexConfig(openAlexConfigFile)).apiKey, "oa-secret");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

test("normalizes Web of Science English publication months without inventing a day", () => {
  const paper = normalizeWebOfScienceRecord({
    uid: "WOS:MONTH",
    title: "Structured illumination microscopy month metadata",
    source: { sourceTitle: "Optica", publishYear: 2026, publishMonth: "JUL" }
  }, ["structured illumination microscopy"]);

  assert.equal(paper.published, "2026-07");
  assert.equal(paper.publishedPrecision, "month");
});

test("source normalizers preserve citation database and preprint stage", () => {
  const wos = normalizeWebOfScienceRecord({
    uid: "WOS:0001",
    title: "STRUCTURED ILLUMINATION MICROSCOPY WITH DNA AND 3D SIM",
    source: { sourceTitle: "Photonix", publishYear: 2026 },
    names: { authors: [{ displayName: "A. Author" }] },
    citations: [{ db: "WOS", count: 18 }]
  });
  assert.equal(wos.title, "STRUCTURED ILLUMINATION MICROSCOPY WITH DNA AND 3D SIM");
  assert.equal(wos.retrievalSource, "webofscience");
  assert.equal(wos.sourceId, "WOS:0001");
  assert.equal(wos.citationCount, 18);
  assert.equal(wos.citationSource, "Web of Science");
  assert.equal(wos.published, "2026");
  assert.equal(wos.publishedPrecision, "year");
  assert.equal(wos.displayTitle, "Structured Illumination Microscopy With DNA And 3D SIM");

  const uncitedWos = normalizeWebOfScienceRecord({
    uid: "WOS:0002",
    title: "uncited microscopy study",
    citations: [{ db: "WOS", count: null }]
  });
  assert.equal(uncitedWos.citationCount, null);
  assert.equal(uncitedWos.citationSource, "");

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

test("citation helpers distinguish blank values from real zero counts", () => {
  const cases = [
    { input: undefined, expected: null },
    { input: null, expected: null },
    { input: "", expected: null },
    { input: "   ", expected: null },
    { input: 0, expected: 0 },
    { input: "18", expected: 18 }
  ];

  cases.forEach(({ input, expected }) => {
    const citations = input === undefined ? [] : [{ db: "WOS", count: input }];
    assert.equal(webOfScienceCitationCount({ citations }), expected);
    assert.equal(googleScholarCitationCount(input === undefined ? {} : {
      inline_links: { cited_by: { total: input } }
    }), expected);
  });
});

test("preprint and formal versions remain separate and related", () => {
  const formal = normalizeWebOfScienceRecord({
    uid: "WOS:FORMAL1",
    title: "MixedCase microscopy version study",
    source: { sourceTitle: "Nature Methods", publishYear: 2026 },
    identifiers: { doi: "10.1038/formal-version" },
    names: { authors: [{ displayName: "A. Author" }] }
  });
  const preprint = normalizeBioRxivItem({
    doi: "10.1101/preprint-version",
    title: "MixedCase microscopy version study",
    authors: "A. Author",
    date: "2025-12-01",
    category: "Bioengineering"
  });
  const duplicate = {
    ...formal,
    id: "googlescholar-formal-version",
    retrievalSource: "googlescholar",
    sourceId: "google-formal-version",
    citationCount: 9,
    citationSource: "Google Scholar"
  };

  const papers = dedupePapers([duplicate, preprint, formal]);

  assert.equal(papers.length, 2);
  const keptFormal = papers.find(paper => paper.publicationStage === "formal");
  const keptPreprint = papers.find(paper => paper.publicationStage === "preprint");
  assert.equal(keptFormal.retrievalSource, "webofscience");
  assert.equal(keptFormal.displayTitle, "MixedCase microscopy version study");
  assert.deepEqual(keptFormal.relatedVersions, [keptPreprint.id]);
  assert.deepEqual(keptPreprint.relatedVersions, [keptFormal.id]);
});

test("version links require stable identity or meaningful author overlap", () => {
  const unrelated = dedupePapers([
    {
      id: "formal-editorial",
      doi: "10.1000/formal-editorial",
      publicationStage: "formal",
      title: "Editorial",
      authors: ["Alice Smith"]
    },
    {
      id: "preprint-editorial",
      doi: "10.1101/preprint-editorial",
      publicationStage: "preprint",
      title: "Editorial",
      authors: ["Bob Jones"]
    }
  ]);
  assert.deepEqual(unrelated.map(paper => paper.relatedVersions), [[], []]);

  const sameSurname = dedupePapers([
    {
      id: "formal-same-surname",
      doi: "10.1000/formal-same-surname",
      publicationStage: "formal",
      title: "Same surname microscopy study",
      authors: ["Alice Smith"]
    },
    {
      id: "preprint-same-surname",
      doi: "10.1101/preprint-same-surname",
      publicationStage: "preprint",
      title: "Same surname microscopy study",
      authors: ["Bob Smith"]
    }
  ]);
  assert.deepEqual(sameSurname.map(paper => paper.relatedVersions), [[], []]);

  const compatibleInitial = dedupePapers([
    {
      id: "formal-compatible-initial",
      doi: "10.1000/formal-compatible-initial",
      publicationStage: "formal",
      title: "Compatible author initial study",
      authors: ["A. Smith"]
    },
    {
      id: "preprint-compatible-initial",
      doi: "10.1101/preprint-compatible-initial",
      publicationStage: "preprint",
      title: "Compatible author initial study",
      authors: ["Alice Smith"]
    }
  ]);
  assert.deepEqual(compatibleInitial[0].relatedVersions, [compatibleInitial[1].id]);
  assert.deepEqual(compatibleInitial[1].relatedVersions, [compatibleInitial[0].id]);

  const stableIdentity = dedupePapers([
    {
      id: "formal-stable",
      doi: "10.1000/shared-version",
      publicationStage: "formal",
      title: "Formal title",
      authors: []
    },
    {
      id: "preprint-stable",
      doi: "10.1000/shared-version",
      publicationStage: "preprint",
      title: "Preprint title",
      authors: []
    }
  ]);
  assert.deepEqual(stableIdentity[0].relatedVersions, [stableIdentity[1].id]);
  assert.deepEqual(stableIdentity[1].relatedVersions, [stableIdentity[0].id]);
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
    abstractSources: matchingAbstractSources(paper => paper.summary),
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
    dateConfirmed: 1,
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

test("recent Google ignores legacy manual offsets and resumes from its canonical next page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-recent-google-cursor-"));
  const starts = [];
  const options = {
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
      crossref: async () => null,
      llm: async () => ({
        abstractZh: "中文摘要",
        reason: "中文推荐理由",
        tokenUsage: { prompt: 100, completion: 50, total: 150, model: "qwen-plus", status: "已调用 AI" }
      })
    }
  };

  const first = await fetchRecentPapers(options);
  assert.deepEqual(starts, [0]);
  assert.deepEqual(first.sourcePages.googlescholar, { nextPage: 2, complete: false });
  assert.deepEqual((await readRecentFetchCursors(tempDir)).tasks[first.taskFingerprint].sourcePages.googlescholar, {
    nextPage: 2,
    complete: false
  });

  await fetchRecentPapers({ ...options, resumeMode: "resume" });
  assert.deepEqual(starts, [0, 20]);
  assert.deepEqual(await readRecentFetchCursors(tempDir), { tasks: {} });
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

test("fetch log preserves Crossref dates before and after final date confirmation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-fetchlog-confirmed-dates-"));
  const outsideTitle = "Structured illumination microscopy outside final date range";
  const insideTitle = "Structured illumination microscopy inside final date range";
  try {
    await fetchRecentPapers({
      dataDir: tempDir,
      date: "2026-07-15",
      startDate: "2026-06-15",
      endDate: "2026-07-15",
      keywords: ["structured illumination microscopy"],
      sources: ["Google Scholar"],
      fetchers: {
        googlescholar: async () => [
          { title: outsideTitle, summary: "Structured illumination microscopy.", source: "Google Scholar · Optica", sourceType: "论文搜索", published: "2026", score: 90 },
          { title: insideTitle, summary: "Structured illumination microscopy.", source: "Google Scholar · Optica", sourceType: "论文搜索", published: "2026", score: 89 }
        ],
        crossref: async paper => ({
          doi: paper.title === outsideTitle ? "10.1000/outside" : "10.1000/inside",
          title: paper.title,
          journal: "Optica",
          published: paper.title === outsideTitle ? "2026-05-20" : "2026-07-01"
        }),
        llm: async () => ({
          abstractZh: "中文摘要",
          reason: "推荐理由",
          tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test", status: "已调用 AI" }
        })
      },
      journalMetrics: { config: { enabled: false } }
    });

    const [entry] = await readFetchLog(tempDir);
    assert.equal(entry.pipelineCounts.dateMatched, 2);
    assert.equal(entry.pipelineCounts.dateConfirmed, 1);
    assert.deepEqual(entry.candidateSnapshots.afterDateEnrichment.papers.map(paper => [paper.title, paper.published]), [
      [outsideTitle, "2026-05-20"],
      [insideTitle, "2026-07-01"]
    ]);
    assert.deepEqual(entry.candidateSnapshots.finalDateMatched.papers.map(paper => [paper.title, paper.published]), [
      [insideTitle, "2026-07-01"]
    ]);
    assert.equal(entry.newFetchedCount, 1);
    assert.equal(entry.fetchedCount, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
    abstractSources: matchingAbstractSources(
      "This review explains structured illumination microscopy and its resolution improvement principles.",
      paper => {
        abstractCalls += 1;
        assert.equal(paper.title, candidate.title);
      }
    ),
    fetchers: {
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

  assert.equal(abstractCalls, 2);
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
      semanticscholar: async () => [],
      crossref: async () => null,
      llm: async ({ paper }) => ({
        abstractZh: paper.summary,
        reason: "测试。",
        tokenUsage: { status: "已调用 AI" }
      })
    },
    journalMetrics: { config: { enabled: false } }
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

test("recent refresh keeps and enriches year-only candidates whose year overlaps the range", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-strict-date-"));
  const calledIds = [];
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-06-30",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      keywords: ["structured illumination microscopy"],
      searchLogic: { activeKeywords: ["structured illumination microscopy"], andEdges: [] },
      sources: ["arXiv"],
      abstractSources: matchingAbstractSources(paper => paper.summary),
      fetchers: {
        arxiv: async () => [
          { id: "year-only", title: "Structured illumination microscopy year-only candidate", summary: "Structured illumination microscopy abstract", published: "2026", source: "arXiv", sourceType: "预印本", score: 80 },
          { id: "dated", title: "Structured illumination microscopy dated candidate", summary: "Structured illumination microscopy abstract", published: "2026-06-15", source: "arXiv", sourceType: "预印本", score: 79 }
        ],
        crossref: async () => null,
        llm: async ({ paper }) => {
          calledIds.push(paper.id);
          return {
            abstractZh: "中文摘要",
            reason: "推荐理由",
            shortTitle: "2026@",
            tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test", status: "已调用 AI" }
          };
        }
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.deepEqual(calledIds, ["year-only", "dated"]);
    assert.deepEqual(payload.papers.map(paper => paper.id), ["dated", "year-only"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

test("cached replay cannot downgrade completed archive LLM insights", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-cache-llm-status-"));
  const completed = {
    id: "completed-llm-paper",
    title: "Completed structured illumination microscopy paper",
    summary: "Source abstract.",
    abstractZh: "中文摘要。",
    reason: "推荐理由。",
    shortTitle: "2026@",
    published: "2026-06-15",
    source: "Google Scholar",
    sourceType: "论文数据库",
    tokenUsage: { prompt: 4, completion: 5, total: 9, model: "test", status: "已调用 AI" }
  };
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({ mode: "archive", count: 1, papers: [completed] }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(tempDir, "2026-06-20-recent.json"), `${JSON.stringify({
    mode: "recent",
    date: "2026-06-20",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    keywords: [],
    sources: [],
    papers: [{ ...completed, abstractZh: "", tokenUsage: { prompt: 0, completion: 0, total: 0, status: "未调用 AI" } }]
  }, null, 2)}\n`, "utf8");

  await fetchRecentPapers({
    refresh: false,
    dataDir: tempDir,
    date: "2026-06-20",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    llm: { config: { enabled: false } },
    journalMetrics: { config: { enabled: false } }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(archive.papers[0].tokenUsage.status, "已调用 AI");
  assert.equal(archive.papers[0].tokenUsage.total, 9);
  assert.equal(archive.papers[0].abstractZh, "中文摘要。");
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

test("clear unstarred archive preserves starred papers and favorite snapshots", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-clear-unstarred-"));
  const starred = { id: "starred", doi: "10.1000/starred", title: "Starred paper", score: 90 };
  const favorite = { id: "favorite", doi: "10.1000/favorite", title: "Favorite paper", score: 80 };
  const plain = { id: "plain", doi: "10.1000/plain", title: "Plain paper", score: 70 };
  const favoritesPayload = {
    mode: "favorites",
    favorites: [{ key: favorite.doi, keys: [favorite.doi], paper: favorite, addedAt: "2026-07-15T00:00:00.000Z" }]
  };
  const notesPayload = {
    mode: "paper-notes",
    notes: [{ key: starred.doi, keys: [starred.doi], paper: starred, shortTitle: "2026@STAR", read: false, starred: true, updatedAt: "2026-07-15T00:00:00.000Z" }]
  };

  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({ mode: "archive", count: 3, papers: [starred, favorite, plain] }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "favorites.json"), `${JSON.stringify(favoritesPayload, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "paper-notes.json"), `${JSON.stringify(notesPayload, null, 2)}\n`, "utf8");
    const favoritesBefore = await fs.readFile(path.join(tempDir, "favorites.json"), "utf8");
    const notesBefore = await fs.readFile(path.join(tempDir, "paper-notes.json"), "utf8");

    const result = await clearUnstarredPaperArchive({ dataDir: tempDir });
    const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
    const favorites = await readFavoritesPayload({ dataDir: tempDir });
    const operations = await readOperationLog(tempDir);

    assert.deepEqual({ before: result.beforeCount, after: result.afterCount, removed: result.removedCount, starred: result.preservedStarredCount }, {
      before: 3, after: 1, removed: 2, starred: 1
    });
    assert.deepEqual(archive.papers.map(paper => paper.id), ["starred"]);
    assert.equal(await fs.readFile(path.join(tempDir, "favorites.json"), "utf8"), favoritesBefore);
    assert.equal(await fs.readFile(path.join(tempDir, "paper-notes.json"), "utf8"), notesBefore);
    assert.deepEqual(favorites.papers.map(paper => paper.id), ["favorite"]);
    assert.equal(operations[0].operation, "archive-clear-unstarred");
    assert.equal(operations[0].action, "delete");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

test("readPaperByKey finds archive papers by flexible keys and falls back to favorites snapshot without writing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-by-key-"));
  const archivePaper = {
    id: "archive-detail-id",
    doi: "10.1000/Detail/WithSlash",
    title: "Detail Route Archive Paper",
    url: "https://example.test/papers/detail?x=1#frag",
    authors: ["Ada Lovelace", "Grace Hopper"],
    journal: "Nature Methods",
    published: "2026-07-01",
    summary: "Full abstract about structured illumination.",
    abstractZh: "关于结构光照明的完整摘要。",
    reason: "与当前研究背景相关。",
    score: 91
  };
  const favoriteOnlyPaper = {
    id: "favorite-only-id",
    doi: "10.1000/favorite-only",
    title: "Favorite Snapshot Only Paper",
    url: "https://example.test/favorite-only",
    journal: "Optics Express",
    published: "2025-12"
  };
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [archivePaper]
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(tempDir, "favorites.json"), `${JSON.stringify({
    mode: "favorites",
    count: 1,
    favorites: [
      {
        key: "10.1000/favorite-only",
        keys: ["10.1000/favorite-only", "https://example.test/favorite-only", "favorite-only-id", "favorite snapshot only paper"],
        paper: favoriteOnlyPaper,
        addedAt: "2026-07-10T10:00:00.000Z"
      }
    ]
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(tempDir, "operation-log.jsonl"), "", "utf8");
  const archiveBefore = await fs.readFile(path.join(tempDir, "archive.json"), "utf8");
  const favoritesBefore = await fs.readFile(path.join(tempDir, "favorites.json"), "utf8");

  const byDoi = await readPaperByKey("10.1000/Detail/WithSlash", { dataDir: tempDir });
  const byUrl = await readPaperByKey("https://example.test/papers/detail?x=1#frag", { dataDir: tempDir });
  const byId = await readPaperByKey("archive-detail-id", { dataDir: tempDir });
  const byTitle = await readPaperByKey("Detail Route Archive Paper", { dataDir: tempDir });
  const byFavoriteDoi = await readPaperByKey("10.1000/favorite-only", { dataDir: tempDir });
  const missing = await readPaperByKey("10.1000/does-not-exist", { dataDir: tempDir });
  const empty = await readPaperByKey("   ", { dataDir: tempDir });

  assert.equal(byDoi.ok, true);
  assert.equal(byDoi.foundIn, "archive");
  assert.equal(byDoi.paper.id, "archive-detail-id");
  assert.equal(byDoi.paper.abstractZh, "关于结构光照明的完整摘要。");
  assert.equal(byUrl.ok, true);
  assert.equal(byUrl.paper.doi, "10.1000/detail/withslash");
  assert.equal(byId.paper.title, "Detail Route Archive Paper");
  assert.equal(byTitle.foundIn, "archive");
  assert.equal(byFavoriteDoi.ok, true);
  assert.equal(byFavoriteDoi.foundIn, "favorites");
  assert.equal(byFavoriteDoi.paper.id, "favorite-only-id");
  assert.equal(missing.ok, false);
  assert.equal(missing.error, "not-found");
  assert.equal(empty.ok, false);
  assert.equal(empty.error, "not-found");

  const archiveAfter = await fs.readFile(path.join(tempDir, "archive.json"), "utf8");
  const favoritesAfter = await fs.readFile(path.join(tempDir, "favorites.json"), "utf8");
  const logAfter = await fs.readFile(path.join(tempDir, "operation-log.jsonl"), "utf8");
  assert.equal(archiveAfter, archiveBefore);
  assert.equal(favoritesAfter, favoritesBefore);
  assert.equal(logAfter.trim(), "");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("paper notes store short title, read state, starred state, and manual categories in one local json file", async () => {
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
      starred: true,
      categories: ["bio", "hardware", "bio", "unknown"]
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
  assert.deepEqual(afterSave.notes[0].categories, ["bio", "hardware"]);
  assert.deepEqual(afterSave.notes[0].categoryLabels, ["偏生物结果", "偏硬件创新"]);
  assert.equal(afterSave.notes[0].keys.includes("10.1000/note"), true);
  assert.equal(afterSave.papers[0].id, "archive-note-id");
  assert.equal(updated.notes[0].shortTitle, "");
  assert.equal(updated.notes[0].read, false);
  assert.equal(updated.notes[0].starred, true);
  assert.deepEqual(updated.notes[0].categories, ["bio", "hardware"]);
  assert.equal(rawFile.notes.length, 1);
  assert.equal(rawFile.notes[0].shortTitle, "");
  assert.deepEqual(rawFile.notes[0].categories, ["bio", "hardware"]);
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
    abstractSources: matchingAbstractSources(paper => paper.summary),
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

test("Crossref date parts preserve year month and day precision", async () => {
  const cases = [
    { parts: [2025], expected: "2025", precision: "year", byDoi: false },
    { parts: [2025, 7], expected: "2025-07", precision: "month", byDoi: true },
    { parts: [2025, 7, 12], expected: "2025-07-12", precision: "day", byDoi: false }
  ];

  for (const [index, item] of cases.entries()) {
    const title = `Structured illumination microscopy Crossref precision ${index}`;
    const doi = `10.1364/crossref-precision-${index}`;
    const crossrefItem = {
      DOI: `https://doi.org/${doi.toUpperCase()}`,
      title: [title],
      "container-title": ["Optica"],
      published: { "date-parts": [item.parts] },
      author: [{ given: "A.", family: "Author" }]
    };
    const metadata = await fetchCrossrefWorkByTitle({
      title,
      doi: item.byDoi ? doi : ""
    }, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => item.byDoi
          ? { message: crossrefItem }
          : { message: { items: [crossrefItem] } }
      })
    });
    const [paper] = await enrichPapersWithCrossref([{
      title,
      summary: "A structured illumination microscopy paper.",
      journal: "Optica",
      published: "",
      score: 90
    }], { fetcher: async () => metadata });

    assert.equal(metadata.doi, doi);
    assert.equal(paper.published, item.expected);
    assert.equal(paper.publishedPrecision, item.precision);
  }
});

test("Crossref chooses the most precise publication date", async () => {
  const metadata = await fetchCrossrefWorkByDoi("10.1364/oe.603209", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        message: {
          DOI: "10.1364/oe.603209",
          title: ["Generalized low-pass filtering in structured illumination microscopy"],
          published: { "date-parts": [[2026]] },
          "published-print": { "date-parts": [[2026, 7]] },
          "published-online": { "date-parts": [[2026, 6, 27]] },
          issued: { "date-parts": [[2026, 7]] }
        }
      })
    })
  });

  assert.equal(metadata.published, "2026-06-27");
});

test("Crossref enrichment prefers an earlier online date over a future issue date", async () => {
  const title = "Structured illumination microscopy online publication";
  const [paper] = await enrichPapersWithCrossref([{
    title,
    retrievalSource: "webofscience",
    doi: "10.1000/online-date",
    published: "2026-11"
  }], {
    fetcher: async () => ({
      doi: "10.1000/online-date",
      title,
      published: "2026-06"
    })
  });

  assert.equal(paper.published, "2026-06");
});

test("Crossref enriches an existing DOI when its publication date is incomplete", async () => {
  let calls = 0;
  const title = "Structured illumination microscopy with an existing DOI";
  const [paper] = await enrichPapersWithCrossref([{
    title,
    retrievalSource: "webofscience",
    doi: "10.1364/oe.603209",
    journal: "Optics Express",
    published: "2026"
  }], {
    fetcher: async () => {
      calls += 1;
      return {
        doi: "10.1364/oe.603209",
        title,
        journal: "Optics Express",
        published: "2026-06-27"
      };
    }
  });

  assert.equal(calls, 1);
  assert.equal(paper.published, "2026-06-27");
  assert.equal(paper.publishedPrecision, "day");
});

test("publisher DOI metadata fills a day-level date when Crossref remains imprecise", async () => {
  const [paper] = await enrichPapersWithPublisherDates([{
    title: "Structured illumination microscopy publisher date",
    retrievalSource: "webofscience",
    doi: "10.1364/oe.603209",
    journal: "Optics Express",
    published: "2026"
  }], {
    fetchImpl: async url => {
      assert.equal(String(url), "https://doi.org/10.1364/oe.603209");
      return {
        ok: true,
        text: async () => '<meta name="citation_publication_date" content="2026-06-27">'
      };
    }
  });

  assert.equal(paper.published, "2026-06-27");
  assert.equal(paper.publishedPrecision, "day");
});

test("publisher DOI metadata does not invent January first from a year-only date", async () => {
  const [paper] = await enrichPapersWithPublisherDates([{
    title: "Structured illumination microscopy publisher year",
    retrievalSource: "webofscience",
    doi: "10.1364/oe.603209",
    published: "2026"
  }], {
    fetchImpl: async () => ({
      ok: true,
      text: async () => '<meta name="citation_publication_date" content="2026">'
    })
  });

  assert.equal(paper.published, "2026");
  assert.equal(paper.publishedPrecision, "year");
});

test("date range keeps month-level metadata when the month overlaps the requested window", () => {
  const papers = filterPapersByDateRange([
    { title: "overlapping month", published: "2026-06" },
    { title: "older month", published: "2026-05" }
  ], "2026-06-15", "2026-07-15");

  assert.deepEqual(papers.map(paper => paper.title), ["overlapping month"]);
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
  let firecrawlUsageCalls = 0;
  const files = {
    llmConfigFile: path.join(tempDir, "llm.json"),
    googleScholarConfigFile: path.join(tempDir, "google-scholar.json"),
    journalMetricsConfigFile: path.join(tempDir, "journal-metrics.json"),
    academicApisConfigFile: path.join(tempDir, "academic-apis.json"),
    firecrawlConfigFile: path.join(tempDir, "firecrawl.json"),
    firecrawlFetchImpl: async (url, options) => {
      firecrawlUsageCalls += 1;
      assert.equal(String(url), "https://api.firecrawl.dev/v2/team/credit-usage");
      assert.equal(options.headers.Authorization, "Bearer firecrawl-secret");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            remainingCredits: 873,
            planCredits: 1000,
            billingPeriodStart: "2026-07-01T00:00:00Z",
            billingPeriodEnd: "2026-07-31T23:59:59Z"
          }
        })
      };
    }
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
    },
    firecrawl: {
      enabled: true,
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      apiKey: "firecrawl-secret"
    },
    academicApis: { contactEmail: "researcher@example.org" }
  }, files);
  const rawLlm = JSON.parse(await fs.readFile(files.llmConfigFile, "utf8"));
  const rawGoogle = JSON.parse(await fs.readFile(files.googleScholarConfigFile, "utf8"));
  const rawEasy = JSON.parse(await fs.readFile(files.journalMetricsConfigFile, "utf8"));
  const rawFirecrawl = JSON.parse(await fs.readFile(files.firecrawlConfigFile, "utf8"));
  const rawAcademicApis = JSON.parse(await fs.readFile(files.academicApisConfigFile, "utf8"));

  assert.equal(rawLlm.apiKey, "llm-secret");
  assert.equal(rawLlm.userBackground, "用户背景：PRIM 伪随机结构光照明显微镜算法\n关注问题：频谱分离、像差鲁棒性");
  assert.equal(rawGoogle.apiKey, "serp-secret");
  assert.equal(rawGoogle.maxPages, 4);
  assert.equal(rawGoogle.num, 20);
  assert.equal(rawGoogle.rollingFetch, true);
  assert.equal(rawEasy.apiKey, "easy-secret");
  assert.equal(rawFirecrawl.apiKey, "firecrawl-secret");
  assert.equal(rawAcademicApis.contactEmail, "researcher@example.org");
  assert.equal(saved.llm.apiKey, "");
  assert.equal(saved.llm.hasApiKey, true);
  assert.equal(saved.googleScholar.apiKey, "");
  assert.equal(saved.googleScholar.hasApiKey, true);
  assert.equal(saved.googleScholar.maxPages, 4);
  assert.equal(saved.googleScholar.num, 20);
  assert.equal(saved.googleScholar.rollingFetch, true);
  assert.equal(saved.journalMetrics.apiKey, "");
  assert.equal(saved.journalMetrics.hasApiKey, true);
  assert.equal(saved.firecrawl.apiKey, "");
  assert.equal(saved.firecrawl.hasApiKey, true);
  assert.equal(saved.firecrawl.usage.remainingCredits, 873);
  assert.equal(saved.firecrawl.usage.planCredits, 1000);
  assert.equal(saved.academicApis.contactEmail, "researcher@example.org");

  const readBack = await readIntegrationConfigs(files);
  assert.equal(readBack.llm.endpoint, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(readBack.llm.userBackground, "用户背景：PRIM 伪随机结构光照明显微镜算法\n关注问题：频谱分离、像差鲁棒性");
  assert.equal(readBack.llm.apiKey, "");
  assert.equal(readBack.llm.hasApiKey, true);
  assert.equal(readBack.firecrawl.usage.status, "ok");
  assert.deepEqual(await readAcademicApisConfig(files.academicApisConfigFile), {
    contactEmail: "researcher@example.org"
  });
  assert.equal(firecrawlUsageCalls, 2);
  const secrets = await readIntegrationSecrets(files);
  assert.equal(secrets.llm.apiKey, "llm-secret");
  assert.equal(secrets.googleScholar.apiKey, "serp-secret");
  assert.equal(secrets.journalMetrics.apiKey, "easy-secret");
  assert.equal(secrets.firecrawl.apiKey, "firecrawl-secret");

  await writeIntegrationConfigs({ firecrawl: { enabled: true, endpoint: "https://firecrawl.test/v2/scrape", apiKey: "" } }, files);
  assert.equal((await readFirecrawlConfig(files.firecrawlConfigFile)).apiKey, "firecrawl-secret");
  await assert.rejects(
    writeIntegrationConfigs({ academicApis: { contactEmail: "not-an-email" } }, files),
    /学术 API 联系邮箱格式不正确/
  );
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("Firecrawl credit usage is skipped without a key and degrades on API failure", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-firecrawl-usage-"));
  const firecrawlConfigFile = path.join(tempDir, "firecrawl.json");
  let calls = 0;
  const firecrawlFetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 429 };
  };

  let integrations = await readIntegrationConfigs({ firecrawlConfigFile, firecrawlFetchImpl });
  assert.equal(calls, 0);
  assert.equal(integrations.firecrawl.usage.status, "unconfigured");

  await fs.writeFile(firecrawlConfigFile, JSON.stringify({ enabled: true, apiKey: "fc-test" }), "utf8");
  integrations = await readIntegrationConfigs({ firecrawlConfigFile, firecrawlFetchImpl });
  assert.equal(calls, 1);
  assert.equal(integrations.firecrawl.usage.status, "error");
  assert.equal(integrations.firecrawl.apiKey, "");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("Firecrawl test validates a submitted key without scraping a page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-firecrawl-test-"));
  const configFile = path.join(tempDir, "firecrawl.json");
  const requests = [];
  const result = await testFirecrawlConfig({
    firecrawl: { enabled: true, endpoint: "https://api.firecrawl.dev/v2/scrape", apiKey: "fc-valid" }
  }, {
    configFile,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { remainingCredits: 990, planCredits: 1000 } })
      };
    }
  });

  assert.equal(requests[0].url, "https://api.firecrawl.dev/v2/team/credit-usage");
  assert.equal(requests[0].options.headers.Authorization, "Bearer fc-valid");
  assert.equal(result.usage.remainingCredits, 990);
  assert.equal(requests.some(request => request.url.endsWith("/scrape")), false);

  await assert.rejects(() => testFirecrawlConfig({ firecrawl: { apiKey: "fc-rejected" } }, {
    configFile,
    fetchImpl: async () => ({ ok: false, status: 401 })
  }), /API Key.*401/);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("Firecrawl config discards a saved secret mask instead of treating it as a key", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-firecrawl-mask-"));
  const configFile = path.join(tempDir, "firecrawl.json");
  await fs.writeFile(configFile, JSON.stringify({ enabled: true, apiKey: "********" }), "utf8");

  assert.equal((await readFirecrawlConfig(configFile)).apiKey, "");
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

test("llm config includes a cleaned aliyun model pool with safe defaults", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-config-"));
  const llmConfigFile = path.join(tempDir, "llm.json");
  await fs.writeFile(llmConfigFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "qwen-plus",
      modelPool: {
        quotaSwitchRatio: 0.99,
        failureSwitchThreshold: 0,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 2 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: -1, priority: 1 },
          { model: "", enabled: true, freeQuotaTokens: 1000000 }
        ]
      }
    }]
  }), "utf8");

  const config = await readLlmConfig(llmConfigFile);
  const pool = config.providers.find(provider => provider.id === "aliyun-coding").modelPool;
  assert.equal(pool.quotaMode, "official-first");
  assert.equal(pool.quotaFallback, "local");
  assert.equal(pool.quotaSwitchRatio, 0.85);
  assert.equal(pool.failureSwitchThreshold, 3);
  assert.equal(pool.models.some(item => item.model === "qwen-flash"), true);
  assert.equal(pool.models.find(item => item.model === "qwen-flash").freeQuotaTokens, 1000000);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("updates one aliyun pool model enabled flag and quota without touching secrets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-update-model-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }] }
    }]
  }), "utf8");

  const result = await updateLlmModelPoolModel("qwen-flash", { enabled: true, freeQuotaTokens: 123456 }, { llmConfigFile: configFile, dataDir: tempDir });
  const saved = await readLlmConfig(configFile);
  const provider = saved.providers.find(item => item.id === "aliyun-coding");
  const row = provider.modelPool.models.find(item => item.model === "qwen-flash");
  assert.equal(result.ok, true);
  assert.equal(row.enabled, true);
  assert.equal(row.freeQuotaTokens, 123456);
  assert.equal(provider.apiKey, "secret-key");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("per-model aliyun test calls only the requested model and enables it on success", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-test-model-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }] }
    }]
  }), "utf8");
  const calls = [];
  const result = await testLlmPoolModel("qwen-flash", {
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "测试摘要", reason: "测试理由" }) } }],
          usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
        })
      };
    }
  });
  const saved = await readLlmConfig(configFile);
  const row = saved.providers[0].modelPool.models.find(item => item.model === "qwen-flash");
  const state = await readLlmModelPoolState(tempDir);
  assert.deepEqual(calls, ["qwen-flash"]);
  assert.equal(result.ok, true);
  assert.equal(row.enabled, true);
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].lastTestStatus, "passed");
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].consecutiveFailures, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("concurrent per-model aliyun tests preserve both runtime state and enabled config rows", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-concurrent-tests-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: {
        models: [
          { model: "qwen-plus", enabled: false, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }
        ]
      }
    }]
  }), "utf8");
  let started = 0;
  let markBothStarted;
  let releaseRequests;
  const bothStarted = new Promise(resolve => { markBothStarted = resolve; });
  const requestsReleased = new Promise(resolve => { releaseRequests = resolve; });
  const fetchImpl = async () => {
    started += 1;
    if (started === 2) markBothStarted();
    await requestsReleased;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ abstractZh: "测试摘要", reason: "测试理由" }) } }],
        usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
      })
    };
  };

  const pending = ["qwen-plus", "qwen-flash"].map(model => testLlmPoolModel(model, {
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl
  }));
  await bothStarted;
  releaseRequests();
  const results = await Promise.all(pending);
  const state = await readLlmModelPoolState(tempDir);
  const saved = await readLlmConfig(configFile);
  const rows = saved.providers[0].modelPool.models;

  assert.deepEqual(results.map(result => result.ok), [true, true]);
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-plus")].localUsedTokens, 12);
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].localUsedTokens, 12);
  assert.equal(rows.find(row => row.model === "qwen-plus").enabled, true);
  assert.equal(rows.find(row => row.model === "qwen-flash").enabled, true);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("per-model aliyun test does not restore state reset while HTTP is in flight", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-test-reset-race-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }] }
    }]
  }), "utf8");
  await writeLlmModelPoolState({
    activeModel: "qwen-plus",
    models: { "qwen-plus": { model: "qwen-plus", localUsedTokens: 42, status: "available" } }
  }, tempDir);
  let markStarted;
  let releaseRequest;
  const requestStarted = new Promise(resolve => { markStarted = resolve; });
  const requestReleased = new Promise(resolve => { releaseRequest = resolve; });
  const pendingTest = testLlmPoolModel("qwen-flash", {
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl: async () => {
      markStarted();
      await requestReleased;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "测试摘要", reason: "测试理由" }) } }],
          usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
        })
      };
    }
  });

  await requestStarted;
  await resetLlmModelPoolState("qwen-plus", { dataDir: tempDir, llmConfigFile: configFile });
  releaseRequest();
  await pendingTest;
  const state = await readLlmModelPoolState(tempDir);

  assert.equal(state.models["qwen-plus"], undefined);
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].localUsedTokens, 12);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("per-model aliyun test merges state imported while HTTP is in flight", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-test-import-race-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }] }
    }]
  }), "utf8");
  let markStarted;
  let releaseRequest;
  const requestStarted = new Promise(resolve => { markStarted = resolve; });
  const requestReleased = new Promise(resolve => { releaseRequest = resolve; });
  const pendingTest = testLlmPoolModel("qwen-flash", {
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl: async () => {
      markStarted();
      await requestReleased;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "测试摘要", reason: "测试理由" }) } }],
          usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
        })
      };
    }
  });

  await requestStarted;
  await importLocalData({
    papers: {
      llmModelPoolState: {
        activeModel: "qwen-plus",
        models: { "qwen-plus": { model: "qwen-plus", localUsedTokens: 42, status: "available" } }
      }
    }
  }, { dataDir: tempDir });
  releaseRequest();
  await pendingTest;
  const state = await readLlmModelPoolState(tempDir);

  assert.equal(state.models["qwen-plus"].localUsedTokens, 42);
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].localUsedTokens, 12);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("per-model aliyun test records retryable failure without enabling the model", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-test-failure-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }] }
    }]
  }), "utf8");
  const result = await testLlmPoolModel("qwen-flash", {
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) })
  });
  const saved = await readLlmConfig(configFile);
  const row = saved.providers[0].modelPool.models.find(item => item.model === "qwen-flash");
  const state = await readLlmModelPoolState(tempDir);
  assert.equal(result.ok, false);
  assert.equal(row.enabled, false);
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].lastTestStatus, "failed");
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].consecutiveFailures, 1);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("inactive aliyun provider model pool update and test preserve the selected provider", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-inactive-provider-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "custom-active",
    providers: [
      {
        id: "custom-active",
        provider: "custom-openai",
        enabled: true,
        endpoint: "https://example.test/v1",
        apiKey: "custom-key",
        model: "custom-model"
      },
      {
        id: "aliyun-inactive",
        provider: "aliyun-modelstudio",
        enabled: false,
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "aliyun-key",
        model: "qwen-plus",
        modelPool: { models: [{ model: "qwen-flash", enabled: false, freeQuotaTokens: 1000000, priority: 20 }] }
      }
    ]
  }), "utf8");

  const updated = await updateLlmModelPoolModel("qwen-flash", { enabled: true }, {
    providerId: "aliyun-inactive",
    llmConfigFile: configFile,
    dataDir: tempDir
  });
  const tested = await testLlmPoolModel("qwen-flash", {
    providerId: "aliyun-inactive",
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ abstractZh: "测试摘要", reason: "测试理由" }) } }],
        usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
      })
    })
  });
  const saved = await readLlmConfig(configFile);
  const customProvider = saved.providers.find(provider => provider.id === "custom-active");
  const aliyunProvider = saved.providers.find(provider => provider.id === "aliyun-inactive");

  assert.equal(updated.status.providerId, "aliyun-inactive");
  assert.equal(tested.status.providerId, "aliyun-inactive");
  assert.equal(saved.activeProviderId, "custom-active");
  assert.equal(customProvider.model, "custom-model");
  assert.equal(aliyunProvider.modelPool.models.find(row => row.model === "qwen-flash").enabled, true);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun providers with the same model keep model pool state isolated", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-provider-scoped-"));
  const configFile = path.join(tempDir, "llm.json");
  await fs.writeFile(configFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-a",
    providers: [
      {
        id: "aliyun-a",
        provider: "aliyun-modelstudio",
        enabled: true,
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "aliyun-a-key",
        model: "qwen-plus",
        modelPool: { models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }] }
      },
      {
        id: "aliyun-b",
        provider: "aliyun-modelstudio",
        enabled: true,
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "aliyun-b-key",
        model: "qwen-plus",
        modelPool: { models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }] }
      }
    ]
  }), "utf8");

  await testLlmPoolModel("qwen-plus", {
    providerId: "aliyun-a",
    llmConfigFile: configFile,
    dataDir: tempDir,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ abstractZh: "测试摘要", reason: "测试理由" }) } }],
        usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
      })
    })
  });
  const updated = await updateLlmModelPoolModel("qwen-plus", { freeQuotaTokens: 123456 }, {
    providerId: "aliyun-a",
    llmConfigFile: configFile,
    dataDir: tempDir
  });
  const state = await readLlmModelPoolState(tempDir);
  const saved = await readLlmConfig(configFile);
  const statusA = await readLlmModelPoolStatus({ dataDir: tempDir, llmConfigFile: configFile, providerId: "aliyun-a" });
  const statusB = await readLlmModelPoolStatus({ dataDir: tempDir, llmConfigFile: configFile, providerId: "aliyun-b" });
  const providerA = saved.providers.find(provider => provider.id === "aliyun-a");
  const providerB = saved.providers.find(provider => provider.id === "aliyun-b");

  assert.equal(updated.status.providerId, "aliyun-a");
  assert.equal(state.models[llmPoolStateKey("aliyun-a", "qwen-plus")].localUsedTokens, 12);
  assert.equal(state.models[llmPoolStateKey("aliyun-b", "qwen-plus")], undefined);
  assert.equal(statusA.models.find(row => row.model === "qwen-plus").localUsedTokens, 12);
  assert.equal(statusB.models.find(row => row.model === "qwen-plus").localUsedTokens, 0);
  assert.equal(providerA.modelPool.models.find(row => row.model === "qwen-plus").freeQuotaTokens, 123456);
  assert.equal(providerB.modelPool.models.find(row => row.model === "qwen-plus").freeQuotaTokens, 1000000);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("updates reject non-registry aliyun models without writing config or pool state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-update-non-registry-"));
  const configFile = path.join(tempDir, "llm.json");
  const configText = JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }] }
    }]
  });
  await fs.writeFile(configFile, configText, "utf8");

  await assert.rejects(
    updateLlmModelPoolModel("qwen-embedding-v3", { enabled: true }, { llmConfigFile: configFile, dataDir: tempDir }),
    /不在阿里百炼文本模型注册表中/
  );
  assert.equal(await fs.readFile(configFile, "utf8"), configText);
  await assert.rejects(fs.access(path.join(tempDir, "llm-model-pool-state.json")), { code: "ENOENT" });
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("per-model aliyun tests reject non-registry models without HTTP or pool state writes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-test-non-registry-"));
  const configFile = path.join(tempDir, "llm.json");
  const configText = JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret-key",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }] }
    }]
  });
  await fs.writeFile(configFile, configText, "utf8");
  let httpCalls = 0;

  await assert.rejects(
    testLlmPoolModel("qwen-embedding-v3", {
      llmConfigFile: configFile,
      dataDir: tempDir,
      fetchImpl: async () => { httpCalls += 1; }
    }),
    /不在阿里百炼文本模型注册表中/
  );
  assert.equal(httpCalls, 0);
  assert.equal(await fs.readFile(configFile, "utf8"), configText);
  await assert.rejects(fs.access(path.join(tempDir, "llm-model-pool-state.json")), { code: "ENOENT" });
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool filters non-registry models from automatic calls", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-registry-filter-"));
  await writeLlmModelPoolState({
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" }
    }
  }, tempDir);
  const calls = [];
  const insight = await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config: {
      enabled: true,
      provider: "aliyun-modelstudio",
      apiMode: "openai",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test",
      model: "qwen-plus",
      modelPool: {
        models: [
          { model: "qwen-embedding-v3", enabled: true, freeQuotaTokens: 1000000, priority: 1 },
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }
        ]
      }
    },
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    }
  });
  assert.deepEqual(calls, ["qwen-flash"]);
  assert.equal(insight.tokenUsage.model, "qwen-flash");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool status caps a raw 0.99 threshold at the binding 85 percent limit", () => {
  const pool = {
    quotaSwitchRatio: 0.99,
    models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }]
  };
  const selected = selectLlmPoolModel({
    pool,
    state: {
      models: {
        "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000 }
      }
    }
  });
  assert.equal(modelPoolStatusForModel(
    pool.models.find(item => item.model === "qwen-plus"),
    { localUsedTokens: 850000 },
    pool
  ), "near_limit");
  assert.notEqual(selected?.model, "qwen-plus");
});

test("aliyun text model registry exposes only chat-compatible text models", () => {
  const models = readAliyunTextModelRegistry();
  assert.ok(models.length >= 25);
  assert.ok(models.some(item => item.model === "qwen-plus"));
  assert.ok(models.some(item => item.model === "qwen-flash"));
  assert.equal(models.some(item => /embedding|embed|rerank|ocr|audio|image|video/i.test(item.model)), false);
  assert.equal(models.every(item => item.source === "aliyun-modelstudio-text-generation"), true);
});

test("llm model pool status greys out near-limit exhausted failing and disabled models", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-derived-status-"));
  const llmConfigFile = path.join(tempDir, "llm.json");
  await fs.writeFile(llmConfigFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "qwen-plus",
      modelPool: {
        quotaSwitchRatio: 0.85,
        failureSwitchThreshold: 3,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 },
          { model: "qwen-turbo", enabled: false, freeQuotaTokens: 1000000, priority: 30 },
          { model: "qwen-long", enabled: true, freeQuotaTokens: 1000000, priority: 40 }
        ]
      }
    }]
  }), "utf8");
  await writeLlmModelPoolState({
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" },
      "qwen-flash": { model: "qwen-flash", localUsedTokens: 1000, status: "failing", lastSwitchReason: "repeated-failure" },
      "qwen-long": { model: "qwen-long", localUsedTokens: 1000000, status: "exhausted" }
    }
  }, tempDir);

  const status = await readLlmModelPoolStatus({ dataDir: tempDir, llmConfigFile });
  const byModel = new Map(status.models.map(item => [item.model, item]));
  assert.equal(byModel.get("qwen-plus").greyed, true);
  assert.equal(byModel.get("qwen-plus").selectable, false);
  assert.equal(byModel.get("qwen-plus").status, "near_limit");
  assert.equal(byModel.get("qwen-flash").greyed, true);
  assert.equal(byModel.get("qwen-flash").failureHint, "上次因连续失败切换");
  assert.equal(byModel.get("qwen-turbo").status, "disabled");
  assert.equal(byModel.get("qwen-long").status, "exhausted");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("llm model pool status keeps default enabled models enabled with a partial saved pool", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-partial-registry-"));
  const llmConfigFile = path.join(tempDir, "llm.json");
  await fs.writeFile(llmConfigFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      model: "qwen-plus",
      modelPool: {
        models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }]
      }
    }]
  }), "utf8");

  const status = await readLlmModelPoolStatus({ dataDir: tempDir, llmConfigFile });
  const byModel = new Map(status.models.map(item => [item.model, item]));
  assert.equal(byModel.get("qwen3-coder-plus").enabled, true);
  assert.equal(byModel.get("qwen3-coder-plus").status, "available");
  assert.equal(byModel.get("qwen-max").enabled, false);
  assert.equal(byModel.get("qwen-max").status, "disabled");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool rotates a partial saved pool to another enabled default", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-partial-rotation-"));
  await writeLlmModelPoolState({
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" }
    }
  }, tempDir);
  const calls = [];
  const insight = await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config: {
      enabled: true,
      provider: "aliyun-modelstudio",
      apiMode: "openai",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test",
      model: "qwen-plus",
      modelPool: { models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }] }
    },
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    }
  });
  assert.deepEqual(calls, ["qwen-flash"]);
  assert.equal(insight.tokenUsage.model, "qwen-flash");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool selection skips greyed failing disabled and near-limit models", () => {
  const pool = cleanLlmModelPool({
    quotaSwitchRatio: 0.85,
    models: [
      { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
      { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 },
      { model: "qwen-turbo", enabled: false, freeQuotaTokens: 1000000, priority: 30 },
      { model: "qwen-long", enabled: true, freeQuotaTokens: 1000000, priority: 40 }
    ]
  });
  const selected = selectLlmPoolModel({
    pool,
    state: {
      models: {
        "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" },
        "qwen-flash": { model: "qwen-flash", localUsedTokens: 1000, status: "failing" }
      }
    }
  });
  assert.equal(selected.model, "qwen-long");
  assert.equal(selected.reason, "available");
});

test("llm model pool state defaults to empty model records", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-state-"));
  const state = await readLlmModelPoolState(tempDir);
  assert.deepEqual(state.models, {});
  assert.equal(state.format, "paperhot-llm-model-pool-state");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("selects the first aliyun pool model below the quota threshold", () => {
  const pool = cleanLlmModelPool({
    quotaSwitchRatio: 0.85,
    models: [
      { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
      { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
    ]
  });
  const selected = selectLlmPoolModel({
    pool,
    state: {
      models: {
        "qwen-plus": { model: "qwen-plus", status: "near_limit", localUsedTokens: 850000 },
        "qwen-flash": { model: "qwen-flash", status: "available", localUsedTokens: 1000 }
      }
    }
  });
  assert.equal(selected.model, "qwen-flash");
  assert.equal(selected.reason, "available");
});

test("keeps a shared credential failure from rotating through the pool", () => {
  assert.equal(isRetryableLlmModelFailure(new Error("LLM 摘要失败：HTTP 429")), true);
  assert.equal(isRetryableLlmModelFailure(new Error("LLM 摘要失败：HTTP 500")), true);
  assert.equal(isRetryableLlmModelFailure(new Error("LLM 摘要失败：HTTP 401")), false);
  assert.equal(isRetryableLlmModelFailure(new Error("LLM API 密钥未填写")), false);
});

test("repeated shared credential failures do not poison or rotate the aliyun model pool", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-credential-failure-"));
  const calls = [];
  const config = {
    enabled: true,
    provider: "aliyun-modelstudio",
    apiMode: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "bad-key",
    model: "qwen-plus",
    modelPool: {
      failureSwitchThreshold: 2,
      models: [
        { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
        { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
      ]
    }
  };

  for (const status of [401, 403, 401, 403]) {
    await assert.rejects(callConfiguredLlmWithPool({
      dataDir: tempDir,
      paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
      userBackground: "SIM",
      config,
      fetchImpl: async (url, init) => {
        calls.push(JSON.parse(init.body).model);
        return { ok: false, status, json: async () => ({}) };
      }
    }), new RegExp(`HTTP ${status}`));
  }

  const state = await readLlmModelPoolState(tempDir);
  assert.deepEqual(calls, ["qwen-plus", "qwen-plus", "qwen-plus", "qwen-plus"]);
  assert.equal(state.models["qwen-plus"]?.consecutiveFailures || 0, 0);
  assert.notEqual(state.models["qwen-plus"]?.status, "failing");
  assert.equal(state.models["qwen-flash"], undefined);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool rejects when every configured model is unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-no-selectable-"));
  await writeLlmModelPoolState({
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" },
      "qwen-flash": { model: "qwen-flash", localUsedTokens: 1000000, status: "exhausted" }
    }
  }, tempDir);
  let calls = 0;
  await assert.rejects(callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config: {
      enabled: true,
      provider: "aliyun-modelstudio",
      apiMode: "openai",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test",
      model: "qwen-plus",
      modelPool: {
        quotaSwitchRatio: 0.85,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 },
          { model: "qwen-turbo", enabled: false, freeQuotaTokens: 1000000, priority: 30 },
          { model: "qwen-long", enabled: false, freeQuotaTokens: 1000000, priority: 40 },
          { model: "qwen3.5-flash", enabled: false, freeQuotaTokens: 1000000, priority: 120 },
          { model: "qwen3.7-plus", enabled: false, freeQuotaTokens: 1000000, priority: 130 },
          { model: "qwen3-coder-plus", enabled: false, freeQuotaTokens: 1000000, priority: 90 }
        ]
      }
    },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("request should not be sent");
    }
  }), /模型池中没有可用模型/);
  assert.equal(calls, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool switches after local quota threshold and logs the actual model", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-switch-"));
  await writeLlmModelPoolState({
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" },
      "qwen-flash": { model: "qwen-flash", localUsedTokens: 0, status: "available" }
    }
  }, tempDir);
  const calls = [];
  const insight = await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config: {
      enabled: true,
      provider: "aliyun-modelstudio",
      apiMode: "openai",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test",
      model: "qwen-plus",
      modelPool: {
        quotaSwitchRatio: 0.85,
        failureSwitchThreshold: 3,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
        ]
      }
    },
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    }
  });
  assert.deepEqual(calls, ["qwen-flash"]);
  assert.equal(insight.tokenUsage.model, "qwen-flash");
  const operations = await readOperationLog(tempDir);
  assert.equal(operations[0].operation, "llm-model-switch");
  assert.equal(operations[0].reason, "quota-threshold");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool uses the active provider pool from readLlmConfig output", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-read-config-"));
  const llmConfigFile = path.join(tempDir, "llm.json");
  await fs.writeFile(llmConfigFile, JSON.stringify({
    enabled: true,
    activeProviderId: "aliyun-coding",
    providers: [{
      id: "aliyun-coding",
      provider: "aliyun-modelstudio",
      enabled: true,
      apiMode: "openai",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test",
      model: "qwen-plus",
      modelPool: {
        quotaSwitchRatio: 0.85,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
        ]
      }
    }]
  }), "utf8");
  await writeLlmModelPoolState({
    activeModel: "qwen-plus",
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" }
    }
  }, tempDir);
  const config = await readLlmConfig(llmConfigFile);
  const calls = [];

  const insight = await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config,
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    }
  });

  const state = await readLlmModelPoolState(tempDir);
  assert.deepEqual(calls, ["qwen-flash"]);
  assert.equal(insight.tokenUsage.model, "qwen-flash");
  assert.equal(state.activeModels["aliyun-coding"], "qwen-flash");
  assert.equal(state.models[llmPoolStateKey("aliyun-coding", "qwen-flash")].localUsedTokens, 15);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool preserves token and failure increments across concurrent requests", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-concurrent-state-"));
  const config = {
    enabled: true,
    provider: "aliyun-modelstudio",
    apiMode: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "test",
    model: "qwen-plus",
    modelPool: {
      failureSwitchThreshold: 5,
      models: [{ model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 }]
    }
  };
  const paper = { title: "SIM paper", summary: "Complete abstract text for testing." };
  const successFetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    };
  };

  const successes = await Promise.all([
    callConfiguredLlmWithPool({ dataDir: tempDir, paper, userBackground: "SIM", config, fetchImpl: successFetch }),
    callConfiguredLlmWithPool({ dataDir: tempDir, paper, userBackground: "SIM", config, fetchImpl: successFetch })
  ]);
  assert.equal(successes.length, 2);
  let state = await readLlmModelPoolState(tempDir);
  assert.equal(state.models["qwen-plus"].localUsedTokens, 30);

  const failureFetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const failures = await Promise.allSettled([
    callConfiguredLlmWithPool({ dataDir: tempDir, paper, userBackground: "SIM", config, fetchImpl: failureFetch }),
    callConfiguredLlmWithPool({ dataDir: tempDir, paper, userBackground: "SIM", config, fetchImpl: failureFetch })
  ]);
  assert.deepEqual(failures.map(result => result.status), ["rejected", "rejected"]);
  state = await readLlmModelPoolState(tempDir);
  assert.equal(state.models["qwen-plus"].localUsedTokens, 30);
  assert.equal(state.models["qwen-plus"].consecutiveFailures, 2);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool logs a persisted model switch only once across requests", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-persisted-switch-"));
  await writeLlmModelPoolState({
    activeModel: "qwen-plus",
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850000, status: "near_limit" },
      "qwen-flash": { model: "qwen-flash", localUsedTokens: 0, status: "available" }
    }
  }, tempDir);
  const config = {
    enabled: true,
    provider: "aliyun-modelstudio",
    apiMode: "openai",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "test",
    model: "qwen-plus",
    modelPool: {
      quotaSwitchRatio: 0.85,
      models: [
        { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
        { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
      ]
    }
  };
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })
  });

  await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "First paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config,
    fetchImpl
  });
  await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "Second paper", summary: "Another complete abstract text for testing." },
    userBackground: "SIM",
    config,
    fetchImpl
  });

  const operations = (await readOperationLog(tempDir)).filter(entry => entry.operation === "llm-model-switch");
  assert.equal(operations.length, 1);
  assert.equal(operations[0].fromModel, "qwen-plus");
  assert.equal(operations[0].toModel, "qwen-flash");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("aliyun llm pool retries the same paper on the next model after repeated retryable failures", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-failure-switch-"));
  const llmConfigFile = path.join(tempDir, "llm.json");
  const calls = [];
  const config = {
      enabled: true,
      provider: "aliyun-modelstudio",
      apiMode: "openai",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test",
      model: "qwen-plus",
      modelPool: {
        quotaSwitchRatio: 0.85,
        failureSwitchThreshold: 1,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
        ]
      }
    };
  await fs.writeFile(llmConfigFile, JSON.stringify({
    ...config,
    activeProviderId: "aliyun-coding",
    providers: [{ id: "aliyun-coding", ...config }]
  }), "utf8");
  const insight = await callConfiguredLlmWithPool({
    dataDir: tempDir,
    paper: { title: "SIM paper", summary: "Complete abstract text for testing." },
    userBackground: "SIM",
    config,
    fetchImpl: async (url, init) => {
      const model = JSON.parse(init.body).model;
      calls.push(model);
      if (model === "qwen-plus") return { ok: false, status: 429, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ abstractZh: "中文摘要", reason: "推荐理由" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      };
    }
  });
  assert.deepEqual(calls, ["qwen-plus", "qwen-flash"]);
  assert.equal(insight.tokenUsage.model, "qwen-flash");
  const state = await readLlmModelPoolState(tempDir);
  assert.equal(state.models["qwen-plus"].status, "failing");
  assert.equal(state.models["qwen-plus"].lastSwitchReason, "repeated-failure");
  assert.match(state.models["qwen-plus"].lastSwitchAt, /^\d{4}-\d{2}-\d{2}T/);
  const status = await readLlmModelPoolStatus({ dataDir: tempDir, llmConfigFile, providerId: "aliyun-coding" });
  assert.equal(status.models.find(row => row.model === "qwen-plus").failureHint, "上次因连续失败切换");
  const operations = (await readOperationLog(tempDir)).filter(entry => entry.operation === "llm-model-switch");
  assert.equal(operations.length, 1);
  assert.equal(operations[0].reason, "repeated-failure");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("token stats include aliyun llm model pool state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-stats-"));
  await writeLlmModelPoolState({
    activeModel: "qwen-plus",
    models: {
      "qwen-plus": { model: "qwen-plus", localUsedTokens: 850001, status: "near_limit" },
      "qwen-flash": { model: "qwen-flash", localUsedTokens: 12, status: "available" }
    }
  }, tempDir);
  const stats = await buildTokenStats({ dataDir: tempDir });
  assert.equal(stats.llmModelPool.activeModel, "qwen-plus");
  assert.equal(stats.llmModelPool.models.find(item => item.model === "qwen-plus").status, "near_limit");
  assert.equal(stats.llmModelPool.models.find(item => item.model === "qwen-plus").estimatedRemainingTokens, 149999);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("local data export includes llm model pool state only with stats", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-export-"));
  await writeLlmModelPoolState({ models: { "qwen-plus": { model: "qwen-plus", localUsedTokens: 42 } } }, tempDir);
  const plain = await exportLocalData({ dataDir: tempDir, includePapers: false });
  assert.equal(plain.data.papers.llmModelPoolState, undefined);
  const withStats = await exportLocalData({ dataDir: tempDir, includePapers: false, includeStats: true });
  assert.equal(withStats.data.papers.llmModelPoolState.models["qwen-plus"].localUsedTokens, 42);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("resetting an aliyun llm model pool entry clears local state and logs the reset", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-reset-"));
  await writeLlmModelPoolState({ models: { "qwen-plus": { model: "qwen-plus", localUsedTokens: 42, status: "failing" } } }, tempDir);
  const result = await resetLlmModelPoolState("qwen-plus", { dataDir: tempDir });
  const state = await readLlmModelPoolState(tempDir);
  const operations = await readOperationLog(tempDir);
  assert.equal(result.ok, true);
  assert.equal(state.models["qwen-plus"], undefined);
  assert.equal(operations[0].operation, "llm-model-pool-reset");
  assert.equal(operations[0].model, "qwen-plus");
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

test("configured LLM allows slow providers up to sixty seconds", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "paperhot_backend.cjs"), "utf8");
  assert.match(source, /AbortSignal\.timeout\(60000\)/);
});

test("LLM enrichment limits concurrent requests and preserves paper order", async () => {
  let active = 0;
  let maxActive = 0;
  const papers = Array.from({ length: 5 }, (_, index) => ({
    id: `llm-concurrency-${index}`,
    title: `SIM paper ${index}`,
    summary: `Abstract ${index}`
  }));

  const enriched = await enrichPapersWithLlmInsights(papers, {
    fetcher: async ({ paper }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return {
        abstractZh: `中文摘要 ${paper.id}`,
        reason: "推荐理由",
        tokenUsage: { status: "已调用 AI" }
      };
    }
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(enriched.map(paper => paper.id), papers.map(paper => paper.id));
});

test("Crossref enrichment limits concurrent requests and preserves paper order", async () => {
  let active = 0;
  let maxActive = 0;
  const papers = Array.from({ length: 5 }, (_, index) => ({
    id: `crossref-concurrency-${index}`,
    title: `Structured illumination microscopy paper ${index}`
  }));

  const enriched = await enrichPapersWithCrossref(papers, {
    fetcher: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return null;
    }
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(enriched.map(paper => paper.id), papers.map(paper => paper.id));
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
    abstractSources: matchingAbstractSources(paper => paper.summary),
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
    abstractSources: matchingAbstractSources(paper => paper.summary),
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
  }, { dataDir: tempDir, abstractSources: matchingAbstractSources(paper => paper.summary) });
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

test("single-paper LLM failure stays failed and does not rewrite the archive", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-failure-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [{
      id: "still-failed",
      title: "Structured illumination microscopy timeout",
      summary: "Source abstract.",
      reason: "旧理由",
      tokenUsage: { status: "未调用 AI" }
    }]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({
    id: "still-failed",
    fetcher: async () => { throw new Error("LLM timeout"); }
  }, { dataDir: tempDir, abstractSources: matchingAbstractSources(paper => paper.summary) });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.updated, false);
  assert.equal(payload.existed, true);
  assert.match(payload.errors[0].message, /timeout/);
  assert.equal(archive.papers[0].reason, "旧理由");
  assert.equal(archive.papers[0].llmUpdatedAt, undefined);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("single-paper LLM refresh does not match a different paper with the same title", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-identity-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      {
        id: "same-title-first",
        doi: "10.1000/first",
        title: "Shared microscopy title",
        authors: ["Alice First"],
        summary: "First abstract",
        reason: "保留第一篇",
        tokenUsage: { status: "未调用 AI" }
      },
      {
        id: "same-title-target",
        doi: "10.1000/target",
        title: "Shared microscopy title",
        authors: ["Bob Target"],
        summary: "Target abstract",
        reason: "更新第二篇",
        tokenUsage: { status: "未调用 AI" }
      }
    ]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({
    id: "same-title-target",
    doi: "10.1000/target",
    title: "Shared microscopy title",
    authors: ["Bob Target"],
    fetcher: async ({ paper }) => {
      assert.equal(paper.id, "same-title-target");
      return {
        abstractZh: "第二篇中文摘要。",
        reason: "只更新第二篇。",
        tokenUsage: { prompt: 6, completion: 4, total: 10, model: "test-llm", status: "已调用 AI" }
      };
    }
  }, { dataDir: tempDir, abstractSources: matchingAbstractSources(paper => paper.summary) });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.paper.id, "same-title-target");
  assert.equal(archive.papers[0].reason, "保留第一篇");
  assert.equal(archive.papers[1].reason, "只更新第二篇。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("single-paper LLM refresh accepts a stable id when only the archive has a DOI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-enriched-id-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [{
      id: "stable-paper-id",
      doi: "10.1000/enriched-later",
      title: "Metadata enriched paper",
      authors: ["Alice Author"],
      summary: "Archive abstract",
      reason: "旧理由",
      tokenUsage: { status: "未调用 AI" }
    }]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({
    id: "stable-paper-id",
    title: "Metadata enriched paper",
    fetcher: async ({ paper }) => ({
      abstractZh: `更新 ${paper.id}`,
      reason: "稳定 ID 匹配。",
      tokenUsage: { prompt: 4, completion: 3, total: 7, model: "test-llm", status: "已调用 AI" }
    })
  }, { dataDir: tempDir, abstractSources: matchingAbstractSources(paper => paper.summary) });

  assert.equal(payload.updated, true);
  assert.equal(payload.paper.id, "stable-paper-id");
  assert.equal(payload.paper.reason, "稳定 ID 匹配。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("single-paper LLM refresh saves a manual abstract before sending it to AI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-abstract-"));
  const manualAbstract = "This manually verified complete abstract describes structured illumination microscopy reconstruction with robust experimental validation.";
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    papers: [{ id: "manual-abstract", title: "Manual abstract paper", summary: "Search snippet…", abstractStatus: "unconfirmed", tokenUsage: { status: "未调用 AI" } }]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({ id: "manual-abstract", manualAbstract }, {
    dataDir: tempDir,
    fetcher: async ({ paper }) => {
      assert.equal(paper.summary, manualAbstract);
      return { abstractZh: "人工摘要翻译。", reason: "人工摘要推荐。", tokenUsage: { status: "已调用 AI", total: 8 } };
    }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.updated, true);
  assert.equal(payload.aiUpdated, true);
  assert.equal(archive.papers[0].summary, manualAbstract);
  assert.deepEqual(archive.papers[0].abstractConsensusSources, ["manual"]);
  assert.equal(archive.papers[0].abstractZh, "人工摘要翻译。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("manual abstract can match no-DOI archive papers when transient ids differ", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-abstract-title-match-"));
  const title = "Deep-learning-enhanced super-resolution reconstruction for negative-feedback adaptive structured illumination microscopy";
  const authors = ["Tingting Zhou", "Xinzhu Sang"];
  const manualAbstract = "This complete manually supplied abstract explains the deep-learning enhanced reconstruction method, negative feedback adaptive structured illumination microscopy, and experimental validation.";
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    papers: [{
      id: "archive-stable-id",
      title,
      authors,
      journal: "International Conference on Remote Sensing, Mapping, and Image Processing (RSMIP 2026)",
      published: "2026-05-28",
      summary: "Snippet…",
      abstractStatus: "unconfirmed"
    }]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({
    id: "today-transient-id",
    title,
    authors,
    manualAbstract
  }, {
    dataDir: tempDir,
    fetcher: async ({ paper }) => ({
      abstractZh: `人工摘要翻译：${paper.title}`,
      reason: "人工摘要推荐。",
      tokenUsage: { status: "已调用 AI", total: 8 }
    })
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.existed, true);
  assert.equal(payload.updated, true);
  assert.equal(archive.papers[0].id, "archive-stable-id");
  assert.equal(archive.papers[0].summary, manualAbstract);
  assert.equal(archive.papers[0].abstractZh, `人工摘要翻译：${title}`);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("manual abstract remains saved when the following AI call fails", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-abstract-ai-fail-"));
  const manualAbstract = "This complete manually supplied abstract remains available when the language model request fails.";
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    papers: [{ id: "manual-ai-fail", title: "Manual abstract persistence", summary: "Snippet…", abstractStatus: "unconfirmed" }]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({ id: "manual-ai-fail", manualAbstract }, {
    dataDir: tempDir,
    fetcher: async () => { throw new Error("LLM timeout"); }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.updated, true);
  assert.equal(payload.aiUpdated, false);
  assert.equal(archive.papers[0].summary, manualAbstract);
  assert.equal(archive.papers[0].abstractStatus, "confirmed");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("manual abstract bypasses automatic truncation rules and is sent to AI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-abstract-invalid-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    papers: [{ id: "manual-invalid", title: "Manual invalid abstract", summary: "Original snippet…", abstractStatus: "unconfirmed" }]
  }, null, 2)}\n`, "utf8");
  let llmCalls = 0;

  const payload = await refreshArchivePaperLlmInsight({ id: "manual-invalid", manualAbstract: "Still truncated…" }, {
    dataDir: tempDir,
    fetcher: async ({ paper }) => {
      llmCalls += 1;
      assert.equal(paper.summary, "Still truncated…");
      return { abstractZh: "人工摘要翻译。", reason: "人工摘要推荐。", tokenUsage: { status: "已调用 AI", total: 8 } };
    }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.updated, true);
  assert.equal(payload.aiUpdated, true);
  assert.equal(llmCalls, 1);
  assert.equal(archive.papers[0].summary, "Still truncated…");
  assert.equal(archive.papers[0].abstractZh, "人工摘要翻译。");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("manual abstract is archived even when the current card has no archive match", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-manual-abstract-new-card-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({ mode: "archive", papers: [] }, null, 2)}\n`, "utf8");
  const manualAbstract = "A manually supplied abstract must be saved before any AI request is attempted.";

  const payload = await refreshArchivePaperLlmInsight({
    id: "today-only-paper",
    title: "Paper visible only on the current page",
    authors: ["Test Author"],
    published: "2026-07-18",
    manualAbstract
  }, {
    dataDir: tempDir,
    fetcher: async () => { throw new Error("AI endpoint unavailable"); }
  });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.updated, true);
  assert.equal(payload.aiUpdated, false);
  assert.equal(payload.existed, false);
  assert.equal(archive.papers.length, 1);
  assert.equal(archive.papers[0].id, "today-only-paper");
  assert.equal(archive.papers[0].summary, manualAbstract);
  assert.equal(archive.papers[0].abstractStatus, "confirmed");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("single-paper Firecrawl retry uses only the publisher scrape before AI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-firecrawl-retry-"));
  const abstract = "This complete Firecrawl publisher abstract describes a structured illumination microscopy method and its validation.";
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    papers: [{ id: "firecrawl-retry", doi: "10.1000/firecrawl-retry", title: "Firecrawl retry paper", summary: "Snippet…", abstractStatus: "unconfirmed" }]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchivePaperLlmInsight({ id: "firecrawl-retry", abstractMode: "firecrawl" }, {
    dataDir: tempDir,
    firecrawl: {
      config: { enabled: true, endpoint: "https://firecrawl.test/v2/scrape", apiKey: "fc-test" },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ success: true, data: { markdown: `## Abstract\n\n${abstract}\n\n## Introduction`, metadata: { title: "Firecrawl retry paper" } } })
      })
    },
    abstractSources: { wos: async () => { throw new Error("WoS must not run"); } },
    fetcher: async ({ paper }) => {
      assert.equal(paper.summary, abstract);
      return { abstractZh: "Firecrawl 摘要翻译。", reason: "Firecrawl 推荐。", tokenUsage: { status: "已调用 AI", total: 9 } };
    }
  });

  assert.equal(payload.updated, true);
  assert.deepEqual(payload.paper.abstractConsensusSources, ["firecrawl"]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("concurrent single-paper Firecrawl retries preserve both archive updates", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-firecrawl-concurrent-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    papers: [
      { id: "firecrawl-one", doi: "10.1000/firecrawl-one", title: "Firecrawl paper one", summary: "Snippet one…", abstractStatus: "unconfirmed" },
      { id: "firecrawl-two", doi: "10.1000/firecrawl-two", title: "Firecrawl paper two", summary: "Snippet two…", abstractStatus: "unconfirmed" }
    ]
  }, null, 2)}\n`, "utf8");
  let started = 0;
  let releaseBoth;
  const bothStarted = new Promise(resolve => { releaseBoth = resolve; });
  const firecrawl = {
    config: { enabled: true, endpoint: "https://firecrawl.test/v2/scrape", apiKey: "fc-test" },
    fetchImpl: async (_url, request) => {
      started += 1;
      if (started === 2) releaseBoth();
      await bothStarted;
      const doi = new URL(JSON.parse(request.body).url).pathname.slice(1);
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { rawHtml: `<meta name="citation_abstract" content="Complete abstract for ${doi}.">` }
        })
      };
    }
  };

  await Promise.all([
    refreshArchivePaperLlmInsight({ id: "firecrawl-one", abstractMode: "firecrawl" }, { dataDir: tempDir, firecrawl, fetcher: async () => null }),
    refreshArchivePaperLlmInsight({ id: "firecrawl-two", abstractMode: "firecrawl" }, { dataDir: tempDir, firecrawl, fetcher: async () => null })
  ]);
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.deepEqual(archive.papers.map(paper => paper.abstractStatus), ["confirmed", "confirmed"]);
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
    abstractSources: matchingAbstractSources(paper => paper.summary),
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

test("bulk LLM refresh counts only successful papers", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-archive-llm-partial-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 2,
    papers: [
      { id: "llm-success", title: "Successful SIM paper", summary: "Source abstract.", reason: "旧理由", tokenUsage: { status: "未调用 AI" } },
      { id: "llm-failure", title: "Failed SIM paper", summary: "Source abstract.", reason: "保留理由", tokenUsage: { status: "未调用 AI" } }
    ]
  }, null, 2)}\n`, "utf8");

  const payload = await refreshArchiveLlmInsights({
    abstractSources: matchingAbstractSources(paper => paper.summary),
    fetcher: async ({ paper }) => {
      if (paper.id === "llm-failure") throw new Error("provider timeout");
      return {
        abstractZh: "中文摘要",
        reason: "新理由",
        tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test", status: "已调用 AI" }
      };
    }
  }, { dataDir: tempDir });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(payload.updatedCount, 1);
  assert.equal(payload.errors.length, 1);
  assert.equal(archive.papers.find(paper => paper.id === "llm-success").reason, "新理由");
  assert.equal(archive.papers.find(paper => paper.id === "llm-failure").reason, "保留理由");
  assert.equal(archive.papers.find(paper => paper.id === "llm-failure").llmUpdatedAt, undefined);
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
    abstractSources: matchingAbstractSources(
      "This is the complete source abstract for structured illumination microscopy.",
      paper => assert.equal(paper.id, "truncated-scholar")
    ),
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

test("abstract consensus ignores formatting differences but rejects content changes", () => {
  const formatted = "<jats:p><strong>BACKGROUND:</strong> Structured-\nillumination reaches 0.5 μm; reconstruction = stable.</jats:p>";
  const plain = "Structuredillumination reaches 0.5 μm, reconstruction = stable.";
  const changed = "Structuredillumination reaches 0.6 μm, reconstruction = stable.";

  assert.equal(abstractMatchText(formatted), abstractMatchText(plain));
  assert.notEqual(abstractMatchText(formatted), abstractMatchText(changed));
  assert.deepEqual(
    selectMatchingAbstractCandidate([
      { source: "wos", cleanAbstract: formatted },
      { source: "semantic-scholar", cleanAbstract: plain },
      { source: "crossref", cleanAbstract: changed }
    ]).sources,
    ["wos", "semantic-scholar"]
  );
});

test("abstract consensus does not count decorated labels from the same source twice", () => {
  const abstract = "The same complete abstract returned twice by one provider.";

  assert.equal(selectMatchingAbstractCandidate([
    { source: "Semantic Scholar · Nature Methods", cleanAbstract: abstract },
    { source: "semanticScholar", cleanAbstract: abstract }
  ]), null);
  assert.equal(selectMatchingAbstractCandidate([
    { source: "arXiv cs.CV", cleanAbstract: abstract },
    { source: "arxiv", cleanAbstract: abstract }
  ]), null);
});

test("abstract recovery replaces a supplement DOI with the article DOI from its URL", async () => {
  const articleDoi = "10.1021/acs.analchem.5c01929";
  const seenDois = [];
  const source = async paper => {
    seenDois.push(paper.doi);
    return { doi: paper.doi, title: paper.title, abstract: "Complete article abstract." };
  };
  const [paper] = await recoverGeneratedSummaryPapers([{
    title: "Pixel-Wise Diffusion Imaging",
    doi: `${articleDoi}.s001`,
    url: `https://pubs.acs.org/doi/abs/${articleDoi}`,
    summary: "… search snippet …"
  }], {
    abstractSources: { crossref: source, semanticScholar: source }
  });

  assert.deepEqual(seenDois, [articleDoi, articleDoi]);
  assert.equal(paper.doi, articleDoi);
  assert.equal(paper.abstractStatus, "confirmed");
});

test("abstract recovery keeps a corrected article DOI without consensus", async () => {
  const articleDoi = "10.1021/acsnano.6c00486";
  const [paper] = await recoverGeneratedSummaryPapers([{
    title: "Super-Resolution Structured Illumination Microscopy",
    doi: `${articleDoi}.s001`,
    url: `https://pubs.acs.org/doi/abs/${articleDoi}`,
    summary: "… search snippet …"
  }], {
    abstractSources: { crossref: async () => null, semanticScholar: async () => null }
  });

  assert.equal(paper.doi, articleDoi);
  assert.equal(paper.abstractStatus, "unconfirmed");
});

test("abstract recovery reads an article DOI from a publisher URL path", async () => {
  const articleDoi = "10.1007/978-1-0716-5268-8_1";
  const [paper] = await recoverGeneratedSummaryPapers([{
    title: "Structured Illumination Microscopy",
    doi: "10.1021/acsphotonics.0c01360.s001",
    url: `https://link.springer.com/protocol/${articleDoi}`,
    summary: "… search snippet …"
  }], {
    abstractSources: { crossref: async () => null, semanticScholar: async () => null }
  });

  assert.equal(paper.doi, articleDoi);
});

test("abstract recovery batches Semantic Scholar DOI lookups", async () => {
  const papers = ["10.1000/batch-one", "10.1000/batch-two"].map((doi, index) => ({
    title: `Structured illumination batch paper ${index + 1}`,
    doi,
    summary: "… search snippet …"
  }));
  let semanticCalls = 0;
  const recovered = await recoverGeneratedSummaryPapers(papers, {
    webOfScience: { config: { enabled: false } },
    abstractFetchImpl: async (url, request = {}) => {
      const value = String(url);
      if (value.includes("semanticscholar")) {
        semanticCalls += 1;
        assert.equal(request.method, "POST");
        return {
          ok: true,
          status: 200,
          json: async () => papers.map(paper => ({ title: paper.title, abstract: `Complete abstract for ${paper.doi}.`, externalIds: { DOI: paper.doi }, authors: [] }))
        };
      }
      const doi = decodeURIComponent(value.split("/").at(-1));
      const paper = papers.find(item => item.doi === doi);
      return {
        ok: true,
        status: 200,
        json: async () => ({ message: { DOI: paper.doi, title: [paper.title], abstract: `Complete abstract for ${paper.doi}.` } })
      };
    }
  });

  assert.equal(semanticCalls, 1);
  assert.deepEqual(recovered.map(paper => paper.abstractStatus), ["confirmed", "confirmed"]);
});

test("Semantic Scholar retries HTTP 429 before forming abstract consensus", async () => {
  const doi = "10.1000/retry-abstract";
  const abstract = "Complete structured illumination microscopy abstract.";
  let semanticCalls = 0;
  const [paper] = await recoverGeneratedSummaryPapers([{
    title: "Structured illumination retry paper",
    doi,
    summary: "… search snippet …"
  }], {
    webOfScience: { config: { enabled: false } },
    abstractFetchImpl: async url => {
      const value = String(url);
      if (value.includes("semanticscholar")) {
        semanticCalls += 1;
        if (semanticCalls === 1) return { ok: false, status: 429, headers: { get: () => "0" } };
        return {
          ok: true,
          status: 200,
          json: async () => [{ title: "Structured illumination retry paper", abstract, externalIds: { DOI: doi }, authors: [] }]
        };
      }
      if (value.includes("api.crossref.org")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: { DOI: doi, title: ["Structured illumination retry paper"] } })
        };
      }
      throw new Error(`Unexpected URL: ${value}`);
    }
  });

  assert.equal(semanticCalls, 2);
  assert.deepEqual(paper.abstractConsensusSources, ["semantic-scholar"]);
});

test("abstract recovery starts all sources and accepts the first complete result", async () => {
  const resolvers = new Map();
  const calls = [];
  const source = name => async () => {
    calls.push(name);
    return new Promise(resolve => resolvers.set(name, resolve));
  };
  const paper = {
    id: "consensus-paper",
    doi: "10.1000/consensus",
    title: "Structured illumination consensus",
    authors: ["A. Author"],
    summary: "… search snippet …"
  };
  const pending = recoverGeneratedSummaryPapers([paper], {
    abstractSources: {
      wos: source("wos"),
      semanticScholar: source("semantic-scholar"),
      crossref: source("crossref"),
      publisher: source("publisher")
    }
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.sort(), ["crossref", "publisher", "semantic-scholar", "wos"]);
  resolvers.get("wos")({ doi: paper.doi, title: paper.title, authors: paper.authors, abstract: "Complete abstract A." });

  const [recovered] = await pending;
  assert.equal(recovered.summary, "Complete abstract A.");
  assert.deepEqual(recovered.abstractConsensusSources, ["wos"]);
  assert.equal(recovered.abstractStatus, "confirmed");
});

test("archive LLM refresh accepts a complete abstract returned by one source", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-abstract-single-source-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [{
      id: "single-source",
      doi: "10.1000/single",
      title: "Single source structured illumination paper",
      authors: ["A. Author"],
      summary: "… search snippet …",
      tokenUsage: { status: "未调用 AI" }
    }]
  }, null, 2)}\n`, "utf8");
  let llmCalls = 0;

  const payload = await refreshArchiveLlmInsights({
    dataDir: tempDir,
    abstractSources: {
      wos: async paper => ({
        doi: paper.doi,
        title: paper.title,
        authors: paper.authors,
        abstract: "This complete abstract is available from only one source."
      }),
      semanticScholar: async () => "",
      crossref: async () => "",
      publisher: async () => ""
    },
    fetcher: async () => {
      llmCalls += 1;
      return { abstractZh: "完整中文摘要。", reason: "推荐理由。", tokenUsage: { status: "已调用 AI" } };
    }
  });

  assert.equal(llmCalls, 1);
  assert.equal(payload.updatedCount, 1);
  assert.equal(payload.papers[0].abstractZh, "完整中文摘要。");
  assert.deepEqual(payload.papers[0].abstractConsensusSources, ["wos"]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("archive LLM refresh persists a corrected article DOI without calling AI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-abstract-corrected-doi-"));
  const articleDoi = "10.1021/acsnano.6c00486";
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [{
      id: "supplement-doi",
      title: "Super-Resolution Structured Illumination Microscopy",
      doi: `${articleDoi}.s001`,
      url: `https://pubs.acs.org/doi/abs/${articleDoi}`,
      summary: "… search snippet …",
      tokenUsage: { status: "未调用 AI" }
    }]
  }, null, 2)}\n`, "utf8");
  let llmCalls = 0;

  const payload = await refreshArchiveLlmInsights({
    abstractSources: { crossref: async () => null, semanticScholar: async () => null },
    fetcher: async () => { llmCalls += 1; }
  }, { dataDir: tempDir });
  const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));

  assert.equal(llmCalls, 0);
  assert.equal(payload.updatedCount, 1);
  assert.equal(archive.papers[0].doi, articleDoi);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("archive LLM refresh uses the first complete abstract without waiting for agreement", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-abstract-conflict-"));
  await fs.writeFile(path.join(tempDir, "archive.json"), `${JSON.stringify({
    mode: "archive",
    count: 1,
    papers: [{
      id: "conflicting-sources",
      doi: "10.1000/conflict",
      title: "Conflicting structured illumination paper",
      authors: ["A. Author"],
      summary: "… search snippet …",
      tokenUsage: { status: "未调用 AI" }
    }]
  }, null, 2)}\n`, "utf8");
  let llmCalls = 0;
  const candidate = abstract => async paper => ({
    doi: paper.doi,
    title: paper.title,
    authors: paper.authors,
    abstract
  });

  const payload = await refreshArchiveLlmInsights({
    dataDir: tempDir,
    abstractSources: {
      wos: candidate("Complete abstract from source A."),
      semanticScholar: candidate("Complete abstract from source B."),
      crossref: candidate("Complete abstract from source C."),
      publisher: candidate("Complete abstract from source D.")
    },
    fetcher: async () => {
      llmCalls += 1;
      return { abstractZh: "完整中文摘要。", reason: "推荐理由。", tokenUsage: { status: "已调用 AI" } };
    }
  });

  assert.equal(llmCalls, 1);
  assert.equal(payload.updatedCount, 1);
  assert.equal(payload.papers[0].summary, "Complete abstract from source A.");
  assert.deepEqual(payload.papers[0].abstractConsensusSources, ["wos"]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("Firecrawl fetches a publisher page without using AI extraction", async () => {
  const paper = {
    doi: "10.1186/s43074-025-00171-w",
    title: "Ensemble deep learning-enabled single-shot composite structured illumination microscopy (eDL-cSIM)",
    authors: ["J. Qian"]
  };
  const abstract = "Structured illumination microscopy provides a complete publisher abstract without using generated extraction.";
  const requests = [];
  const config = {
    enabled: true,
    endpoint: "https://api.firecrawl.dev/v2/scrape",
    apiKey: "firecrawl-secret"
  };
  const fromHtml = await fetchFirecrawlAbstractForPaper(paper, {
    config,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            rawHtml: `<meta name="citation_abstract" content="${abstract}">`,
            markdown: "",
            metadata: { title: paper.title, url: "https://publisher.test/article" }
          }
        })
      };
    }
  });
  const fromMarkdown = await fetchFirecrawlAbstractForPaper(paper, {
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { rawHtml: "", markdown: `## Abstract\n\n${abstract}\n\n## Introduction`, metadata: { title: paper.title } } })
    })
  });

  assert.equal(fromHtml.abstract, abstract);
  assert.equal(fromMarkdown.abstract, abstract);
  assert.equal(requests[0].url, config.endpoint);
  assert.equal(requests[0].options.headers.Authorization, "Bearer firecrawl-secret");
  assert.equal(requests[0].body.url, `https://doi.org/${paper.doi}`);
  assert.deepEqual(requests[0].body.formats, ["markdown", "rawHtml"]);
  assert.equal(JSON.stringify(requests[0].body).includes("agent"), false);
  assert.equal(JSON.stringify(requests[0].body).includes("question"), false);
});

test("Firecrawl prefers a complete Markdown abstract over truncated page metadata", async () => {
  const completeAbstract = "Structured illumination microscopy supports large-field imaging. This complete abstract explains the method, aberration sensing strategy, experimental validation, and resulting improvement in reconstruction quality.";
  const result = await fetchFirecrawlAbstractForPaper({
    doi: "10.1021/acsphotonics.5c02743",
    title: "Adaptive Optics-Assisted Large-Field Structured Illumination Microscopy via Coherent Aberration Sensing",
    authors: ["C. Liang"]
  }, {
    config: {
      enabled: true,
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      apiKey: "firecrawl-secret"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          rawHtml: '<meta name="citation_abstract" content="Structured illumination microscopy supports large-field imaging...">',
          markdown: `## Abstract\n\n${completeAbstract}\n\n## Read this article`,
          metadata: { title: "Adaptive Optics-Assisted Large-Field Structured Illumination Microscopy via Coherent Aberration Sensing | ACS Photonics" }
        }
      })
    })
  });

  assert.equal(result.abstract, completeAbstract);
});

test("Firecrawl keeps a complete metadata abstract instead of longer page boilerplate", async () => {
  const abstract = "Structured illumination microscopy uses patterned excitation to improve resolution. This complete abstract describes the method and validation.";
  const result = await fetchFirecrawlAbstractForPaper({
    doi: "10.1021/acsphotonics.5c02743",
    title: "Adaptive Optics-Assisted Large-Field Structured Illumination Microscopy via Coherent Aberration Sensing",
    authors: ["C. Liang"]
  }, {
    config: {
      enabled: true,
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      apiKey: "firecrawl-secret"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          rawHtml: `<meta name="citation_abstract" content="${abstract}">`,
          markdown: `## Abstract\n\nClick to copy section link\n\n${abstract}\n\nACS Publications\n\nCopyright 2026 American Chemical Society\n\n## Read this article`,
          metadata: { title: "Adaptive Optics-Assisted Large-Field Structured Illumination Microscopy via Coherent Aberration Sensing | ACS Photonics" }
        }
      })
    })
  });

  assert.equal(result.abstract, abstract);
});

test("Firecrawl trims Markdown boilerplate after the abstract", async () => {
  const abstract = "Structured illumination microscopy uses patterned excitation to improve resolution. This complete abstract describes the method and validation.";
  const result = await fetchFirecrawlAbstractForPaper({
    doi: "10.1000/markdown-boilerplate",
    title: "Structured illumination microscopy validation",
    authors: []
  }, {
    config: {
      enabled: true,
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      apiKey: "firecrawl-secret"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          markdown: `## Abstract\n\n${abstract}\n\nThis is a preview of subscription content.\n\n## Access this article`,
          metadata: { title: "Structured illumination microscopy validation" }
        }
      })
    })
  });

  assert.equal(result.abstract, abstract);
});

test("Firecrawl removes SPIE view suffixes before querying DOI sources", async () => {
  const requests = [];
  const paper = {
    doi: "10.1117/12.3116453.short",
    url: "https://www.spiedigitallibrary.org/conference-proceedings-of-spie/14235/142355K/title/10.1117/12.3116453.short",
    title: "Benchmarking large multimodal models for structured illumination microscopy quality assessment",
    authors: []
  };
  await fetchFirecrawlAbstractForPaper(paper, {
    config: {
      enabled: true,
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      apiKey: "firecrawl-secret"
    },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { markdown: "", rawHtml: "" } })
      };
    }
  });

  const doiRequest = requests.find(request => request.body.url?.startsWith("https://doi.org/"));
  assert.equal(doiRequest.body.url, "https://doi.org/10.1117/12.3116453");
});

test("Firecrawl search discovers a candidate page but never trusts its snippet", async () => {
  const paper = {
    doi: "10.1117/12.3116453",
    url: "https://publisher.test/blocked",
    title: "Benchmarking large multimodal models for structured illumination microscopy quality assessment",
    authors: ["A. Author"]
  };
  const abstract = "Structured illumination microscopy lacks ground-truth images for comparing reconstruction quality. This complete abstract reports the evaluated models and conclusions.";
  const requests = [];
  const result = await fetchFirecrawlAbstractForPaper(paper, {
    config: {
      enabled: true,
      endpoint: "https://api.firecrawl.dev/v2/scrape",
      apiKey: "firecrawl-secret"
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url: String(url), body });
      if (String(url).endsWith("/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { web: [{ url: "https://repository.test/paper", title: paper.title, description: "A truncated search snippet..." }] }
          })
        };
      }
      if (body.url === "https://repository.test/paper") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { rawHtml: `<meta name="citation_abstract" content="${abstract}">`, metadata: { title: paper.title } }
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { markdown: "", rawHtml: "" } })
      };
    }
  });

  assert.equal(result.abstract, abstract);
  assert.equal(requests.some(request => request.url.endsWith("/search")), true);
  assert.equal(requests.some(request => request.body.url === "https://repository.test/paper"), true);
});

test("default abstract recovery starts WoS Semantic Scholar Crossref publisher and Firecrawl paths", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-abstract-default-sources-"));
  const calls = new Set();
  const paper = {
    id: "default-sources",
    doi: "10.1000/default-sources",
    title: "Default source structured illumination paper",
    authors: ["A. Author"],
    url: "https://publisher.test/paper",
    summary: "… search snippet …"
  };
  const abstract = "Complete structured illumination abstract.";
  const abstractFetchImpl = async url => {
    const value = String(url);
    if (value.includes("semanticscholar")) {
      calls.add("semantic-scholar");
      return {
        ok: true,
        json: async () => [{ title: paper.title, abstract, externalIds: { DOI: paper.doi }, authors: [{ name: "A. Author" }] }]
      };
    }
    if (value.includes("crossref")) {
      calls.add("crossref");
      return {
        ok: true,
        json: async () => ({ message: { DOI: paper.doi, title: [paper.title], abstract: `<jats:p>${abstract}</jats:p>`, author: [{ given: "A.", family: "Author" }] } })
      };
    }
    calls.add("publisher");
    return { ok: true, text: async () => `<meta name="citation_abstract" content="${abstract}">` };
  };
  const webOfScience = {
    config: {
      enabled: true,
      endpoint: "https://wos.test/documents",
      apiKey: "test-key",
      databaseId: "WOS",
      maxPages: 1,
      pageSize: 20,
      request: { apiKeyHeader: "X-ApiKey", useApiKeyHeader: true },
      responseMap: { items: "hits", title: "title", summary: "abstract", doi: "doi", authors: "authors" }
    },
    fetchImpl: async () => {
      calls.add("wos");
      return { ok: true, json: async () => ({ hits: [{ uid: "WOS:DEFAULT", doi: paper.doi, title: paper.title, abstract, authors: ["A. Author"] }] }) };
    }
  };
  const firecrawl = {
    config: { enabled: true, endpoint: "https://firecrawl.test/v2/scrape", apiKey: "firecrawl-key" },
    fetchImpl: async () => {
      calls.add("firecrawl");
      return { ok: true, json: async () => ({ success: true, data: { markdown: `## Abstract\n\n${abstract}\n\n## Introduction`, metadata: { title: paper.title } } }) };
    }
  };

  const [recovered] = await recoverGeneratedSummaryPapers([paper], {
    dataDir: tempDir,
    abstractFetchImpl,
    webOfScience,
    firecrawl
  });

  assert.equal(recovered.summary, abstract);
  assert.equal(recovered.abstractStatus, "confirmed");
  assert.equal(recovered.abstractConsensusSources.length, 1);
  assert.deepEqual([...calls].sort(), ["crossref", "firecrawl", "publisher", "semantic-scholar", "wos"]);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("discovery source selection does not disable Semantic Scholar field enrichment", async () => {
  let semanticCalls = 0;
  const paper = {
    id: "arxiv-discovery-only",
    retrievalSource: "arxiv",
    doi: "10.1000/discovery-only",
    title: "Structured illumination microscopy discovery-only switch",
    authors: ["A. Author"],
    summary: "Truncated snippet…"
  };
  const [recovered] = await recoverGeneratedSummaryPapers([paper], {
    sources: ["arxiv"],
    abstractSources: {
      semanticScholar: async () => {
        semanticCalls += 1;
        return {
          doi: paper.doi,
          title: paper.title,
          authors: paper.authors,
          abstract: "This complete abstract explains structured illumination microscopy discovery and reconstruction in sufficient detail."
        };
      }
    }
  });

  assert.equal(semanticCalls, 1);
  assert.equal(recovered.abstractStatus, "confirmed");
  assert.deepEqual(recovered.abstractConsensusSources, ["semantic-scholar"]);
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
    abstractSources: matchingAbstractSources(
      "This is the original structured illumination microscopy abstract.",
      paper => {
        abstractCalls += 1;
        assert.equal(paper.title, "Already summarized structured illumination paper");
      }
    ),
    fetchers: {
      arxiv: async () => [],
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

  assert.equal(abstractCalls, 2);
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
  const sources = parseEnabledSources(["Google 搜索", "arXiv", "bioRxiv", "Semantic Scholar", "OpenAlex", "Google Scholar", "谷歌学术", "某个公众号"]);

  assert.deepEqual(sources, ["arxiv", "biorxiv", "semanticscholar", "openalex", "googlescholar", "googlesearch"]);
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
              inline_links: { cited_by: { total: 27 } },
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
  assert.equal(papers[0].retrievalSource, "googlescholar");
  assert.equal(papers[0].citationCount, 27);
  assert.equal(papers[0].citationSource, "Google Scholar");
  assert.match(papers[0].citation, /Structured illumination microscopy for live-cell imaging\. Nature Methods\. doi:10\.1038\/s41592-026-00002-2/);
  assert.equal(papers[1].source, "Google Scholar · Optica");
});

test("fetches Web of Science papers through a configured API source with limited pages", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-fetch-"));
  const seen = [];
  const papers = await fetchWebOfSciencePapers(["structured illumination microscopy"], {
    dataDir: tempDir,
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
  assert.equal(seen[0].query, 'TS=("structured illumination microscopy")');
  assert.equal(seen[0].apiKey, "wos-key");
  assert.equal(papers.length, 3);
  assert.equal(papers[0].source, "Web of Science · Nature Methods");
  assert.equal(papers[2].source, "Web of Science · Optica");
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("WoS reports a disabled integration separately from missing configuration", async () => {
  const baseConfig = {
    endpoint: "https://api.clarivate.test/apis/wos-starter/v1/documents",
    apiKey: "saved-key",
    request: {},
    responseMap: {}
  };

  await assert.rejects(
    fetchWebOfSciencePapers(["SIM"], { config: { ...baseConfig, enabled: false } }),
    /API 已关闭/
  );
  await assert.rejects(
    fetchWebOfSciencePapers(["SIM"], { config: { ...baseConfig, enabled: true, apiKey: "" } }),
    /信源未配置/
  );
});

test("WoS request quotes Boolean keywords, sends a modified-time window, resumes, and stops after a short page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-resume-"));
  const urls = [];
  const completedPages = [];
  try {
    await fetchWebOfSciencePapers(["SIM"], {
      dataDir: tempDir,
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
      queryExpression: "(SIM AND super resolution) OR RIM",
      searchLogic: {
        activeKeywords: ["SIM", "super resolution", "RIM"],
        andEdges: [["SIM", "super resolution"]]
      },
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      startPage: 4,
      onPageComplete: progress => completedPages.push(progress),
      fetchImpl: async url => {
        urls.push(String(url));
        return { ok: true, status: 200, json: async () => ({ hits: [] }) };
      }
    });

    assert.equal(urls.length, 1);
    const request = new URL(urls[0]);
    assert.equal(request.origin + request.pathname, "https://api.clarivate.com/apis/wos-starter/v1/documents");
    assert.equal(request.searchParams.get("page"), "4");
    assert.equal(request.searchParams.get("modifiedTimeSpan"), "2026-01-01+2026-06-30");
    assert.equal(request.searchParams.get("sortField"), "LD+D");
    assert.equal(request.searchParams.has("publishTimeSpan"), false);
    assert.equal(request.searchParams.get("q"), 'TS=(("SIM" AND "super resolution") OR "RIM")');
    assert.deepEqual(completedPages, [{ page: 4, nextPage: 5, returned: 0, complete: true }]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("bioRxiv receives exact dates and filters with the search graph", async () => {
  const previousFetch = global.fetch;
  const urls = [];
  global.fetch = async url => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        collection: [
          {
            doi: "10.1101/2026.01.01.1",
            title: "SIM reconstruction",
            abstract: "A microscopy method without the paired term.",
            date: "2026-01-02"
          },
          {
            doi: "10.1101/2026.01.01.2",
            title: "SIM and RIM reconstruction",
            abstract: "A microscopy method with both terms.",
            date: "2026-01-03"
          }
        ]
      })
    };
  };
  try {
    const papers = await fetchBioRxivPapers("2026-01-03", ["SIM", "RIM"], {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      searchLogic: {
        activeKeywords: ["SIM", "RIM"],
        andEdges: [["SIM", "RIM"]]
      },
      fetchImpl: global.fetch
    });

    assert.equal(urls[0], "https://api.biorxiv.org/details/biorxiv/2026-01-01/2026-01-31/0/json");
    assert.deepEqual(papers.map(paper => paper.title), ["SIM and RIM reconstruction"]);
  } finally {
    global.fetch = previousFetch;
  }
});

test("arXiv pages newest-first until a full page is older than startDate", async () => {
  const previousFetch = global.fetch;
  const starts = [];
  const completedPages = [];
  const feed = entries => `<feed>${entries.map(entry => `
    <entry>
      <id>https://arxiv.org/abs/${entry.id}</id>
      <title>${entry.title}</title>
      <summary>structured illumination microscopy reconstruction</summary>
      <published>${entry.published}T00:00:00Z</published>
      <author><name>A. Author</name></author>
      <category term="cs.CV" />
    </entry>`).join("")}</feed>`;
  global.fetch = async url => {
    const start = Number(new URL(url).searchParams.get("start"));
    starts.push(start);
    const entries = start === 0
      ? [
          { id: "2601.00001", title: "Newest SIM paper", published: "2026-01-20" },
          { id: "2601.00002", title: "Recent SIM paper", published: "2026-01-10" }
        ]
      : [
          { id: "2512.00001", title: "Old SIM paper one", published: "2025-12-30" },
          { id: "2512.00002", title: "Old SIM paper two", published: "2025-12-20" }
        ];
    return { ok: true, text: async () => feed(entries) };
  };
  try {
    await fetchArxivPapers(["SIM"], {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      pageSize: 2,
      maxPages: 5,
      onPageComplete: progress => completedPages.push(progress),
      fetchImpl: global.fetch
    });

    assert.deepEqual(starts, [0, 2]);
    assert.deepEqual(completedPages, [
      { page: 1, nextPage: 2, returned: 2, complete: false },
      { page: 2, nextPage: 3, returned: 2, complete: true }
    ]);
  } finally {
    global.fetch = previousFetch;
  }
});

test("arXiv uses its bounded default page budget from a resumed page", async () => {
  const starts = [];
  const feed = entries => `<feed>${entries.map(entry => `
    <entry>
      <id>https://arxiv.org/abs/${entry.id}</id>
      <title>${entry.title}</title>
      <summary>structured illumination microscopy reconstruction</summary>
      <published>${entry.published}T00:00:00Z</published>
      <author><name>A. Author</name></author>
    </entry>`).join("")}</feed>`;
  await fetchArxivPapers(["SIM"], {
    startDate: "2026-01-01",
    pageSize: 2,
    startPage: 3,
    fetchImpl: async url => {
      const start = Number(new URL(url).searchParams.get("start"));
      starts.push(start);
      const entries = start === 4
        ? [
            { id: "2601.00001", title: "Recent SIM paper one", published: "2026-01-20" },
            { id: "2601.00002", title: "Recent SIM paper two", published: "2026-01-10" }
          ]
        : [
            { id: "2512.00001", title: "Old SIM paper one", published: "2025-12-30" },
            { id: "2512.00002", title: "Old SIM paper two", published: "2025-12-20" }
          ];
      return { ok: true, text: async () => feed(entries) };
    }
  });

  assert.deepEqual(starts, [4, 6]);
});

test("exact arXiv ID remains a single request with the multi-page default", async () => {
  const requests = [];
  await fetchArxivPapers(["SIM"], {
    arxivId: "2601.01234",
    pageSize: 1,
    fetchImpl: async url => {
      requests.push(new URL(url));
      return {
        ok: true,
        text: async () => `<feed><entry><id>https://arxiv.org/abs/2601.01234</id><title>Exact paper</title><summary>Exact result</summary><published>2020-01-01T00:00:00Z</published></entry></feed>`
      };
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get("id_list"), "2601.01234");
});

test("Google and Scholar send the requested Boolean expression and supported source dates", async () => {
  const requests = [];
  const config = {
    enabled: true,
    endpoint: "https://serpapi.test/search.json",
    apiKey: "test-key",
    maxPages: 1,
    num: 10,
    request: { method: "GET", queryName: "q", apiKeyQueryName: "api_key", useApiKeyHeader: false },
    responseMap: { items: "organic_results", title: "title", summary: "snippet", journal: "source", year: "date", url: "link" }
  };
  const fetchImpl = async url => {
    requests.push(new URL(url));
    return { ok: true, status: 200, text: async () => JSON.stringify({ organic_results: [] }) };
  };

  const sourceOptions = {
    config,
    queryExpression: "(SIM AND microscopy) OR RIM",
    startDate: "2025-12-15",
    endDate: "2026-03-02",
    fetchImpl
  };
  await fetchGoogleScholarPapers(["SIM", "RIM"], sourceOptions);
  await fetchGoogleSearchPapers(["SIM", "RIM"], sourceOptions);

  assert.deepEqual(requests.map(url => url.searchParams.get("q")), [
    "(SIM AND microscopy) OR RIM",
    "(SIM AND microscopy) OR RIM"
  ]);
  assert.equal(requests[0].searchParams.get("as_ylo"), "2025");
  assert.equal(requests[0].searchParams.get("as_yhi"), "2026");
  assert.equal(requests[1].searchParams.get("tbs"), "cdr:1,cd_min:12/15/2025,cd_max:03/02/2026");
});

test("exact-input classification recognizes DOI, WoS, arXiv, URL, and title", () => {
  assert.deepEqual(detectExactPaperInput("10.1038/s41592-026-00001-1"), {
    type: "doi",
    value: "10.1038/s41592-026-00001-1"
  });
  assert.deepEqual(detectExactPaperInput("https://doi.org/10.1038/s41592-026-00001-1"), {
    type: "doi",
    value: "10.1038/s41592-026-00001-1"
  });
  assert.deepEqual(detectExactPaperInput("WOS:000123"), { type: "wos-ut", value: "WOS:000123" });
  assert.deepEqual(detectExactPaperInput("2601.0123"), { type: "arxiv", value: "2601.0123" });
  assert.deepEqual(detectExactPaperInput("2601.01234v3"), { type: "arxiv", value: "2601.01234v3" });
  assert.deepEqual(detectExactPaperInput("arXiv:2601.01234"), { type: "arxiv", value: "2601.01234" });
  assert.deepEqual(detectExactPaperInput("https://arxiv.org/abs/2601.01234v2"), { type: "arxiv", value: "2601.01234v2" });
  assert.deepEqual(detectExactPaperInput("https://example.test/paper"), { type: "url", value: "https://example.test/paper" });
  assert.deepEqual(detectExactPaperInput("A full paper title"), { type: "title", value: "A full paper title" });
});

test("discovery task state preflight reads the canonical cursor without changing it", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-task-state-preflight-"));
  const task = {
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-04-13",
    endDate: "2026-07-13",
    sources: ["arxiv", "webofscience"],
    sourcePages: {
      arxiv: { nextPage: 2, complete: true },
      webofscience: { nextPage: 4, complete: false }
    }
  };
  try {
    await writeRecentFetchCursor(task, tempDir);
    const cursorPath = path.join(tempDir, "recent-fetch-cursors.json");
    const before = await fs.readFile(cursorPath, "utf8");
    const state = await readDiscoveryTaskState({
      dataDir: tempDir,
      mode: "recent",
      date: "2026-07-13",
      searchMode: task.searchMode,
      queryExpression: task.queryExpression,
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["arXiv", "Web of Science"],
      startDate: task.startDate,
      endDate: task.endDate
    });

    assert.equal(state.taskFingerprint, buildDiscoveryTaskFingerprint(task));
    assert.equal(state.resumable, true);
    assert.deepEqual(state.sourcePages, task.sourcePages);
    assert.deepEqual(state.sourceResults, []);
    assert.deepEqual(state.errors, []);
    assert.equal(await fs.readFile(cursorPath, "utf8"), before);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exact DOI lookup reuses the Crossref DOI helper", async () => {
  const urls = [];
  const metadata = await fetchCrossrefWorkByDoi("https://doi.org/10.1038/s41592-026-00001-1", {
    academicApis: { contactEmail: "" },
    fetchImpl: async url => {
      urls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          message: {
            DOI: "10.1038/s41592-026-00001-1",
            title: ["A full paper title"],
            "container-title": ["Nature Methods"],
            published: { "date-parts": [[2026]] }
          }
        })
      };
    }
  });

  assert.equal(urls[0], "https://api.crossref.org/works/10.1038%2Fs41592-026-00001-1");
  assert.equal(metadata.doi, "10.1038/s41592-026-00001-1");
  assert.equal(metadata.published, "2026");
});

test("Crossref sends the configured academic API contact email", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: new URL(String(url)), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          DOI: "10.1000/test",
          title: ["Test paper"],
          items: []
        }
      })
    };
  };
  const academicApis = { contactEmail: "researcher@example.org" };

  await fetchCrossrefWorkByDoi("10.1000/test", { fetchImpl, academicApis });
  await fetchCrossrefWorkByTitle({ title: "Test paper" }, { fetchImpl, academicApis });

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url.searchParams.get("mailto"), "researcher@example.org");
    assert.equal(request.options.headers["User-Agent"], "paperHOT/0.1 (mailto:researcher@example.org)");
  }
});

test("Crossref omits placeholder contact details when email is empty", async () => {
  let captured;
  await fetchCrossrefWorkByDoi("10.1000/test", {
    academicApis: { contactEmail: "" },
    fetchImpl: async (url, options) => {
      captured = { url: new URL(String(url)), options };
      return { ok: true, status: 200, json: async () => ({ message: {} }) };
    }
  });

  assert.equal(captured.url.searchParams.has("mailto"), false);
  assert.equal(captured.options.headers["User-Agent"], "paperHOT/0.1");
  assert.doesNotMatch(JSON.stringify(captured), /local@example\.invalid/);
});

test("exact DOI lookup skips sources that cannot query a DOI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-exact-doi-source-"));
  let arxivCalls = 0;
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      searchMode: "exact",
      queryExpression: "10.1038/s41592-026-00001-1",
      sources: ["arXiv"],
      fetchers: {
        arxiv: async () => {
          arxivCalls += 1;
          return [{ id: "unrelated", title: "Unrelated arXiv paper", published: "2026-01-01" }];
        },
        abstract: async () => "",
        llm: async () => ({
          abstractZh: "中文摘要。",
          reason: "精确 DOI 匹配。",
          tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test", status: "已调用 AI" }
        })
      },
      crossref: {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({
            message: {
              DOI: "10.1038/s41592-026-00001-1",
              title: ["A full paper title"],
              "container-title": ["Nature Methods"],
              published: { "date-parts": [[2026, 1, 15]] }
            }
          })
        })
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(arxivCalls, 0);
    assert.deepEqual(payload.newPapers.map(paper => paper.doi), ["10.1038/s41592-026-00001-1"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exact stable lookup bypasses direction and date filters without rerunning completed AI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-exact-stable-"));
  let llmCalls = 0;
  let sourceOptions;
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      searchMode: "exact",
      queryExpression: "WOS:000123",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM", "RIM"],
      searchLogic: { activeKeywords: ["SIM", "RIM"], andEdges: [["SIM", "RIM"]] },
      sources: ["Web of Science"],
      fetchers: {
        webofscience: async options => {
          sourceOptions = options;
          return [{
            id: "webofscience-wos-000123",
            retrievalSource: "webofscience",
            sourceId: "WOS:000123",
            title: "Unrelated exact result",
            summary: "No configured direction keywords.",
            abstractZh: "已有中文摘要。",
            reason: "已有推荐理由。",
            journal: "Example Journal",
            source: "Web of Science · Example Journal",
            sourceType: "论文数据库",
            published: "2020-01-01",
            tags: [],
            score: 50,
            shortTitle: "2020@",
            tokenUsage: { prompt: 1, completion: 1, total: 2, model: "existing", status: "已调用 AI" }
          }];
        },
        crossref: async () => null,
        llm: async () => {
          llmCalls += 1;
          return { abstractZh: "不应调用", reason: "不应调用", tokenUsage: { status: "已调用 AI" } };
        }
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(sourceOptions.rawQuery, "UT=(WOS:000123)");
    assert.equal(sourceOptions.startDate, undefined);
    assert.equal(sourceOptions.endDate, undefined);
    assert.equal(llmCalls, 0);
    assert.equal(payload.count, 1);
    assert.equal(payload.newPapers.length, 1);
    assert.deepEqual(payload.exactCandidates, []);
    assert.equal(payload.task.searchMode, "exact");
    assert.equal(payload.sourceResults[0].source, "webofscience");
    const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
    assert.equal(archive.papers.length, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exact WoS UT uses the actual adapter without direction dates or keyword filtering", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-exact-wos-adapter-"));
  const requests = [];
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "exact",
      queryExpression: "WOS:000123",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["Web of Science"],
      webOfScience: {
        config: {
          enabled: true,
          endpoint: "https://api.clarivate.test/apis/wos-starter/v1/documents",
          apiKey: "test-key",
          databaseId: "WOS",
          maxPages: 1,
          pageSize: 50,
          request: { method: "GET", queryName: "q", databaseQueryName: "db", pageQueryName: "page", limitQueryName: "limit", useApiKeyHeader: false },
          responseMap: { items: "hits", title: "title", summary: "abstract", journal: "source.sourceTitle", year: "source.publishYear", authors: "names.authors" }
        },
        fetchImpl: async url => {
          requests.push(new URL(url));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              hits: [{
                uid: "WOS:000123",
                title: "Historical optical calibration outside the configured direction",
                abstract: "No configured direction keyword is present.",
                source: { sourceTitle: "Optics Letters", publishYear: 2020 },
                names: { authors: [{ displayName: "A. Author" }] }
              }]
            })
          };
        }
      },
      fetchers: {
        crossref: async () => null,
        llm: async () => ({ abstractZh: "中文摘要。", reason: "精确匹配。", tokenUsage: { status: "已调用 AI" } })
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].searchParams.get("q"), "UT=(WOS:000123)");
    assert.equal(requests[0].searchParams.has("publishTimeSpan"), false);
    assert.deepEqual(payload.papers.map(paper => paper.sourceId), ["WOS:000123"]);
    assert.equal(payload.papers[0].published, "2020");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exact title uses actual Google adapters without direction dates or keyword filtering", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-exact-google-adapters-"));
  const requests = [];
  const title = "Historical optical calibration study";
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "exact",
      queryExpression: title,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["Google Scholar", "Google Search"],
      googleScholar: {
        dataDir: tempDir,
        config: {
          enabled: true,
          endpoint: "https://serpapi.test/search.json",
          apiKey: "test-key",
          maxPages: 1,
          num: 10,
          request: { method: "GET", queryName: "q", apiKeyQueryName: "api_key", useApiKeyHeader: false },
          responseMap: { items: "organic_results", title: "title", summary: "snippet", journal: "publication_info.summary", year: "publication_info.summary", url: "link" }
        },
        fetchImpl: async url => {
          const request = new URL(url);
          requests.push(request);
          const googleSearch = request.searchParams.get("engine") === "google";
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              organic_results: [{
                title,
                snippet: "No configured direction keyword is present.",
                publication_info: { summary: "A. Author - Optics Letters, 2020 - example.test" },
                source: "Optics Letters",
                date: googleSearch ? "Jan 5, 2020" : undefined,
                link: `https://example.test/${googleSearch ? "search" : "scholar"}`
              }]
            })
          };
        }
      },
      fetchers: {
        crossref: async () => null,
        llm: async () => ({ abstractZh: "中文摘要。", reason: "精确匹配。", tokenUsage: { status: "已调用 AI" } })
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(request => request.searchParams.get("q")), [`"${title}"`, `"${title}"`]);
    assert.equal(requests.some(request => request.searchParams.has("as_ylo") || request.searchParams.has("as_yhi") || request.searchParams.has("tbs")), false);
    assert.deepEqual(payload.papers, []);
    assert.deepEqual(payload.exactCandidates.map(paper => paper.title), [title, title]);
    assert.ok(payload.exactCandidates.every(paper => paper.published.startsWith("2020")));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("Task 4 Google adapters ignore legacy rolling offsets and persist canonical next pages", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-google-canonical-cursor-"));
  const requests = [];
  const title = "Exact optical calibration study";
  const config = {
    enabled: true,
    endpoint: "https://serpapi.test/search.json",
    apiKey: "test-key",
    rollingFetch: true,
    maxPages: 1,
    num: 10,
    request: { method: "GET", queryName: "q", apiKeyQueryName: "api_key", useApiKeyHeader: false },
    responseMap: { items: "organic_results", title: "title", summary: "snippet", journal: "source", year: "date", url: "link" }
  };
  const fetchImpl = async url => {
    const request = new URL(url);
    requests.push(request);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        organic_results: [{
          title,
          snippet: "Exact result without direction keywords.",
          source: "Optics Letters",
          date: "Jan 5, 2020",
          link: `https://example.test/${request.searchParams.get("engine") === "google" ? "search" : "scholar"}`
        }],
        serpapi_pagination: { next: "https://serpapi.test/search.json?start=10" }
      })
    };
  };
  try {
    await fetchGoogleScholarPapers(["SIM"], { dataDir: tempDir, config, fetchImpl });
    await fetchGoogleSearchPapers(["SIM"], { dataDir: tempDir, config, fetchImpl });
    const legacyBefore = await readGoogleRollingCursorStatus({
      dataDir: tempDir,
      config,
      keywords: ["SIM"],
      sources: ["Google Scholar", "Google Search"]
    });
    assert.deepEqual(legacyBefore.items.map(item => item.nextStart), [10, 10]);

    requests.length = 0;
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "exact",
      queryExpression: title,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["Google Scholar", "Google Search"],
      googleScholar: { dataDir: tempDir, config, fetchImpl },
      fetchers: {
        crossref: async () => null,
        llm: async () => ({ abstractZh: "中文摘要。", reason: "精确匹配。", tokenUsage: { status: "已调用 AI" } })
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.deepEqual(requests.map(request => Number(request.searchParams.get("start") || 0)), [0, 0]);
    assert.deepEqual(payload.sourcePages, {
      googlescholar: { nextPage: 2, complete: false },
      googlesearch: { nextPage: 2, complete: false }
    });
    assert.deepEqual((await readRecentFetchCursors(tempDir)).tasks[payload.taskFingerprint].sourcePages, payload.sourcePages);
    const legacyAfter = await readGoogleRollingCursorStatus({
      dataDir: tempDir,
      config,
      keywords: ["SIM"],
      sources: ["Google Scholar", "Google Search"]
    });
    assert.deepEqual(legacyAfter.items.map(item => item.nextStart), [10, 10]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("actual Google first-page failure preserves the canonical start page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-google-first-page-failure-"));
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "direction",
      queryExpression: "SIM",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["Google Scholar"],
      googleScholar: {
        config: {
          enabled: true,
          endpoint: "https://serpapi.test/search.json",
          apiKey: "test-key",
          rollingFetch: true,
          maxPages: 1,
          num: 10,
          request: { method: "GET", queryName: "q", apiKeyQueryName: "api_key", useApiKeyHeader: false },
          responseMap: { items: "organic_results", title: "title", summary: "snippet", journal: "source", year: "date", url: "link" }
        },
        fetchImpl: async () => { throw new Error("first page unavailable"); }
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.match(payload.errors[0].message, /first page unavailable/);
    assert.deepEqual(payload.sourcePages.googlescholar, { nextPage: 1, complete: false });
    assert.deepEqual((await readRecentFetchCursors(tempDir)).tasks[payload.taskFingerprint].sourcePages, {
      googlescholar: { nextPage: 1, complete: false }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exact title lookup returns close candidates without archiving or calling AI", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-exact-title-"));
  let llmCalls = 0;
  let crossrefCalls = 0;
  let sourceOptions;
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "exact",
      queryExpression: "Structured illumination microscopy reconstruction",
      keywords: ["SIM"],
      sources: ["Google Scholar"],
      fetchers: {
        googlescholar: async options => {
          sourceOptions = options;
          return [
            {
              id: "scholar-candidate-1",
              title: "Structured illumination microscopy reconstruction",
              summary: "First candidate.",
              source: "Google Scholar · Optica",
              sourceType: "论文搜索",
              published: "2021",
              tags: [],
              score: 80
            },
            {
              id: "scholar-candidate-2",
              title: "Structured illumination microscopy reconstruction methods",
              summary: "Second candidate.",
              source: "Google Scholar · Nature Methods",
              sourceType: "论文搜索",
              published: "2026-01-01",
              tags: [],
              score: 79
            }
          ];
        },
        crossref: async () => {
          crossrefCalls += 1;
          return null;
        },
        llm: async () => {
          llmCalls += 1;
          return { tokenUsage: { status: "已调用 AI" } };
        }
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(sourceOptions.queryExpression, '"Structured illumination microscopy reconstruction"');
    assert.equal(crossrefCalls, 0);
    assert.equal(llmCalls, 0);
    assert.equal(payload.count, 0);
    assert.equal(payload.newPapers.length, 0);
    assert.equal(payload.exactCandidates.length, 2);
    await assert.rejects(fs.access(path.join(tempDir, "archive.json")), { code: "ENOENT" });
    await assert.rejects(fs.access(path.join(tempDir, "2026-01-31-recent.json")), { code: "ENOENT" });
    await assert.rejects(fs.access(path.join(tempDir, "fetch-log.json")), { code: "ENOENT" });
    await assert.rejects(fs.access(path.join(tempDir, "operation-log.jsonl")), { code: "ENOENT" });
    await assert.rejects(fs.access(path.join(tempDir, "journal-metrics-cache.json")), { code: "ENOENT" });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("direction fetch pipeline uses the Boolean search graph instead of naive OR", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-direction-graph-"));
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      searchMode: "direction",
      queryExpression: "(SIM AND RIM)",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM", "RIM"],
      searchLogic: { activeKeywords: ["SIM", "RIM"], andEdges: [["SIM", "RIM"]] },
      sources: ["arXiv"],
      fetchers: {
        arxiv: async () => [
          { id: "sim-only", title: "SIM microscopy reconstruction", summary: "Only one term.", source: "arXiv", sourceType: "预印本", published: "2026-01-02", tags: [], score: 90 },
          { id: "sim-rim", title: "SIM and RIM microscopy reconstruction", summary: "Both terms.", source: "arXiv", sourceType: "预印本", published: "2026-01-03", tags: [], score: 80 }
        ],
        crossref: async () => null,
        llm: async ({ paper }) => ({
          abstractZh: paper.summary,
          reason: "匹配搜索图。",
          tokenUsage: { prompt: 1, completion: 1, total: 2, model: "test", status: "已调用 AI" }
        })
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.deepEqual(payload.newPapers.map(paper => paper.id), ["sim-rim"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("direction fetch trusts WoS query matches while still filtering other sources locally", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-trusted-query-"));
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      searchMode: "direction",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["structured illumination microscopy"],
      searchLogic: { activeKeywords: ["structured illumination microscopy"], andEdges: [] },
      sources: ["Web of Science", "Google Scholar"],
      webOfScience: {
        config: {
          enabled: true,
          endpoint: "https://api.clarivate.test/apis/wos-starter/v1/documents",
          apiKey: "test-key",
          databaseId: "WOS",
          maxPages: 1,
          pageSize: 20,
          queryTemplate: "TS=({query})",
          request: { apiKeyHeader: "X-ApiKey", useApiKeyHeader: true },
          responseMap: { items: "hits", title: "title", year: "source.publishYear" }
        },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ hits: [{ uid: "WOS:TRUSTED", title: "Sparse Starter record", source: { publishYear: 2026 } }] })
        })
      },
      fetchers: {
        googlescholar: async () => [
          { id: "scholar-match", retrievalSource: "googlescholar", title: "Structured illumination microscopy advances", summary: "Microscopy study.", source: "Google Scholar", published: "2026-01-10", tags: [], score: 80 },
          { id: "scholar-unrelated", retrievalSource: "googlescholar", title: "Unrelated chemistry study", summary: "Catalysis.", source: "Google Scholar", published: "2026-01-10", tags: [], score: 70 }
        ],
        crossref: async () => null,
        llm: async ({ paper }) => ({ abstractZh: paper.summary || "无摘要", reason: "测试。", tokenUsage: { status: "已调用 AI" } })
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.deepEqual(
      payload.newPapers.map(paper => paper.id).sort(),
      ["scholar-match", "webofscience-wos-trusted"],
      JSON.stringify({ sourceResults: payload.sourceResults, errors: payload.errors, papers: payload.papers.map(paper => paper.id) })
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("newPapers excludes stable identities that were already archived before this run", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-new-papers-"));
  const complete = paper => ({
    ...paper,
    summary: "structured illumination microscopy",
    abstractZh: "已有中文摘要。",
    reason: "已有推荐理由。",
    shortTitle: "2026@",
    source: "arXiv",
    sourceType: "预印本",
    published: "2026-01-10",
    tags: [],
    score: 80,
    tokenUsage: { status: "已调用 AI" }
  });
  const run = papers => fetchPaperPayload({
    dataDir: tempDir,
    refresh: true,
    mode: "recent",
    date: "2026-01-31",
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    keywords: ["SIM"],
    searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
    sources: ["arXiv"],
    fetchers: { arxiv: async () => papers, crossref: async () => null },
    journalMetrics: { config: { enabled: false } }
  });
  try {
    await run([complete({ id: "existing-paper", doi: "10.1000/existing", title: "Existing SIM paper" })]);
    const payload = await run([
      complete({ id: "same-paper-new-source-id", doi: "10.1000/existing", title: "Existing SIM paper" }),
      complete({ id: "new-paper", doi: "10.1000/new", title: "New SIM paper" })
    ]);

    assert.deepEqual(payload.newPapers.map(paper => paper.doi), ["10.1000/new"]);
    const archive = JSON.parse(await fs.readFile(path.join(tempDir, "archive.json"), "utf8"));
    assert.ok(archive.papers.some(paper => paper.doi === "10.1000/existing"));
    assert.ok(archive.papers.some(paper => paper.doi === "10.1000/new"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("newPapers uses conservative same-version identity boundaries", async t => {
  const paper = overrides => ({
    title: "Cross-source SIM identity study",
    summary: "structured illumination microscopy",
    abstractZh: "已有中文摘要。",
    reason: "已有推荐理由。",
    shortTitle: "2026@",
    sourceType: "论文数据库",
    published: "2026-01-10",
    tags: [],
    score: 80,
    tokenUsage: { status: "已调用 AI" },
    ...overrides
  });
  const runScenario = async (existing, incoming) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-new-papers-identity-"));
    const run = result => fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "direction",
      queryExpression: "SIM",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: [result.retrievalSource],
      fetchers: {
        [result.retrievalSource]: async () => [paper(result)],
        crossref: async () => null
      },
      journalMetrics: { config: { enabled: false } }
    });
    try {
      await run(existing);
      return await run(incoming);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };

  await t.test("keeps cross-source sourceId collisions new", async () => {
    const payload = await runScenario(
      { id: "scholar-first", retrievalSource: "googlescholar", sourceId: "shared-local-id", publicationStage: "formal", title: "First SIM paper", authors: ["Alice Smith"] },
      { id: "wos-second", retrievalSource: "webofscience", sourceId: "shared-local-id", publicationStage: "formal", title: "Different SIM paper", authors: ["Bob Jones"] }
    );
    assert.deepEqual(payload.newPapers.map(item => item.id), ["wos-second"]);
  });

  await t.test("keeps same-title papers with different authors new", async () => {
    const payload = await runScenario(
      { id: "scholar-alice", retrievalSource: "googlescholar", sourceId: "scholar-alice", publicationStage: "formal", authors: ["Alice Smith"] },
      { id: "wos-bob", retrievalSource: "webofscience", sourceId: "wos-bob", publicationStage: "formal", authors: ["Bob Jones"] }
    );
    assert.deepEqual(payload.newPapers.map(item => item.id), ["wos-bob"]);
  });

  await t.test("keeps same-title papers without author evidence new", async () => {
    const payload = await runScenario(
      { id: "scholar-no-author", retrievalSource: "googlescholar", sourceId: "scholar-no-author", publicationStage: "formal", authors: [] },
      { id: "wos-no-author", retrievalSource: "webofscience", sourceId: "wos-no-author", publicationStage: "formal", authors: [] }
    );
    assert.deepEqual(payload.newPapers.map(item => item.id), ["wos-no-author"]);
  });

  await t.test("recognizes normalized titles with overlapping authors in the same stage", async () => {
    const payload = await runScenario(
      { id: "scholar-same-paper", retrievalSource: "googlescholar", sourceId: "scholar-same-paper", publicationStage: "formal", title: "Cross-source: SIM identity study", authors: ["A. Smith"] },
      { id: "wos-same-paper", retrievalSource: "webofscience", sourceId: "wos-same-paper", publicationStage: "formal", title: "ＣＲＯＳＳ－ＳＯＵＲＣＥ SIM IDENTITY STUDY", authors: ["Alice Smith"] }
    );
    assert.deepEqual(payload.newPapers, []);
  });

  await t.test("recognizes equal DOI as the same version", async () => {
    const payload = await runScenario(
      { id: "scholar-doi", retrievalSource: "googlescholar", sourceId: "scholar-doi", publicationStage: "formal", doi: "10.1000/shared", title: "First SIM title", authors: [] },
      { id: "wos-doi", retrievalSource: "webofscience", sourceId: "wos-doi", publicationStage: "formal", doi: "https://doi.org/10.1000/SHARED", title: "Second SIM title", authors: [] }
    );
    assert.deepEqual(payload.newPapers, []);
  });

  await t.test("keeps formal and preprint versions separately new", async () => {
    const payload = await runScenario(
      { id: "formal-paper", retrievalSource: "webofscience", sourceId: "formal-paper", publicationStage: "formal", authors: ["Alice Smith"] },
      { id: "preprint-paper", retrievalSource: "arxiv", sourceId: "preprint-paper", publicationStage: "preprint", sourceType: "预印本", authors: ["Alice Smith"] }
    );
    assert.deepEqual(payload.newPapers.map(item => item.id), ["preprint-paper"]);
  });
});

test("discovery payload exposes one canonical Task 5 top-level contract", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-task5-contract-"));
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: "direction",
      queryExpression: "SIM",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["arXiv"],
      fetchers: { arxiv: async () => [], crossref: async () => null },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(payload.taskFingerprint, payload.task.fingerprint);
    assert.strictEqual(payload.sourcePages, payload.task.sourcePages);
    assert.ok(Array.isArray(payload.sourceResults));
    assert.ok(Array.isArray(payload.newPapers));
    assert.ok(Array.isArray(payload.errors));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("interrupted source page callback preserves the next resumable cursor", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-interrupted-cursor-"));
  try {
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      searchMode: "direction",
      queryExpression: "SIM OR RIM",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      keywords: ["SIM", "RIM"],
      searchLogic: { activeKeywords: ["SIM", "RIM"], andEdges: [] },
      sources: ["Web of Science"],
      fetchers: {
        webofscience: async options => {
          assert.equal(options.startPage, 1);
          await options.onPageComplete({ page: 4, nextPage: 5, returned: 50, complete: false });
          throw new Error("page 5 interrupted");
        }
      },
      journalMetrics: { config: { enabled: false } }
    });

    const cursors = await readRecentFetchCursors(tempDir);
    assert.match(payload.errors[0].message, /interrupted/);
    assert.equal(payload.task.sourcePages.webofscience.nextPage, 5);
    assert.deepEqual(cursors.tasks[payload.task.fingerprint].sourcePages, {
      webofscience: { nextPage: 5, complete: false }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("full WoS page budget keeps its cursor and the next run resumes at the next page", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-full-page-cursor-"));
  const requestedPages = [];
  const webOfScience = {
    config: {
      enabled: true,
      endpoint: "https://api.clarivate.test/apis/wos-starter/v1/documents",
      apiKey: "test-key",
      databaseId: "WOS",
      maxPages: 1,
      pageSize: 1,
      request: { method: "GET", queryName: "q", databaseQueryName: "db", pageQueryName: "page", limitQueryName: "limit", useApiKeyHeader: false },
      responseMap: { items: "hits", title: "title", summary: "abstract", year: "source.publishYear" }
    },
    fetchImpl: async url => {
      const page = Number(new URL(url).searchParams.get("page"));
      requestedPages.push(page);
      return {
        ok: true,
        status: 200,
        json: async () => ({ hits: page === 1 ? [{ uid: "WOS:1", title: "SIM full page", abstract: "SIM microscopy", source: { publishYear: 2026 } }] : [] })
      };
    }
  };
  const options = {
    dataDir: tempDir,
    refresh: true,
    mode: "recent",
    date: "2026-01-31",
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    keywords: ["SIM"],
    searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
    sources: ["Web of Science"],
    webOfScience,
    fetchers: {
      crossref: async () => null,
      llm: async () => ({ abstractZh: "中文摘要。", reason: "匹配。", tokenUsage: { status: "已调用 AI" } })
    },
    journalMetrics: { config: { enabled: false } }
  };
  try {
    const first = await fetchPaperPayload(options);
    const cursors = await readRecentFetchCursors(tempDir);
    assert.deepEqual(cursors.tasks[first.task.fingerprint].sourcePages.webofscience, { nextPage: 2, complete: false });

    await fetchPaperPayload({ ...options, resumeMode: "resume" });
    assert.deepEqual(requestedPages, [1, 2]);
    assert.deepEqual(await readRecentFetchCursors(tempDir), { tasks: {} });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("discovery request resume modes consume the canonical fingerprint cursor", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-resume-mode-"));
  const task = {
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["webofscience"],
    sourcePages: { webofscience: { nextPage: 4, complete: false } }
  };
  const starts = [];
  const run = resumeMode => fetchPaperPayload({
    dataDir: tempDir,
    refresh: true,
    mode: "recent",
    date: "2026-01-31",
    searchMode: task.searchMode,
    queryExpression: task.queryExpression,
    startDate: task.startDate,
    endDate: task.endDate,
    resumeMode,
    keywords: ["SIM"],
    searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
    sources: ["Web of Science"],
    fetchers: {
      webofscience: async options => {
        starts.push(options.startPage);
        await options.onPageComplete({ nextPage: options.startPage + 1, complete: false });
        throw new Error("interrupted");
      }
    },
    journalMetrics: { config: { enabled: false } }
  });

  try {
    await writeRecentFetchCursor(task, tempDir);
    const fresh = await run("new");
    assert.equal(starts.at(-1), 1);
    assert.equal(fresh.resumable, true);
    assert.equal(fresh.taskFingerprint, buildDiscoveryTaskFingerprint(task));
    assert.deepEqual(fresh.sourcePages.webofscience, { nextPage: 2, complete: false });
    assert.equal(fresh.sourceResults[0].status, "failed");
    assert.match(fresh.errors[0].message, /interrupted/);

    const resumed = await run("resume");
    assert.equal(starts.at(-1), 2);
    assert.deepEqual(resumed.sourcePages.webofscience, { nextPage: 3, complete: false });

    const restarted = await run("restart");
    assert.equal(starts.at(-1), 1);
    assert.deepEqual(restarted.sourcePages.webofscience, { nextPage: 2, complete: false });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("same-fingerprint restart and resume jobs serialize around a clean multi-source cursor", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-task-queue-"));
  const task = {
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["arxiv", "webofscience"],
    sourcePages: {
      arxiv: { nextPage: 9, complete: true },
      webofscience: { nextPage: 5, complete: false }
    }
  };
  const starts = [];
  const activeJobs = new Set();
  let overlapped = false;
  let releaseRestart;
  let markRestartStarted;
  const restartGate = new Promise(resolve => { releaseRestart = resolve; });
  const restartStarted = new Promise(resolve => { markRestartStarted = resolve; });
  const run = (resumeMode, label) => fetchPaperPayload({
    dataDir: tempDir,
    refresh: true,
    mode: "recent",
    date: "2026-01-31",
    searchMode: task.searchMode,
    queryExpression: task.queryExpression,
    startDate: task.startDate,
    endDate: task.endDate,
    resumeMode,
    keywords: ["SIM"],
    searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
    sources: ["arXiv", "Web of Science"],
    fetchers: {
      arxiv: async options => {
        if ([...activeJobs].some(active => active !== label)) overlapped = true;
        activeJobs.add(label);
        starts.push(`${label}:arxiv:${options.startPage}`);
        try {
          if (label === "restart") throw new Error("arxiv first request failed");
          await options.onPageComplete({ nextPage: options.startPage + 1, complete: true });
          return [];
        } finally {
          activeJobs.delete(label);
        }
      },
      webofscience: async options => {
        if ([...activeJobs].some(active => active !== label)) overlapped = true;
        activeJobs.add(label);
        starts.push(`${label}:webofscience:${options.startPage}`);
        try {
          if (label === "restart") {
            markRestartStarted();
            await restartGate;
            await options.onPageComplete({ nextPage: 2, complete: false });
            throw new Error("webofscience interrupted");
          }
          await options.onPageComplete({ nextPage: options.startPage + 1, complete: true });
          return [];
        } finally {
          activeJobs.delete(label);
        }
      },
      crossref: async () => null
    },
    journalMetrics: { config: { enabled: false } }
  });

  try {
    await writeRecentFetchCursor(task, tempDir);
    const restartPromise = run("restart", "restart");
    await restartStarted;
    const resumePromise = run("resume", "resume");
    await new Promise(resolve => setImmediate(resolve));
    const overlappedBeforeRelease = overlapped;
    releaseRestart();
    const [restarted, resumed] = await Promise.all([restartPromise, resumePromise]);

    assert.equal(overlappedBeforeRelease, false);
    assert.deepEqual(restarted.sourcePages, {
      arxiv: { nextPage: 1, complete: false },
      webofscience: { nextPage: 2, complete: false }
    });
    assert.deepEqual(starts, [
      "restart:arxiv:1",
      "restart:webofscience:1",
      "resume:arxiv:1",
      "resume:webofscience:2"
    ]);
    assert.equal(resumed.resumable, false);
    assert.deepEqual(await readRecentFetchCursors(tempDir), { tasks: {} });
  } finally {
    releaseRestart();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("same-fingerprint queue recovers after a queued progress callback rejects", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-task-queue-reject-"));
  let sourceCalls = 0;
  const options = {
    dataDir: tempDir,
    refresh: true,
    mode: "recent",
    date: "2026-01-31",
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    keywords: ["SIM"],
    searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
    sources: ["arXiv"],
    fetchers: {
      arxiv: async () => {
        sourceCalls += 1;
        return [];
      },
      crossref: async () => null
    },
    journalMetrics: { config: { enabled: false } }
  };

  try {
    await assert.rejects(fetchPaperPayload({
      ...options,
      onProgress: () => { throw new Error("progress observer failed"); }
    }), /progress observer failed/);

    const payload = await fetchPaperPayload(options);
    assert.equal(sourceCalls, 1);
    assert.equal(payload.taskFingerprint, buildDiscoveryTaskFingerprint(payload.task));

    const backendSource = await fs.readFile(path.join(__dirname, "..", "paperhot_backend.cjs"), "utf8");
    const queueSource = backendSource.match(/function queueDiscoveryFetch\([\s\S]*?(?=\nfunction discoveryTaskProgressState\()/)?.[0];
    assert.ok(queueSource, "expected executable discovery queue helper");
    const queueHarness = new Function("path", "RECENT_FETCH_CURSORS_NAME", `
      const discoveryFetchQueues = new Map();
      ${queueSource}
      return { queueDiscoveryFetch, discoveryFetchQueues };
    `)(path, "recent-fetch-cursors.json");
    await assert.rejects(queueHarness.queueDiscoveryFetch({
      dataDir: tempDir,
      task: { fingerprint: payload.taskFingerprint }
    }, async () => { throw new Error("queued operation failed"); }), /queued operation failed/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(queueHarness.discoveryFetchQueues.size, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("resume skips complete sources and continues each incomplete source at nextPage", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-source-completion-cursor-"));
  const task = {
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["arxiv", "webofscience"],
    sourcePages: {
      arxiv: { nextPage: 2, complete: true },
      webofscience: { nextPage: 3, complete: false }
    }
  };
  let arxivCalls = 0;
  let webOfScienceStartPage;
  try {
    await writeRecentFetchCursor(task, tempDir);
    const payload = await fetchPaperPayload({
      dataDir: tempDir,
      refresh: true,
      mode: "recent",
      date: "2026-01-31",
      searchMode: task.searchMode,
      queryExpression: task.queryExpression,
      startDate: task.startDate,
      endDate: task.endDate,
      resumeMode: "resume",
      keywords: ["SIM"],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [] },
      sources: ["arXiv", "Web of Science"],
      fetchers: {
        arxiv: async () => { arxivCalls += 1; return []; },
        webofscience: async options => {
          webOfScienceStartPage = options.startPage;
          await options.onPageComplete({ page: 3, nextPage: 4, returned: 0, complete: true });
          return [];
        }
      },
      journalMetrics: { config: { enabled: false } }
    });

    assert.equal(arxivCalls, 0);
    assert.equal(webOfScienceStartPage, 3);
    assert.deepEqual(payload.sourceResults.map(result => result.source), ["arxiv", "webofscience"]);
    assert.deepEqual(await readRecentFetchCursors(tempDir), { tasks: {} });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("recent fetch cursor fingerprint is stable only for an identical frozen task", () => {
  const task = {
    searchMode: "direction",
    queryExpression: "SIM OR RIM",
    startDate: "2026-04-01",
    endDate: "2026-07-01",
    sources: ["webofscience", "arxiv"]
  };
  const fingerprint = buildDiscoveryTaskFingerprint(task);

  assert.equal(fingerprint, buildDiscoveryTaskFingerprint({
    ...task,
    queryExpression: " sim   or RIM ",
    sources: ["arxiv", "webofscience", "arxiv"]
  }));
  assert.notEqual(fingerprint, buildDiscoveryTaskFingerprint({ ...task, searchMode: "exact" }));
  assert.notEqual(fingerprint, buildDiscoveryTaskFingerprint({ ...task, queryExpression: "SIM AND RIM" }));
  assert.notEqual(fingerprint, buildDiscoveryTaskFingerprint({ ...task, startDate: "2026-04-02" }));
  assert.notEqual(fingerprint, buildDiscoveryTaskFingerprint({ ...task, endDate: "2026-07-02" }));
  assert.notEqual(fingerprint, buildDiscoveryTaskFingerprint({ ...task, sources: ["webofscience"] }));
});

test("recent fetch cursor writes, resumes and clears only the identical task", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-recent-cursor-"));
  try {
    const task = {
      searchMode: "direction",
      queryExpression: "SIM OR RIM",
      startDate: "2026-04-01",
      endDate: "2026-07-01",
      sources: ["webofscience", "arxiv"],
      sourcePages: {
        webofscience: { nextPage: 4, returned: 50, complete: false },
        arxiv: 3
      },
      apiKey: "must-not-be-persisted",
      headers: { "X-ApiKey": "must-not-be-persisted" }
    };
    const fingerprint = buildDiscoveryTaskFingerprint(task);

    await writeRecentFetchCursor(task, tempDir);
    const cursors = await readRecentFetchCursors(tempDir);
    assert.deepEqual(Object.keys(cursors.tasks), [fingerprint]);
    assert.equal(cursors.tasks[fingerprint].query, "SIM OR RIM");
    assert.deepEqual(cursors.tasks[fingerprint].sources, ["arxiv", "webofscience"]);
    assert.deepEqual(cursors.tasks[fingerprint].sourcePages, {
      arxiv: { nextPage: 3, complete: false },
      webofscience: { nextPage: 4, complete: false }
    });
    assert.ok(cursors.tasks[fingerprint].updatedAt);

    const sameFingerprint = buildDiscoveryTaskFingerprint({
      ...task,
      queryExpression: " sim  or rim ",
      sources: ["arxiv", "webofscience"]
    });
    const changedFingerprint = buildDiscoveryTaskFingerprint({ ...task, endDate: "2026-07-02" });
    assert.ok(cursors.tasks[sameFingerprint]);
    assert.equal(cursors.tasks[changedFingerprint], undefined);
    assert.doesNotMatch(await fs.readFile(path.join(tempDir, "recent-fetch-cursors.json"), "utf8"), /must-not-be-persisted/);

    await clearRecentFetchCursor(fingerprint, tempDir);
    assert.deepEqual(await readRecentFetchCursors(tempDir), { tasks: {} });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("recent fetch cursor keeps pages only for enabled sources", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-recent-cursor-sources-"));
  try {
    const task = {
      searchMode: "direction",
      queryExpression: "SIM",
      startDate: "2026-04-01",
      endDate: "2026-07-01",
      sources: ["arxiv"],
      sourcePages: {
        arxiv: { nextPage: 3 },
        webofscience: { nextPage: 4 }
      }
    };

    const cursor = await writeRecentFetchCursor(task, tempDir);
    assert.deepEqual(cursor.sourcePages, { arxiv: { nextPage: 3, complete: false } });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("concurrent cursor writes keep sibling source progress for one task", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-cursor-concurrent-"));
  const task = {
    searchMode: "direction",
    queryExpression: "SIM OR RIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["arxiv", "webofscience"]
  };
  try {
    await Promise.all([
      writeRecentFetchCursor({ ...task, sourcePages: { arxiv: { nextPage: 2, complete: true } } }, tempDir),
      writeRecentFetchCursor({ ...task, sourcePages: { webofscience: { nextPage: 5, complete: false } } }, tempDir)
    ]);

    const fingerprint = buildDiscoveryTaskFingerprint(task);
    assert.deepEqual((await readRecentFetchCursors(tempDir)).tasks[fingerprint].sourcePages, {
      arxiv: { nextPage: 2, complete: true },
      webofscience: { nextPage: 5, complete: false }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("concurrent cursor writes keep different fingerprints in the shared file", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-cursor-cross-task-"));
  const task = queryExpression => ({
    searchMode: "direction",
    queryExpression,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["arxiv"],
    sourcePages: { arxiv: { nextPage: 2, complete: false } }
  });
  const left = task("SIM");
  const right = task("RIM");
  try {
    await Promise.all([
      writeRecentFetchCursor(left, tempDir),
      writeRecentFetchCursor(right, tempDir)
    ]);

    const tasks = (await readRecentFetchCursors(tempDir)).tasks;
    assert.ok(tasks[buildDiscoveryTaskFingerprint(left)]);
    assert.ok(tasks[buildDiscoveryTaskFingerprint(right)]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("concurrent cursor clear and write preserve unrelated fingerprints", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-cursor-clear-write-"));
  const task = queryExpression => ({
    searchMode: "direction",
    queryExpression,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["arxiv"],
    sourcePages: { arxiv: { nextPage: 2, complete: false } }
  });
  const removed = task("SIM");
  const kept = task("RIM");
  const added = task("MP-SIM");
  try {
    await writeRecentFetchCursor(removed, tempDir);
    await writeRecentFetchCursor(kept, tempDir);
    await Promise.all([
      clearRecentFetchCursor(buildDiscoveryTaskFingerprint(removed), tempDir),
      writeRecentFetchCursor(added, tempDir)
    ]);

    const tasks = (await readRecentFetchCursors(tempDir)).tasks;
    assert.equal(tasks[buildDiscoveryTaskFingerprint(removed)], undefined);
    assert.ok(tasks[buildDiscoveryTaskFingerprint(kept)]);
    assert.ok(tasks[buildDiscoveryTaskFingerprint(added)]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("a failed cursor write does not block the next write for the same task", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-cursor-recovery-"));
  const cursorPath = path.join(tempDir, "recent-fetch-cursors.json");
  const task = {
    searchMode: "direction",
    queryExpression: "SIM",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    sources: ["arxiv"],
    sourcePages: { arxiv: { nextPage: 2, complete: false } }
  };
  try {
    await fs.mkdir(cursorPath);
    await assert.rejects(writeRecentFetchCursor(task, tempDir));
    await fs.rm(cursorPath, { recursive: true, force: true });
    await writeRecentFetchCursor(task, tempDir);
    const fingerprint = buildDiscoveryTaskFingerprint(task);
    assert.deepEqual((await readRecentFetchCursors(tempDir)).tasks[fingerprint].sourcePages, {
      arxiv: { nextPage: 2, complete: false }
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("WoS usage counts today, month, total and concurrent attempts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-usage-"));
  try {
    await recordWebOfScienceRequest({ status: "ok", at: "2026-07-01T01:00:00.000Z" }, tempDir);
    await recordWebOfScienceRequest({ status: "failed", at: "2026-07-02T01:00:00.000Z" }, tempDir);
    await recordWebOfScienceRequest({ status: "ok", at: "2026-08-01T01:00:00.000Z" }, tempDir);
    await Promise.all([
      recordWebOfScienceRequest({ status: "ok", at: "2026-08-02T01:00:00.000Z" }, tempDir),
      recordWebOfScienceRequest({ status: "failed", at: "2026-08-02T02:00:00.000Z" }, tempDir)
    ]);

    const usage = await readWebOfScienceUsage(tempDir, new Date("2026-08-02T12:00:00.000Z"));
    assert.equal(usage.todayCount, 2);
    assert.equal(usage.monthCount, 3);
    assert.equal(usage.totalCount, 5);
    assert.deepEqual(usage.months, { "2026-07": 2, "2026-08": 3 });
    assert.equal(usage.lastRequestAt, "2026-08-02T02:00:00.000Z");
    assert.equal(usage.lastStatus, "failed");
    assert.equal(usage.trackingStartedAt, "2026-07-01T01:00:00.000Z");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("WoS usage groups requests by the Asia Shanghai calendar day and month", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-usage-timezone-"));
  try {
    await recordWebOfScienceRequest({ status: "ok", at: "2026-06-30T16:30:00.000Z" }, tempDir);
    await recordWebOfScienceRequest({ status: "failed", at: "2026-06-30T17:00:00.000Z" }, tempDir);

    const usage = await readWebOfScienceUsage(tempDir, new Date("2026-07-01T00:30:00.000Z"));
    assert.equal(usage.todayCount, 2);
    assert.equal(usage.monthCount, 2);
    assert.deepEqual(usage.months, { "2026-07": 2 });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("WoS usage recovers after a rejected write across data directories and upgrades the no-days shape", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-usage-recovery-"));
  const recoveredDir = path.join(tempRoot, "recovered");
  const legacyDir = path.join(tempRoot, "legacy");
  try {
    await fs.writeFile(recoveredDir, "not a directory", "utf8");
    await assert.rejects(
      recordWebOfScienceRequest({ status: "failed", at: "2026-07-01T01:00:00.000Z" }, recoveredDir)
    );

    await fs.rm(recoveredDir);
    await recordWebOfScienceRequest({ status: "ok", at: "2026-07-02T01:00:00.000Z" }, recoveredDir);
    assert.equal((await readWebOfScienceUsage(recoveredDir)).totalCount, 1);

    await fs.mkdir(legacyDir);
    const shippedShape = await fs.readFile(
      path.join(__dirname, "..", "data", "papers", "web-of-science-usage.example.json"),
      "utf8"
    );
    await fs.writeFile(path.join(legacyDir, "web-of-science-usage.json"), shippedShape, "utf8");
    assert.equal((await readWebOfScienceUsage(legacyDir, new Date("2026-07-03T12:00:00.000Z"))).todayCount, 0);

    await recordWebOfScienceRequest({ status: "ok", at: "2026-07-03T01:00:00.000Z" }, legacyDir);
    const usage = await readWebOfScienceUsage(legacyDir, new Date("2026-07-03T12:00:00.000Z"));
    assert.equal(usage.todayCount, 1);
    assert.equal(usage.totalCount, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("WoS usage records each successful and failed HTTP attempt without request details", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-wos-http-usage-"));
  const config = {
    enabled: true,
    endpoint: "https://api.clarivate.test/apis/wos-starter/v1/documents",
    apiKey: "wos-secret-key",
    databaseId: "WOS",
    maxPages: 1,
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
  };

  try {
    await fetchWebOfSciencePapers(["structured illumination microscopy"], {
      config,
      dataDir: tempDir,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ hits: [] }) })
    });
    await assert.rejects(fetchWebOfSciencePapers(["structured illumination microscopy"], {
      config,
      dataDir: tempDir,
      fetchImpl: async () => ({ ok: false, status: 429 })
    }), /HTTP 429/);
    await assert.rejects(fetchWebOfSciencePapers(["structured illumination microscopy"], {
      config,
      dataDir: tempDir,
      fetchImpl: async () => { throw new Error("network unavailable"); }
    }), /network unavailable/);

    const usage = await readWebOfScienceUsage(tempDir);
    assert.equal(usage.totalCount, 3);
    assert.equal(usage.lastStatus, "failed");
    const persisted = await fs.readFile(path.join(tempDir, "web-of-science-usage.json"), "utf8");
    assert.doesNotMatch(persisted, /wos-secret-key|structured illumination microscopy|X-ApiKey/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

test("boolean search logic joins a connected AND component and an independent keyword with OR", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-search-logic-"));
  const configFile = path.join(tempDir, "config.json");
  try {
    await writeUserConfig({
      keywords: {
        primary: [{ text: "SIM", enabled: true }, { text: "super-resolution", enabled: true }],
        secondary: [{ text: "microscopy", enabled: true }, { text: "RIM", enabled: true }],
        inspiration: []
      },
      sources: [],
      searchLogic: {
        activeKeywords: ["RIM"],
        andEdges: [["SIM", "super-resolution"], ["super-resolution", "microscopy"]]
      }
    }, configFile);
    const saved = (await readUserState({ configFile })).config.searchLogic;
    assert.equal(buildSearchExpression(saved), "(SIM AND super-resolution AND microscopy) OR RIM");
    assert.equal(paperMatchesSearchLogic({ title: "RIM reconstruction" }, saved), true);
    assert.equal(paperMatchesSearchLogic({ title: "SIM super-resolution", tags: ["microscopy"] }, saved), true);
    assert.equal(paperMatchesSearchLogic({ title: "SIM without all paired terms" }, saved), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("boolean search logic matches acronym expansions without changing AND OR semantics", () => {
  assert.equal(paperMatchesSearchLogic({
    title: "Structured illumination microscopy reconstruction"
  }, {
    activeKeywords: ["SIM"],
    andEdges: []
  }), true);
  assert.equal(paperMatchesSearchLogic({
    title: "Structured illumination microscopy reconstruction"
  }, {
    activeKeywords: ["SIM", "microscopy"],
    andEdges: [["SIM", "microscopy"]]
  }), true);
  assert.equal(paperMatchesSearchLogic({
    title: "Structured illumination reconstruction"
  }, {
    activeKeywords: ["SIM", "microscopy"],
    andEdges: [["SIM", "microscopy"]]
  }), false);
});

test("explicitly clear search logic survives user config round trip", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-clear-search-logic-"));
  const configFile = path.join(tempDir, "config.json");
  try {
    await writeUserConfig({
      keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [], inspiration: [] },
      sources: [],
      searchLogic: { activeKeywords: [], andEdges: [] }
    }, configFile);
    const saved = (await readUserState({ configFile })).config.searchLogic;
    assert.deepEqual(saved, { activeKeywords: [], andEdges: [] });
    assert.equal(buildSearchExpression(saved), "");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("legacy user config activates enabled keywords but not disabled keywords", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-legacy-search-logic-"));
  const configFile = path.join(tempDir, "config.json");
  try {
    await fs.writeFile(configFile, JSON.stringify({
      keywords: {
        primary: [{ text: "SIM", enabled: true }],
        secondary: [{ text: "disabled RIM", enabled: false }],
        inspiration: []
      },
      sources: []
    }), "utf8");
    const saved = (await readUserState({ configFile })).config.searchLogic;
    assert.deepEqual(saved.activeKeywords, ["SIM"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("search logic removes active keywords and incident edges when keywords no longer exist", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-clean-search-logic-"));
  const configFile = path.join(tempDir, "config.json");
  try {
    await writeUserConfig({
      keywords: {
        primary: [{ text: "SIM", enabled: true }],
        secondary: [{ text: "RIM", enabled: true }],
        inspiration: []
      },
      sources: [],
      searchLogic: {
        activeKeywords: ["SIM", "deleted keyword"],
        andEdges: [["SIM", "deleted keyword"], ["SIM", "RIM"]]
      }
    }, configFile);
    const saved = (await readUserState({ configFile })).config.searchLogic;
    assert.deepEqual(saved, {
      activeKeywords: ["SIM"],
      andEdges: [["SIM", "RIM"]]
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("search logic survives local data zip export and import", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-search-logic-zip-"));
  const sourceDataDir = path.join(tempDir, "source-data");
  const sourceConfigFile = path.join(tempDir, "source-user", "config.json");
  const targetDataDir = path.join(tempDir, "target-data");
  const targetConfigFile = path.join(tempDir, "target-user", "config.json");
  try {
    const searchLogic = {
      activeKeywords: ["RIM"],
      andEdges: [["SIM", "microscopy"]]
    };
    await writeUserConfig({
      keywords: {
        primary: [{ text: "SIM", enabled: true }],
        secondary: [{ text: "microscopy", enabled: true }, { text: "RIM", enabled: true }],
        inspiration: []
      },
      sources: [],
      searchLogic
    }, sourceConfigFile);
    const zip = await exportLocalDataZip({ dataDir: sourceDataDir, userConfigFile: sourceConfigFile });
    await importLocalDataZip(zip, { dataDir: targetDataDir, userConfigFile: targetConfigFile });
    const saved = (await readUserState({ configFile: targetConfigFile })).config.searchLogic;
    assert.deepEqual(saved, searchLogic);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

test("zip import rejects an unsupported manifest before writing any local files", async () => {
  const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-zip-version-source-"));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-zip-version-target-"));
  const userDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-zip-version-user-"));
  const targetConfigFile = path.join(userDir, "target-config.json");
  try {
    await fs.writeFile(path.join(sourceDir, "archive.json"), JSON.stringify({
      mode: "archive",
      papers: [{ id: "must-not-import", title: "Must not import" }]
    }), "utf8");
    await fs.writeFile(path.join(sourceDir, "web-of-science-usage.json"), JSON.stringify({
      totalCount: 9,
      months: { "2026-07": 9 },
      days: { "2026-07-13": 9 }
    }), "utf8");
    await writeUserConfig({
      keywords: { primary: [{ text: "MUST-NOT-WRITE", enabled: true }], secondary: [], inspiration: [] },
      sources: []
    }, path.join(userDir, "source-config.json"));

    const exported = await exportLocalDataZip({
      dataDir: sourceDir,
      userConfigFile: path.join(userDir, "source-config.json"),
      includeStats: true
    });
    const entries = parseZipEntries(exported);
    const manifest = JSON.parse(entries["paperhot-local-data.json"].toString("utf8"));
    entries["paperhot-local-data.json"] = Buffer.from(JSON.stringify({ ...manifest, version: 999 }), "utf8");
    const unsupportedZip = buildStoredZip(entries);

    await assert.rejects(
      importLocalDataZip(unsupportedZip, { dataDir: targetDir, userConfigFile: targetConfigFile }),
      /不支持的本地数据备份版本/
    );
    await assert.rejects(fs.readFile(targetConfigFile, "utf8"));
    await assert.rejects(fs.readFile(path.join(targetDir, "archive.json"), "utf8"));
    await assert.rejects(fs.readFile(path.join(targetDir, "web-of-science-usage.json"), "utf8"));
    await assert.rejects(fs.readFile(path.join(targetDir, "operation-log.jsonl"), "utf8"));
  } finally {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
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
      keywords: { primary: [{ text: "SIM", enabled: true }], secondary: [{ text: "microscopy", enabled: true }], inspiration: [] },
      sources: [],
      searchLogic: { activeKeywords: ["SIM"], andEdges: [["SIM", "microscopy"]] }
    }, path.join(userDir, "config.json"));
    await writeUserProfile({
      name: "Local Researcher",
      researchArea: "Private Research Area",
      background: "Private background"
    }, path.join(userDir, "profile.json"));
    await fs.writeFile(path.join(userDir, "academic-apis.json"), JSON.stringify({
      contactEmail: "private@example.org"
    }), "utf8");
    await fs.writeFile(path.join(userDir, "openalex.json"), JSON.stringify({ enabled: true, apiKey: "oa-private" }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json"),
      academicApisConfigFile: path.join(userDir, "academic-apis.json"),
      openAlexConfigFile: path.join(userDir, "openalex.json")
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
    assert.deepEqual(JSON.parse(entries["data/user/config.json"].toString("utf8")).searchLogic, {
      activeKeywords: ["SIM"],
      andEdges: [["SIM", "microscopy"]]
    });
    assert.equal(JSON.parse(entries["data/papers/archive.json"].toString("utf8")).papers[0].doi, "10.1000/exportzip");
    assert.equal(entries["data/user/profile.json"], undefined);
    assert.equal(entries["config/llm.json"], undefined);
    assert.equal(entries["config/academic-apis.json"], undefined);
    assert.equal(entries["config/openalex.json"], undefined);
    assert.equal(entries["data/papers/fetch-log.json"], undefined);
    assert.equal(entries["data/papers/operation-log.jsonl"], undefined);
    assert.equal(entries["data/papers/journal-metrics-cache.json"], undefined);
    assert.equal(entries["data/papers/web-of-science-usage.json"], undefined);
    assert.equal(entries["data/papers/recent-fetch-cursors.json"], undefined);
    assert.equal(serialized.includes("apiKey"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("should-not-export"), false);
    assert.equal(serialized.includes("shouldNotExportToken123456"), false);
    assert.equal(serialized.includes("private@example.org"), false);
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
    await fs.writeFile(path.join(tempDir, "web-of-science-usage.json"), `${JSON.stringify({
      trackingStartedAt: "2026-06-01T00:00:00.000Z",
      totalCount: 7,
      months: { "2026-06": 7 },
      days: { "2026-06-25": 2 },
      lastRequestAt: "2026-06-25T01:00:00.000Z",
      lastStatus: "ok"
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(tempDir, "recent-fetch-cursors.json"), `${JSON.stringify({
      tasks: { privateFingerprint: { queryExpression: "must-not-export", sourcePages: { webofscience: { nextPage: 3 } } } }
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
    assert.ok(entries["data/papers/web-of-science-usage.json"]);
    assert.equal(entries["data/papers/recent-fetch-cursors.json"], undefined);
    assert.ok(entries["data/papers/2026-06-25.json"]);
    assert.equal(JSON.parse(entries["data/papers/google-rolling-cursors.json"].toString("utf8")).cursors["SIM::googlescholar"].nextStart, 200);
    assert.equal(JSON.parse(entries["data/papers/web-of-science-usage.json"].toString("utf8")).days["2026-06-25"], 2);

    const targetDir = path.join(tempDir, "imported");
    const imported = await importLocalDataZip(zip, { dataDir: targetDir, userConfigFile: path.join(userDir, "imported-config.json") });
    assert.ok(imported.imported.includes("webOfScienceUsage"));
    assert.equal((await readWebOfScienceUsage(targetDir, new Date("2026-06-25T12:00:00.000Z"))).todayCount, 2);
    await assert.rejects(fs.readFile(path.join(targetDir, "recent-fetch-cursors.json"), "utf8"));
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
    await fs.writeFile(path.join(userDir, "firecrawl.json"), JSON.stringify({
      enabled: true,
      apiKey: "firecrawl-private-key"
    }), "utf8");
    await fs.writeFile(path.join(userDir, "academic-apis.json"), JSON.stringify({
      contactEmail: "researcher@example.org"
    }), "utf8");
    await fs.writeFile(path.join(userDir, "openalex.json"), JSON.stringify({ enabled: true, apiKey: "openalex-private-key" }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: tempDir,
      userConfigFile: path.join(userDir, "config.json"),
      userProfileFile: path.join(userDir, "profile.json"),
      llmConfigFile: path.join(userDir, "llm.json"),
      googleScholarConfigFile: path.join(userDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(userDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(userDir, "web-of-science.json"),
      firecrawlConfigFile: path.join(userDir, "firecrawl.json"),
      openAlexConfigFile: path.join(userDir, "openalex.json"),
      academicApisConfigFile: path.join(userDir, "academic-apis.json"),
      includeProfile: true,
      includeSecrets: true
    });
    const entries = parseZipEntries(zip);

    assert.equal(JSON.parse(entries["data/user/profile.json"].toString("utf8")).background, "Private background");
    assert.equal(JSON.parse(entries["config/llm.json"].toString("utf8")).apiKey, "sk-private-llm-key-123456");
    assert.equal(JSON.parse(entries["config/google-scholar.json"].toString("utf8")).apiKey, "serp-private-key");
    assert.equal(JSON.parse(entries["config/journal-metrics.json"].toString("utf8")).apiKey, "easyscholar-private-key");
    assert.equal(JSON.parse(entries["config/web-of-science.json"].toString("utf8")).apiKey, "wos-private-key");
    assert.equal(JSON.parse(entries["config/firecrawl.json"].toString("utf8")).apiKey, "firecrawl-private-key");
    assert.equal(JSON.parse(entries["config/openalex.json"].toString("utf8")).apiKey, "openalex-private-key");
    assert.equal(JSON.parse(entries["config/academic-apis.json"].toString("utf8")).contactEmail, "researcher@example.org");
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
    await fs.writeFile(path.join(sourceUserDir, "firecrawl.json"), JSON.stringify({ enabled: true, apiKey: "imported-firecrawl-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "openalex.json"), JSON.stringify({ enabled: true, apiKey: "imported-openalex-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "academic-apis.json"), JSON.stringify({ contactEmail: "researcher@example.org" }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: sourceDir,
      userConfigFile: path.join(sourceUserDir, "config.json"),
      llmConfigFile: path.join(sourceUserDir, "llm.json"),
      googleScholarConfigFile: path.join(sourceUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(sourceUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(sourceUserDir, "web-of-science.json"),
      firecrawlConfigFile: path.join(sourceUserDir, "firecrawl.json"),
      openAlexConfigFile: path.join(sourceUserDir, "openalex.json"),
      academicApisConfigFile: path.join(sourceUserDir, "academic-apis.json"),
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
    await assert.rejects(fs.readFile(path.join(targetUserDir, "openalex.json"), "utf8"));
    await assert.rejects(fs.readFile(path.join(targetUserDir, "academic-apis.json"), "utf8"));
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
    await fs.writeFile(path.join(sourceUserDir, "firecrawl.json"), JSON.stringify({ enabled: true, apiKey: "imported-firecrawl-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "openalex.json"), JSON.stringify({ enabled: true, apiKey: "imported-openalex-secret" }), "utf8");
    await fs.writeFile(path.join(sourceUserDir, "academic-apis.json"), JSON.stringify({ contactEmail: "researcher@example.org" }), "utf8");

    const zip = await exportLocalDataZip({
      dataDir: sourceDir,
      userConfigFile: path.join(sourceUserDir, "config.json"),
      llmConfigFile: path.join(sourceUserDir, "llm.json"),
      googleScholarConfigFile: path.join(sourceUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(sourceUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(sourceUserDir, "web-of-science.json"),
      firecrawlConfigFile: path.join(sourceUserDir, "firecrawl.json"),
      openAlexConfigFile: path.join(sourceUserDir, "openalex.json"),
      academicApisConfigFile: path.join(sourceUserDir, "academic-apis.json"),
      includeSecrets: true
    });
    const imported = await importLocalDataZip(zip, {
      dataDir: targetDir,
      userConfigFile: path.join(targetUserDir, "config.json"),
      llmConfigFile: path.join(targetUserDir, "llm.json"),
      googleScholarConfigFile: path.join(targetUserDir, "google-scholar.json"),
      journalMetricsConfigFile: path.join(targetUserDir, "journal-metrics.json"),
      webOfScienceConfigFile: path.join(targetUserDir, "web-of-science.json"),
      firecrawlConfigFile: path.join(targetUserDir, "firecrawl.json"),
      openAlexConfigFile: path.join(targetUserDir, "openalex.json"),
      academicApisConfigFile: path.join(targetUserDir, "academic-apis.json"),
      allowSecrets: true
    });

    assert.equal(imported.imported.includes("integrations"), true);
    assert.deepEqual(imported.skipped, []);
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "llm.json"), "utf8")).apiKey, "imported-llm-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "google-scholar.json"), "utf8")).apiKey, "imported-serp-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "journal-metrics.json"), "utf8")).apiKey, "imported-easy-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "web-of-science.json"), "utf8")).apiKey, "imported-wos-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "firecrawl.json"), "utf8")).apiKey, "imported-firecrawl-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "openalex.json"), "utf8")).apiKey, "imported-openalex-secret");
    assert.equal(JSON.parse(await fs.readFile(path.join(targetUserDir, "academic-apis.json"), "utf8")).contactEmail, "researcher@example.org");
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
    assert.deepEqual(imported.imported.sort(), ["archive", "favorites", "fetchLog", "googleRollingCursors", "journalMetricsCache", "llmModelPoolState", "notes", "operationLog", "userConfig", "userProfile", "webOfScienceUsage"].sort());
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
  const currentDay = todayString();
  const currentMonth = currentDay.slice(0, 7);
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
  await fs.writeFile(path.join(tempDir, "web-of-science-usage.json"), JSON.stringify({
    trackingStartedAt: "2026-07-01T00:00:00.000Z",
    totalCount: 5,
    months: { [currentMonth]: 5 },
    days: { [currentDay]: 2 },
    lastRequestAt: "2026-07-13T01:00:00.000Z",
    lastStatus: "ok"
  }), "utf8");

  const config = await readWebOfScienceConfig(webOfScienceConfigFile);
  const integrations = await readIntegrationConfigs({
    dataDir: tempDir,
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
  assert.equal(integrations.webOfScience.usage.todayCount, 2);
  assert.equal(integrations.webOfScience.usage.monthCount, 5);
  assert.equal(integrations.webOfScience.usage.totalCount, 5);
  assert.doesNotMatch(JSON.stringify(integrations.webOfScience.usage), /wos-private-key/);
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
    { doi: "", url: "https://x.test/t", title: "Archive Matched By Title", year: 2020 }
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

test("rankLineageNodes only uses title archive fallback when identifiers or years are compatible", () => {
  const node = (doi, title, year) => ({ doi, openAlexId: "", semanticScholarId: "", title, year, published: "", journal: "", abstract: "", citationCount: 1, authors: [], isInfluential: false });
  const ranked = rankLineageNodes([
    node("10.1/external", "Shared Generic Title", 2020),
    node("", "Same Title Different Year", 2021),
    node("", "Valid Title Fallback", 2022),
    node("10.1/known-node", "Archive Missing Identifier", 2023),
    node("", "Missing Year Can Fallback", null)
  ], [
    { id: "archive-different-doi", doi: "10.1/archive", title: "Shared Generic Title", year: 2020 },
    { id: "archive-different-year", doi: "", title: "Same Title Different Year", year: 2019 },
    { id: "archive-valid-title", doi: "", title: "Valid Title Fallback", year: 2022 },
    { id: "archive-missing-identifier", doi: "", title: "Archive Missing Identifier", year: 2023 },
    { id: "archive-missing-year", doi: "", title: "Missing Year Can Fallback", year: 2017 }
  ], 10);
  const byTitle = new Map(ranked.map(entry => [entry.title, entry]));
  assert.equal(byTitle.get("Shared Generic Title").inArchive, false, "两个非空 DOI 不同时不能按标题误配本地论文");
  assert.equal(byTitle.get("Same Title Different Year").inArchive, false, "双方年份非空且不同时不能按标题误配");
  assert.equal(byTitle.get("Valid Title Fallback").archiveKey, "archive-valid-title", "缺少标识且标题/年份兼容时仍可回退匹配");
  assert.equal(byTitle.get("Archive Missing Identifier").archiveKey, "archive-missing-identifier", "归档侧缺少 DOI 时可用标题/年份回退");
  assert.equal(byTitle.get("Missing Year Can Fallback").archiveKey, "archive-missing-year", "一侧年份缺失时保留合理标题回退");
});

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

test("buildPaperLineage re-ranks against the current archive on every cache hit instead of freezing inArchive status", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-fresh-archive-"));
  try {
    const archiveFile = path.join(tempDir, "archive.json");
    await fs.writeFile(archiveFile, JSON.stringify({
      mode: "archive", papers: [{ id: "local-main", doi: "10.1234/main", title: "Main paper" }]
    }), "utf8");
    let fetchCalls = 0;
    const options = {
      dataDir: tempDir, skipCache: false,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        fetchCalls += 1;
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar")) {
          if (target.includes("/references")) return { ok: true, status: 200, json: async () => ({ data: [
            { isInfluential: false, citedPaper: { paperId: "s2-p", title: "Ref A", year: 2020, venue: "", abstract: "", citationCount: 3, externalIds: { DOI: "10.1234/w2" }, authors: [] } }
          ] }) };
          return { ok: true, status: 200, json: async () => ({ data: [] }) };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }
    };
    const first = await buildPaperLineage("10.1234/main", options);
    assert.equal(first.predecessors[0].inArchive, false, "首次抓取时 Ref A 尚未入库");
    const callsAfterFirst = fetchCalls;

    await fs.writeFile(archiveFile, JSON.stringify({
      mode: "archive", papers: [
        { id: "local-main", doi: "10.1234/main", title: "Main paper" },
        { id: "local-ref", doi: "10.1234/w2", title: "Ref A" }
      ]
    }), "utf8");
    const second = await buildPaperLineage("10.1234/main", options);
    assert.equal(second.predecessors[0].inArchive, true, "缓存命中后仍需按最新论文库重新排名");
    assert.equal(second.predecessors[0].archiveKey, "local-ref");
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
          { isInfluential: false, citedPaper: { paperId: "p", title: "Only S2 ref", year: 2019, venue: "", abstract: "", citationCount: 9, externalIds: { DOI: "10.2/only-s2-ref" }, authors: [] } }
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

test("buildPaperLineage returns empty lineage for an unarchived OpenAlex work id but not-found for other unknown keys", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-workid-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({ mode: "archive", papers: [] }), "utf8");
    const byWorkId = await buildPaperLineage("W2241997964", { dataDir: tempDir, fetchImpl: async () => { throw new Error("不应发请求"); } });
    assert.equal(byWorkId.ok, true);
    assert.equal(byWorkId.reason, "no-doi");
    assert.equal(byWorkId.center.key, "w2241997964");
    assert.deepEqual(byWorkId.predecessors, []);
    assert.deepEqual(byWorkId.successors, []);
    const stillMissing = await buildPaperLineage("totally-unknown-key", { dataDir: tempDir });
    assert.equal(stillMissing.ok, false);
    assert.equal(stillMissing.error, "not-found");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("buildPaperLineage ignores a well-formed pre-migration cache file lacking the version stamp and refetches", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-premigration-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
      mode: "archive", papers: [{ id: "local-main", doi: "10.1234/main", title: "Main paper" }]
    }), "utf8");
    await fs.mkdir(path.join(tempDir, "lineage"), { recursive: true });
    // 模拟旧版本缓存：结构完整、ok:true、且带有已排名字段（inArchive/archiveKey），
    // 但没有新的 version 字段。必须被当作缓存未命中处理，不能崩溃或直接返回这份陈旧数据。
    const staleRankedPayload = {
      ok: true,
      center: { title: "Stale cached title", doi: "10.1234/main", key: "local-main" },
      predecessors: [{
        doi: "10.9/stale", openAlexId: "", semanticScholarId: "", title: "Stale predecessor",
        year: 1999, published: "", journal: "", abstract: "stale", citationCount: 1, authors: [],
        isInfluential: false, inArchive: false, archiveKey: ""
      }],
      successors: [],
      sources: ["openalex"],
      fetchedAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(tempDir, "lineage", lineageCacheFileName("10.1234/main")), JSON.stringify(staleRankedPayload), "utf8");
    const options = {
      dataDir: tempDir,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar") && target.includes("/references")) return { ok: true, status: 200, json: async () => ({ data: [
          { isInfluential: false, citedPaper: { paperId: "p", title: "Fresh ref after migration", year: 2020, venue: "", abstract: "", citationCount: 1, externalIds: { DOI: "10.2/fresh-after-migration" }, authors: [] } }
        ] }) };
        if (target.includes("semanticscholar")) return { ok: true, status: 200, json: async () => ({ data: [] }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    };
    const result = await buildPaperLineage("10.1234/main", options);
    assert.equal(result.ok, true);
    assert.equal(result.predecessors[0].title, "Fresh ref after migration", "无 version 字段的旧格式缓存必须被忽略并重新拉取，而不是直接返回陈旧数据");
    const rewritten = JSON.parse(await fs.readFile(path.join(tempDir, "lineage", lineageCacheFileName("10.1234/main")), "utf8"));
    assert.equal(rewritten.version, 3, "重新拉取后写盘的缓存必须带上当前版本号");
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
          { isInfluential: false, citedPaper: { paperId: "p", title: "Fresh ref", year: 2020, venue: "", abstract: "", citationCount: 1, externalIds: { DOI: "10.2/fresh-ref" }, authors: [] } }
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

test("buildPaperLineage builds lineage for a bare DOI not in archive using semantic scholar when openalex fails", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-bare-doi-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({
      mode: "archive", papers: [{ id: "unrelated-paper", doi: "10.1111/unrelated", title: "Unrelated paper" }]
    }), "utf8");
    const result = await buildPaperLineage("10.7777/external", {
      dataDir: tempDir,
      skipCache: true,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar") && target.includes("/references")) {
          return { ok: true, status: 200, json: async () => ({ data: [
            { isInfluential: false, citedPaper: { paperId: "p", title: "External ref", year: 2019, venue: "ICML", abstract: "", citationCount: 15, externalIds: { DOI: "10.5/ref" }, authors: [] } }
          ] }) };
        }
        if (target.includes("semanticscholar")) return { ok: true, status: 200, json: async () => ({ data: [] }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.center.doi, "10.7777/external");
    assert.ok(result.predecessors.length > 0);
    assert.equal(result.predecessors[0].title, "External ref");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("lookupLineageNodeByTitle finds an exact title match on OpenAlex and merges richer fields", async () => {
  const title = "A garbage title that only openalex indexes precisely";
  const fetchImpl = async (url) => {
    const target = String(url instanceof URL ? url.href : url);
    if (target.includes("title.search")) {
      return { ok: true, status: 200, json: async () => ({ results: [
        {
          id: "https://openalex.org/W555", doi: "https://doi.org/10.9/found", title,
          publication_year: 2018, cited_by_count: 40,
          authorships: [{ author: { display_name: "A. Author" } }],
          primary_location: { source: { display_name: "Nature" } }, referenced_works: []
        }
      ] }) };
    }
    if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [] } }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const result = await lookupLineageNodeByTitle(title, {
    fetchImpl,
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" }
  });
  assert.ok(result, "应在 OpenAlex 精确命中带 DOI 的结果");
  assert.equal(result.doi, "10.9/found");
  assert.equal(result.journal, "Nature");
  assert.deepEqual(result.authors, ["A. Author"]);
});

test("lookupLineageNodeByTitle falls back to Crossref when OpenAlex has no exact match", async () => {
  const title = "Only crossref indexes this exact title";
  const fetchImpl = async (url) => {
    const target = String(url instanceof URL ? url.href : url);
    if (target.includes("title.search")) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    if (target.includes("query.bibliographic")) {
      return { ok: true, status: 200, json: async () => ({ message: { items: [
        {
          DOI: "10.11/crossref-found", title: [title], "container-title": ["Optica"],
          author: [{ given: "B.", family: "Person" }], published: { "date-parts": [[2021, 3]] }
        }
      ] } }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const result = await lookupLineageNodeByTitle(title, {
    fetchImpl,
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" }
  });
  assert.ok(result, "OpenAlex 查不到时应接受 Crossref 的精确匹配");
  assert.equal(result.doi, "10.11/crossref-found");
  assert.equal(result.journal, "Optica");
});

test("lookupLineageNodeByTitle returns null when neither source has the title (garbage PDF-parse entry)", async () => {
  const title = "Correspondence and requests for materials should be addressed to";
  const fetchImpl = async (url) => {
    const target = String(url instanceof URL ? url.href : url);
    if (target.includes("title.search")) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [] } }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const result = await lookupLineageNodeByTitle(title, {
    fetchImpl,
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" }
  });
  assert.equal(result, null, "两个信源都查不到时必须返回 null，不能伪造补全");
});

test("lookupLineageNodeByTitle rejects a near match that only differs by a suffix", async () => {
  const title = "Deep learning enables cross-domain super-resolution";
  const candidateTitle = `${title} Supplementary Information`;
  const fetchImpl = async (url) => {
    const target = String(url instanceof URL ? url.href : url);
    if (target.includes("title.search")) {
      return { ok: true, status: 200, json: async () => ({ results: [
        {
          id: "https://openalex.org/W1", doi: "10.1/near", title: candidateTitle,
          publication_year: 2022, cited_by_count: 1, authorships: [], primary_location: {}, referenced_works: []
        }
      ] }) };
    }
    if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [] } }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const result = await lookupLineageNodeByTitle(title, {
    fetchImpl,
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" }
  });
  assert.equal(result, null, "标题只是近似（多了后缀）时应视为未找到，避免误配");
});

test("lookupLineageNodeByTitle still returns a match when one source throws", async () => {
  const title = "Resilient title lookup despite one source failing";
  const fetchImpl = async (url) => {
    const target = String(url instanceof URL ? url.href : url);
    if (target.includes("title.search")) throw new Error("openalex down");
    if (target.includes("query.bibliographic")) {
      return { ok: true, status: 200, json: async () => ({ message: { items: [
        { DOI: "10.22/resilient", title: [title], "container-title": ["Cell"], author: [], published: { "date-parts": [[2020]] } }
      ] } }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const result = await lookupLineageNodeByTitle(title, {
    fetchImpl,
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" }
  });
  assert.ok(result, "一个信源抛错时另一个仍应能补全");
  assert.equal(result.doi, "10.22/resilient");
});

test("enrichLineageNodesWithoutIdentifiers only looks up up to LINEAGE_TITLE_LOOKUP_LIMIT nodes missing identifiers", async () => {
  const withDoi = {
    doi: "10.1/has-doi", openAlexId: "", semanticScholarId: "s1", title: "Already identified paper",
    year: 2020, published: "", journal: "", abstract: "", citationCount: 5, authors: [], isInfluential: false
  };
  const missingNodes = Array.from({ length: 12 }, (_, i) => ({
    doi: "", openAlexId: "", semanticScholarId: `s2-${i}`, title: `Missing identifier paper number ${i}`,
    year: 2019, published: "", journal: "", abstract: "", citationCount: 3, authors: [], isInfluential: false
  }));
  let fetchCalls = 0;
  const fetchImpl = async (url) => {
    fetchCalls += 1;
    // URL 查询串把空格编码成 +，decodeURIComponent 不还原，需要手动转回来才能取到序号
    const target = decodeURIComponent(String(url instanceof URL ? url.href : url)).replace(/\+/g, " ");
    const indexMatch = target.match(/Missing identifier paper number (\d+)/);
    const index = indexMatch ? Number(indexMatch[1]) : -1;
    if (target.includes("title.search")) {
      return { ok: true, status: 200, json: async () => ({ results: [
        {
          id: `https://openalex.org/W${index}`, doi: `10.5/missing-${index}`,
          title: `Missing identifier paper number ${index}`, publication_year: 2019, cited_by_count: 2,
          authorships: [], primary_location: {}, referenced_works: []
        }
      ] }) };
    }
    if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [] } }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const nodes = [withDoi, ...missingNodes];
  const result = await enrichLineageNodesWithoutIdentifiers(nodes, {
    fetchImpl,
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" }
  });
  assert.equal(result.length, nodes.length, "补全后节点数量和顺序都不能变化");
  assert.equal(result[0].doi, "10.1/has-doi", "已有 doi 的节点不应被重新查询");
  for (let i = 1; i <= 10; i += 1) {
    assert.equal(result[i].doi, `10.5/missing-${i - 1}`, `第 ${i - 1} 个缺失节点应在上限内被补全`);
  }
  assert.equal(result[1].citationCount, 3, "合并时应保留原有更优的 citationCount，而不是被补全值覆盖");
  assert.equal(result[11].doi, "", "第 11 个缺失节点超出上限，不应发起补全请求");
  assert.equal(result[12].doi, "", "第 12 个缺失节点超出上限，不应发起补全请求");
  assert.equal(fetchCalls, 20, "只有前 10 个缺失节点应并行发起 OpenAlex + Crossref 两路请求");
});

test("buildPaperLineage enriches predecessors lacking identifiers when possible and drops the rest, end to end", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-enrich-e2e-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({ mode: "archive", papers: [] }), "utf8");
    const garbageTitle = "Correspondence and requests for materials should be addressed to";
    const options = {
      dataDir: tempDir, skipCache: true,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar")) {
          if (target.includes("/references")) return { ok: true, status: 200, json: async () => ({ data: [
            { isInfluential: false, citedPaper: { paperId: "s2-garbage", title: garbageTitle, year: null, venue: "", abstract: "", citationCount: 12403, externalIds: {}, authors: [] } },
            { isInfluential: true, citedPaper: { paperId: "s2-real", title: "A real foundational paper", year: 2010, venue: "Nature Methods", abstract: "", citationCount: 300, externalIds: { DOI: "10.1/real-foundation" }, authors: [{ name: "R. Author" }] } }
          ] }) };
          return { ok: true, status: 200, json: async () => ({ data: [] }) };
        }
        if (target.includes("title.search")) return { ok: true, status: 200, json: async () => ({ results: [] }) };
        if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [] } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    };
    const result = await buildPaperLineage("10.1234/enrich-main", options);
    assert.equal(result.ok, true);
    assert.ok(
      !result.predecessors.some(node => node.title === garbageTitle),
      "缺少标识且两个信源都补不到 DOI 的伪条目应被排除"
    );
    assert.ok(
      result.predecessors.some(node => node.doi === "10.1/real-foundation"),
      "真正的带 DOI 前置论文不应被误删"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("buildPaperLineage re-merges duplicate DOI nodes after identifier enrichment", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-lineage-enrich-dedupe-"));
  try {
    await fs.writeFile(path.join(tempDir, "archive.json"), JSON.stringify({ mode: "archive", papers: [] }), "utf8");
    const title = "Rescued duplicate foundational paper";
    const options = {
      dataDir: tempDir, skipCache: true,
      config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
      academicApis: { contactEmail: "" },
      fetchImpl: async (url) => {
        const target = String(url instanceof URL ? url.href : url);
        if (target.includes("semanticscholar")) {
          if (target.includes("/references")) return { ok: true, status: 200, json: async () => ({ data: [
            { isInfluential: false, citedPaper: { paperId: "s2-identified", title, year: 2015, venue: "", abstract: "short", citationCount: 5, externalIds: { DOI: "10.7/rescued-duplicate" }, authors: [] } },
            { isInfluential: true, citedPaper: { paperId: "s2-missing", title, year: 2015, venue: "Nature", abstract: "a longer abstract from semantic scholar", citationCount: 99, externalIds: {}, authors: [{ name: "D. Author" }] } }
          ] }) };
          return { ok: true, status: 200, json: async () => ({ data: [] }) };
        }
        if (target.includes("title.search")) return { ok: true, status: 200, json: async () => ({ results: [] }) };
        if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [
          { DOI: "10.7/rescued-duplicate", title: [title], "container-title": ["Nature"], author: [{ given: "D.", family: "Author" }], published: { "date-parts": [[2015, 6, 1]] } }
        ] } }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    };
    const result = await buildPaperLineage("10.1234/enrich-dedupe-main", options);
    const matches = result.predecessors.filter(node => node.doi === "10.7/rescued-duplicate");
    assert.equal(matches.length, 1, "补全到已有 DOI 后必须再次合并，避免缓存两个重复节点");
    assert.equal(matches[0].citationCount, 99, "再次合并后应保留补全前无标识节点的更高被引数");
    assert.equal(matches[0].abstract, "a longer abstract from semantic scholar", "再次合并后应保留更完整摘要");
    assert.deepEqual(matches[0].authors, ["D. Author"], "再次合并后应保留更完整作者字段");
    assert.equal(matches[0].journal, "Nature");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("lookupLineageNodeByTitle keeps Crossref year-only dates out of the published field", async () => {
  const title = "A paper Crossref only dates to a year";
  const lookup = async publishedParts => lookupLineageNodeByTitle(title, {
    config: { enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "" },
    academicApis: { contactEmail: "" },
    fetchImpl: async (url) => {
      const target = String(url instanceof URL ? url.href : url);
      if (target.includes("title.search")) return { ok: true, status: 200, json: async () => ({ results: [] }) };
      if (target.includes("query.bibliographic")) return { ok: true, status: 200, json: async () => ({ message: { items: [
        { DOI: "10.3/year-only", title: [title], "container-title": ["Optics Express"], author: [], issued: { "date-parts": [publishedParts] } }
      ] } }) };
      return { ok: false, status: 500, json: async () => ({}) };
    }
  });

  const yearOnly = await lookup([2017]);
  assert.equal(yearOnly.doi, "10.3/year-only");
  assert.equal(yearOnly.year, 2017, "只有年份时仍要保留年份");
  assert.equal(yearOnly.published, "", "只有年份时不得把它当作完整发表日期");

  const fullDate = await lookup([2017, 4, 9]);
  assert.equal(fullDate.published, "2017-04-09", "完整日期应原样保留");
  assert.equal(fullDate.year, 2017);
});

test("server exposes lineage routes backed by backend orchestrators", async () => {
  const serverSource = await fs.readFile(path.join(__dirname, "..", "server.cjs"), "utf8");
  assert.match(serverSource, /pathname === "\/api\/lineage"/);
  assert.match(serverSource, /pathname === "\/api\/lineage\/paper"/);
  assert.match(serverSource, /buildPaperLineage\(/);
  assert.match(serverSource, /fetchLineagePaperDetail\(/);
});
