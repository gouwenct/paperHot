const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "data", "papers");
const USER_DATA_DIR = path.join(__dirname, "data", "user");
const USER_CONFIG_FILE = path.join(USER_DATA_DIR, "config.json");
const USER_PROFILE_FILE = path.join(USER_DATA_DIR, "profile.json");
const JOURNAL_METRICS_CONFIG_FILE = path.join(__dirname, "config", "journal-metrics.json");
const DEFAULT_KEYWORDS = [
  "computational microscopy",
  "microscopy reconstruction",
  "structured illumination",
  "speckle illumination",
  "structured illumination microscopy",
  "random illumination microscopy",
  "pixel reassignment microscopy",
  "diffusion prior",
  "self-supervised restoration"
];
const CATEGORY_LABELS = {
  classic: "偏传统算法",
  neural: "带有神经网络算法",
  bio: "偏生物结果",
  hardware: "偏硬件创新",
  theory: "偏理论创新",
  review: "综述"
};
const SHORT_KEYWORDS = new Set(["sim", "rim", "prim"]);
const ACRONYM_EXPANSIONS = {
  sim: "structured illumination microscopy",
  rim: "random illumination microscopy",
  prim: "pixel reassignment microscopy"
};
const DOMAIN_CONTEXT_PATTERN = /\b(microscopy|microscope|bioimage|illumination|deconvolution|ptychography|optical microscopy|fluorescence|structured illumination|speckle)\b/i;
const DOMAIN_ANCHOR_KEYWORDS = [
  "computational microscopy",
  "microscopy reconstruction",
  "structured illumination",
  "speckle illumination",
  "structured illumination microscopy",
  "random illumination microscopy",
  "pixel reassignment microscopy",
  "bioimage",
  "optical microscopy",
  "fluorescence microscopy",
  "deconvolution microscopy"
];
const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const BIORXIV_ENDPOINT = "https://api.biorxiv.org/details/biorxiv";
const SEMANTIC_SCHOLAR_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper/search";
const DEFAULT_JOURNAL_METRICS_CONFIG = {
  provider: "easyscholar",
  enabled: false,
  endpoint: "",
  apiKey: "",
  request: {
    method: "GET",
    queryName: "journal",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer "
  },
  responseMap: {
    impactFactor: "data.impactFactor",
    partition: "data.partition",
    upgradedPartition: "data.upgradedPartition"
  }
};
const DEFAULT_USER_PROFILE = {
  name: "本地科研用户",
  researchArea: "计算显微与成像重建",
  locale: "zh-CN"
};
const DEFAULT_USER_CONFIG = {
  keywords: {
    primary: [
      { text: "计算显微", enabled: true },
      { text: "computational microscopy", enabled: true },
      { text: "microscopy reconstruction", enabled: true }
    ],
    secondary: [
      { text: "SIM", enabled: true },
      { text: "RIM", enabled: true },
      { text: "PRIM", enabled: true },
      { text: "speckle illumination", enabled: false },
      { text: "structured illumination", enabled: false }
    ],
    inspiration: [
      { text: "物理先验重建", enabled: true },
      { text: "diffusion prior", enabled: true },
      { text: "self-supervised restoration", enabled: false },
      { text: "deconvolution", enabled: false }
    ]
  },
  sources: [
    {
      title: "Google 搜索",
      desc: "补充机构新闻、项目主页、论文代码页和 Nature / Science 网页结果。",
      tags: ["关键词搜索", "网页结果", "项目主页"],
      enabled: true
    },
    {
      title: "arXiv",
      desc: "抓取 cs.CV、eess.IV、cs.AI、q-bio.QM 等分类。",
      tags: ["论文源", "每日更新", "摘要可用"],
      enabled: true
    },
    {
      title: "bioRxiv",
      desc: "追踪生物图像、显微实验、细胞成像和生物物理预印本。",
      tags: ["预印本", "BioImage", "生命科学"],
      enabled: true
    },
    {
      title: "Semantic Scholar",
      desc: "补充跨期刊论文、引用信息、开放 PDF 链接和相关研究条目。",
      tags: ["论文数据库", "引用信息", "开放 PDF"],
      enabled: true
    },
    {
      title: "Nature / Nature Methods",
      desc: "捕捉高影响力论文、方法文章和期刊新闻。",
      tags: ["期刊", "方法文章", "高权重"],
      enabled: true
    }
  ]
};

function todayString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function timeString(value) {
  if (!value) return "00:00";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return "00:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "00:00";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function dateString(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return todayString(date);
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeXml(value) {
  return compactText(value).replace(/&(#\d+|#x[\da-fA-F]+|amp|lt|gt|quot|apos);/g, match => {
    const entity = match.slice(1, -1);
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return "\"";
    if (entity === "apos") return "'";
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return match;
  });
}

function stripTags(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/g, " "));
}

function textBetween(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function allTagMatches(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map(match => stripTags(match[1]))
    .filter(Boolean);
}

function attrMatches(xml, tag, attr) {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "gi"))]
    .map(match => decodeXml(match[1]))
    .filter(Boolean);
}

function parseArxivEntries(xml) {
  return [...String(xml || "").matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)]
    .map(match => {
      const entry = match[1];
      return {
        id: textBetween(entry, "id"),
        title: textBetween(entry, "title"),
        summary: textBetween(entry, "summary"),
        published: textBetween(entry, "published"),
        updated: textBetween(entry, "updated"),
        authors: [...entry.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)]
          .map(author => textBetween(author[1], "name"))
          .filter(Boolean),
        categories: attrMatches(entry, "category", "term"),
        links: attrMatches(entry, "link", "href")
      };
    })
    .filter(entry => entry.id && entry.title);
}

function classifyPaper(text) {
  const lower = compactText(text).toLowerCase();
  const rules = [
    ["review", /\b(review|survey|overview|perspective)\b/],
    ["neural", /\b(neural|deep learning|foundation model|diffusion|transformer|self-supervised|machine learning|ai)\b/],
    ["bio", /\b(bioimage|cell|cells|biology|biological|tissue|organism|live[- ]cell|life science)\b/],
    ["hardware", /\b(hardware|microscope|optics|illumination|camera|sensor|laser|lens|objective)\b/],
    ["theory", /\b(theory|theoretical|bound|proof|modeling|statistical limit)\b/],
    ["classic", /\b(reconstruction|inverse problem|deconvolution|ptychography|compressed sensing|regularization)\b/]
  ];
  const categories = rules
    .filter(([, pattern]) => pattern.test(lower))
    .map(([category]) => category);
  if (!categories.length) categories.push("classic");
  const category = categories[0];
  return {
    category,
    categoryLabel: CATEGORY_LABELS[category],
    categories,
    categoryLabels: categories.map(item => CATEGORY_LABELS[item])
  };
}

function keywordMatches(text, keywords) {
  const cleanText = compactText(text);
  const lower = cleanText.toLowerCase();
  return cleanKeywords(keywords).filter(keyword => {
    const normalized = keyword.toLowerCase();
    if (SHORT_KEYWORDS.has(normalized)) {
      const expansion = ACRONYM_EXPANSIONS[normalized];
      return lower.includes(expansion) || new RegExp(`(^|[^a-z0-9\\\\])${normalized}([^a-z0-9]|$)`, "i").test(cleanText);
    }
    return lower.includes(normalized);
  });
}

function scorePaper(text, keywords = DEFAULT_KEYWORDS) {
  const lower = compactText(text).toLowerCase();
  let score = 68;
  score += Math.min(keywordMatches(lower, keywords).length * 8, 18);
  if (/\b(microscopy|bioimage|illumination|reconstruction)\b/.test(lower)) score += 8;
  if (/\b(diffusion|foundation model|self-supervised|inverse problem|deconvolution)\b/.test(lower)) score += 6;
  if (/\b(review|survey|nature|methods)\b/.test(lower)) score += 4;
  return Math.max(50, Math.min(98, score));
}

function makeReason(text, keywords) {
  const matched = keywordMatches(text, keywords);
  if (matched.length) {
    return `命中关注关键词：${matched.slice(0, 3).join("、")}，建议优先判断是否与你当前课题直接相关。`;
  }
  return "根据题名、摘要和来源判断与当前科研入口相关，可先快速浏览摘要。";
}

function defaultTokenUsage() {
  return {
    prompt: 0,
    completion: 0,
    total: 0,
    status: "未调用 AI"
  };
}

function defaultJournalMetrics() {
  return {
    impactFactor: "",
    partition: "",
    source: "",
    status: "未查询"
  };
}

function cleanKeywords(keywords) {
  return Array.from(new Set((Array.isArray(keywords) ? keywords : [])
    .map(keyword => String(keyword || "").trim())
    .filter(Boolean)));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanKeywordConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const fallback = cloneJson(DEFAULT_USER_CONFIG.keywords);
  return Object.fromEntries(Object.keys(fallback).map(groupKey => {
    const items = Array.isArray(input[groupKey]) ? input[groupKey] : fallback[groupKey];
    const cleanItems = items
      .map(item => ({
        text: String(item?.text || "").trim(),
        enabled: item?.enabled !== false
      }))
      .filter(item => item.text);
    return [groupKey, cleanItems.length ? cleanItems : fallback[groupKey]];
  }));
}

function cleanSourceConfig(value) {
  const items = Array.isArray(value) ? value : DEFAULT_USER_CONFIG.sources;
  const cleanItems = items
    .map(item => ({
      title: String(item?.title || "").trim(),
      desc: String(item?.desc || "").trim(),
      tags: Array.isArray(item?.tags) ? item.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
      enabled: item?.enabled !== false
    }))
    .filter(item => item.title);
  return cleanItems.length ? cleanItems : cloneJson(DEFAULT_USER_CONFIG.sources);
}

function cleanUserConfig(value) {
  return {
    keywords: cleanKeywordConfig(value?.keywords),
    sources: cleanSourceConfig(value?.sources)
  };
}

function cleanUserProfile(value) {
  return {
    ...cloneJson(DEFAULT_USER_PROFILE),
    ...(value && typeof value === "object" ? value : {})
  };
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return cloneJson(fallback);
  }
}

function cleanJournalMetricsConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    provider: String(input.provider || DEFAULT_JOURNAL_METRICS_CONFIG.provider),
    enabled: input.enabled === true,
    endpoint: String(input.endpoint || ""),
    apiKey: String(input.apiKey || ""),
    request: {
      ...DEFAULT_JOURNAL_METRICS_CONFIG.request,
      ...(input.request && typeof input.request === "object" ? input.request : {})
    },
    responseMap: {
      ...DEFAULT_JOURNAL_METRICS_CONFIG.responseMap,
      ...(input.responseMap && typeof input.responseMap === "object" ? input.responseMap : {})
    }
  };
}

async function readJournalMetricsConfig(file = JOURNAL_METRICS_CONFIG_FILE) {
  return cleanJournalMetricsConfig(await readJsonFile(file, DEFAULT_JOURNAL_METRICS_CONFIG));
}

async function writeJsonFile(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

async function readUserProfile() {
  return cleanUserProfile(await readJsonFile(USER_PROFILE_FILE, DEFAULT_USER_PROFILE));
}

async function readUserConfig(file = USER_CONFIG_FILE) {
  return cleanUserConfig(await readJsonFile(file, DEFAULT_USER_CONFIG));
}

async function writeUserConfig(config, file = USER_CONFIG_FILE) {
  const cleanConfig = cleanUserConfig(config);
  await writeJsonFile(file, cleanConfig);
  return cleanConfig;
}

async function readUserState(options = {}) {
  return {
    profile: await readUserProfile(),
    config: await readUserConfig(options.configFile)
  };
}

function filterPapersByKeywords(papers, keywords) {
  const clean = cleanKeywords(keywords);
  if (!clean.length) return papers;
  return papers.filter(paper => {
    const text = `${paper.title || ""} ${paper.summary || ""} ${(paper.tags || []).join(" ")} ${paper.source || ""}`;
    const matches = keywordMatches(text, clean);
    if (!matches.length) return false;
    const hasOnlyShortAcronym = matches.every(keyword => SHORT_KEYWORDS.has(keyword.toLowerCase()));
    return !hasOnlyShortAcronym || DOMAIN_CONTEXT_PATTERN.test(text);
  });
}

function filterPapersByDomainAnchors(papers, keywords) {
  const expandedKeywords = cleanKeywords(keywords).map(keyword => ACRONYM_EXPANSIONS[keyword.toLowerCase()] || keyword);
  const anchors = cleanKeywords([...DOMAIN_ANCHOR_KEYWORDS, ...expandedKeywords.filter(keyword => DOMAIN_CONTEXT_PATTERN.test(keyword))]);
  return papers.filter(paper => {
    const text = `${paper.title || ""} ${paper.summary || ""} ${(paper.tags || []).join(" ")} ${paper.source || ""}`;
    return keywordMatches(text, anchors).length > 0 || DOMAIN_CONTEXT_PATTERN.test(text);
  });
}

function normalizeArxivEntry(entry, keywords = DEFAULT_KEYWORDS) {
  const title = compactText(entry.title);
  const summary = compactText(entry.summary);
  const text = `${title} ${summary} ${(entry.categories || []).join(" ")}`;
  const classified = classifyPaper(text);
  const idPart = String(entry.id || "").replace(/^https?:\/\/arxiv\.org\/abs\//i, "").trim();
  const categories = Array.isArray(entry.categories) ? entry.categories.filter(Boolean) : [];
  const authors = Array.isArray(entry.authors) ? entry.authors.filter(Boolean) : [];
  return {
    id: `arxiv-${idPart || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    time: timeString(entry.published || entry.updated),
    sourceType: "预印本",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: categories.length ? `arXiv ${categories.slice(0, 3).join(" / ")}` : "arXiv",
    title,
    summary,
    tags: [...categories.slice(0, 3), ...authors.slice(0, 2)].slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url: entry.id || "",
    authors,
    published: entry.published || entry.updated || ""
  };
}

function normalizeBioRxivItem(item, keywords = DEFAULT_KEYWORDS) {
  const title = compactText(item.title || item.preprint_title);
  const summary = compactText(item.abstract || item.preprint_abstract);
  const categoryName = compactText(item.category || item.preprint_category || "bioRxiv");
  const text = `${title} ${summary} ${categoryName}`;
  const classified = classifyPaper(`bioimage biology ${text}`);
  const doi = compactText(item.doi || item.biorxiv_doi || title);
  const authors = compactText(item.authors || item.preprint_authors)
    .split(/\s*;\s*/)
    .map(author => author.trim())
    .filter(Boolean);
  return {
    id: `biorxiv-${doi}`,
    time: timeString(item.date || item.preprint_date),
    sourceType: "预印本",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: `bioRxiv · ${categoryName}`,
    title,
    summary,
    tags: [categoryName, ...authors.slice(0, 2)].filter(Boolean).slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url: doi.startsWith("10.") ? `https://www.biorxiv.org/content/${doi}v1` : "",
    authors,
    published: item.date || item.preprint_date || ""
  };
}

function parseEnabledSources(sourceNames) {
  const names = (Array.isArray(sourceNames) ? sourceNames : []).map(name => String(name || "").toLowerCase());
  const sources = [];
  if (names.some(name => name.includes("arxiv"))) sources.push("arxiv");
  if (names.some(name => name.includes("biorxiv") || name.includes("bioarxiv"))) sources.push("biorxiv");
  if (names.some(name => name.includes("semantic scholar") || name.includes("semanticscholar"))) sources.push("semanticscholar");
  return Array.from(new Set(sources));
}

function buildArxivQuery(keywords) {
  const clean = cleanKeywords(keywords)
    .map(keyword => ACRONYM_EXPANSIONS[keyword.toLowerCase()] || keyword)
    .slice(0, 8);
  const terms = clean.map(keyword => {
    const escaped = keyword.replace(/"/g, "");
    return /\s/.test(escaped) ? `all:"${escaped}"` : `all:${escaped}`;
  });
  return terms.length ? terms.join(" OR ") : "all:microscopy";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "paperHOT/0.1 (local research prototype)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "paperHOT/0.1 (local research prototype)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchArxivPapers(keywords = DEFAULT_KEYWORDS) {
  const params = new URLSearchParams({
    search_query: buildArxivQuery(keywords),
    start: "0",
    max_results: "50",
    sortBy: "submittedDate",
    sortOrder: "descending"
  });
  const xml = await fetchText(`${ARXIV_ENDPOINT}?${params.toString()}`);
  return parseArxivEntries(xml).map(entry => normalizeArxivEntry(entry, keywords));
}

async function fetchBioRxivPapers(date, keywords = DEFAULT_KEYWORDS) {
  const data = await fetchJson(`${BIORXIV_ENDPOINT}/${date}/${date}/0/json`);
  const items = Array.isArray(data.collection) ? data.collection : [];
  return filterPapersByKeywords(items.map(item => normalizeBioRxivItem(item, keywords)), keywords);
}

function buildSemanticScholarQuery(keywords = DEFAULT_KEYWORDS) {
  const clean = cleanKeywords(keywords)
    .map(keyword => ACRONYM_EXPANSIONS[keyword.toLowerCase()] || keyword)
    .filter(keyword => !/[\u4e00-\u9fff]/.test(keyword));
  return clean.slice(0, 5).join(" ") || "computational microscopy reconstruction";
}

function normalizeSemanticScholarPaper(item, keywords = DEFAULT_KEYWORDS) {
  const title = compactText(item.title);
  const summary = compactText(item.abstract);
  const venue = compactText(item.venue || item.publicationVenue?.name || "论文数据库");
  const text = `${title} ${summary} ${venue}`;
  const classified = classifyPaper(text);
  const authors = Array.isArray(item.authors)
    ? item.authors.map(author => compactText(author.name)).filter(Boolean)
    : [];
  const published = item.publicationDate || (item.year ? `${item.year}-01-01` : "");
  return {
    id: `semanticscholar-${compactText(item.paperId || title)}`,
    time: timeString(published),
    sourceType: "论文数据库",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: `Semantic Scholar · ${venue}`,
    title,
    summary,
    tags: [venue, ...(Array.isArray(item.fieldsOfStudy) ? item.fieldsOfStudy : []), ...authors.slice(0, 2)]
      .filter(Boolean)
      .slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url: item.url || "",
    pdfUrl: item.openAccessPdf?.url || "",
    authors,
    published
  };
}

async function fetchSemanticScholarPapers(keywords = DEFAULT_KEYWORDS) {
  const params = new URLSearchParams({
    query: buildSemanticScholarQuery(keywords),
    limit: "50",
    fields: "paperId,title,abstract,year,publicationDate,venue,url,authors,fieldsOfStudy,openAccessPdf"
  });
  const data = await fetchJson(`${SEMANTIC_SCHOLAR_ENDPOINT}?${params.toString()}`);
  const items = Array.isArray(data.data) ? data.data : [];
  return filterPapersByKeywords(items.map(item => normalizeSemanticScholarPaper(item, keywords)), keywords);
}

function dedupePapers(papers) {
  const seen = new Set();
  return papers.filter(paper => {
    const key = paper.id || `${paper.title}-${paper.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function refinePaperPool(papers, keywords) {
  return filterPapersByDomainAnchors(filterPapersByKeywords(dedupePapers(papers), keywords), keywords);
}

function filterPapersByDate(papers, date) {
  return papers.filter(paper => dateString(paper.published) === date);
}

async function readCachedPapers(date, dataDir = DATA_DIR) {
  const file = path.join(dataDir, `${date}.json`);
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

async function writeCachedPapers(date, payload, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, `${date}.json`);
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

function emptyTokenBucket(label = "") {
  return {
    ...(label ? { label } : {}),
    prompt: 0,
    completion: 0,
    total: 0,
    papers: 0
  };
}

function addTokenUsage(bucket, usage = {}) {
  const prompt = Number(usage.prompt || 0);
  const completion = Number(usage.completion || 0);
  const total = Number(usage.total || prompt + completion);
  bucket.prompt += prompt;
  bucket.completion += completion;
  bucket.total += total;
  bucket.papers += total > 0 ? 1 : 0;
}

function dateKeyFromCacheFile(name) {
  const match = String(name).match(/^(\d{4}-\d{2}-\d{2})(?:-recent)?\.json$/);
  return match ? match[1] : "";
}

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function buildTokenStats(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const today = options.today || todayString();
  const start30 = shiftDate(today, -29);
  const start7 = shiftDate(today, -6);
  const dailyMap = new Map();
  const modelMap = new Map();
  const todayBucket = emptyTokenBucket("today");
  const last7DaysBucket = emptyTokenBucket("last7Days");
  const last30DaysBucket = emptyTokenBucket("last30Days");

  try {
    const files = await fs.readdir(dataDir);
    await Promise.all(files.map(async fileName => {
      const date = dateKeyFromCacheFile(fileName);
      if (!date || date < start30 || date > today) return;
      const payload = JSON.parse(await fs.readFile(path.join(dataDir, fileName), "utf8"));
      const papers = Array.isArray(payload.papers) ? payload.papers : [];
      const dayBucket = dailyMap.get(date) || { date, ...emptyTokenBucket() };
      papers.forEach(paper => {
        const usage = paper.tokenUsage || {};
        addTokenUsage(dayBucket, usage);
        addTokenUsage(last30DaysBucket, usage);
        if (date >= start7) addTokenUsage(last7DaysBucket, usage);
        if (date === today) addTokenUsage(todayBucket, usage);
        const model = usage.model || usage.modelName || "未记录模型";
        const modelBucket = modelMap.get(model) || { model, ...emptyTokenBucket() };
        addTokenUsage(modelBucket, usage);
        modelMap.set(model, modelBucket);
      });
      dailyMap.set(date, dayBucket);
    }));
  } catch {
    // Missing paper cache directory means no token usage has been recorded yet.
  }

  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDate(start30, index);
    return dailyMap.get(date) || { date, ...emptyTokenBucket() };
  });
  const byModel = Array.from(modelMap.values())
    .filter(item => item.total > 0)
    .sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    today: todayBucket,
    last7Days: last7DaysBucket,
    last30Days: last30DaysBucket,
    byModel,
    daily
  };
}

async function fetchPaperPayload(options = {}) {
  const date = options.date || todayString();
  const keywords = cleanKeywords(options.keywords).length ? cleanKeywords(options.keywords) : DEFAULT_KEYWORDS;
  const requestedSources = parseEnabledSources(options.sources || []);
  const sources = requestedSources.length ? requestedSources : ["arxiv", "biorxiv", "semanticscholar"];
  const mode = options.mode || "today";
  const dataDir = options.dataDir || DATA_DIR;
  if (!options.refresh) {
    try {
      return await readCachedPapers(mode === "today" ? date : `${date}-recent`, dataDir);
    } catch {
      // Cache miss is expected on the first run.
    }
  }

  const errors = [];
  const groups = await Promise.all(sources.map(async source => {
    try {
      if (source === "arxiv") return options.fetchers?.arxiv ? await options.fetchers.arxiv() : await fetchArxivPapers(keywords);
      if (source === "biorxiv") return options.fetchers?.biorxiv ? await options.fetchers.biorxiv() : await fetchBioRxivPapers(date, keywords);
      if (source === "semanticscholar") return options.fetchers?.semanticscholar ? await options.fetchers.semanticscholar() : await fetchSemanticScholarPapers(keywords);
      return [];
    } catch (error) {
      errors.push({ source, message: error.message });
      return [];
    }
  }));
  const refinedPapers = refinePaperPool(groups.flat(), keywords);
  const papers = (mode === "today" ? filterPapersByDate(refinedPapers, date) : refinedPapers)
    .sort((a, b) => b.score - a.score || String(b.published).localeCompare(String(a.published)))
    .slice(0, 80);
  const payload = {
    date,
    mode,
    fetchedAt: new Date().toISOString(),
    keywords,
    sources,
    errors,
    count: papers.length,
    papers
  };
  payload.cacheFile = await writeCachedPapers(mode === "today" ? date : `${date}-recent`, payload, dataDir);
  return payload;
}

async function fetchTodayPapers(options = {}) {
  return fetchPaperPayload({ ...options, mode: "today" });
}

async function fetchRecentPapers(options = {}) {
  return fetchPaperPayload({ ...options, refresh: options.refresh !== false, mode: "recent" });
}

if (require.main === module) {
  fetchTodayPapers({ refresh: true })
    .then(payload => {
      console.log(JSON.stringify({
        date: payload.date,
        count: payload.count,
        sources: payload.sources,
        errors: payload.errors,
        cacheFile: payload.cacheFile,
        topTitles: payload.papers.slice(0, 5).map(paper => paper.title)
      }, null, 2));
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_KEYWORDS,
  buildTokenStats,
  buildArxivQuery,
  classifyPaper,
  cleanKeywords,
  fetchArxivPapers,
  fetchBioRxivPapers,
  fetchRecentPapers,
  fetchSemanticScholarPapers,
  fetchTodayPapers,
  filterPapersByDate,
  filterPapersByKeywords,
  normalizeArxivEntry,
  normalizeBioRxivItem,
  normalizeSemanticScholarPaper,
  parseArxivEntries,
  parseEnabledSources,
  readJournalMetricsConfig,
  readUserState,
  refinePaperPool,
  scorePaper,
  todayString,
  writeUserConfig
};
