const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = path.join(__dirname, "data", "papers");
const PAPER_ARCHIVE_NAME = "archive.json";
const FAVORITES_NAME = "favorites.json";
const PAPER_NOTES_NAME = "paper-notes.json";
const FETCH_LOG_NAME = "fetch-log.json";
const OPERATION_LOG_NAME = "operation-log.jsonl";
const JOURNAL_METRICS_CACHE_NAME = "journal-metrics-cache.json";
const GOOGLE_ROLLING_CURSOR_NAME = "google-rolling-cursors.json";
const FETCH_LOG_LIMIT = 30;
const USER_DATA_DIR = path.join(__dirname, "data", "user");
const USER_CONFIG_FILE = path.join(USER_DATA_DIR, "config.json");
const USER_PROFILE_FILE = path.join(USER_DATA_DIR, "profile.json");
const JOURNAL_METRICS_CONFIG_FILE = path.join(__dirname, "config", "journal-metrics.json");
const GOOGLE_SCHOLAR_CONFIG_FILE = path.join(__dirname, "config", "google-scholar.json");
const LLM_CONFIG_FILE = path.join(__dirname, "config", "llm.json");
// “最近”抓取模式的默认起始日期（含当日）。从该日期一直抓取到今天。
const RECENT_RANGE_START = "2026-05-01";
// 数据源 / 外部 API 的中文展示名，用于本次抓取报告。
const API_LABELS = {
  arxiv: "arXiv",
  biorxiv: "bioRxiv",
  semanticscholar: "Semantic Scholar",
  googlescholar: "Google Scholar (SerpApi)",
  googlesearch: "Google 搜索 (SerpApi)",
  crossref: "Crossref 元数据",
  easyscholar: "EasyScholar 期刊指标",
  llm: "LLM 摘要 / 推荐"
};
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
const CROSSREF_WORKS_ENDPOINT = "https://api.crossref.org/works";
const DEFAULT_JOURNAL_METRICS_MIN_INTERVAL_MS = 500;
const DEFAULT_JOURNAL_METRICS_CONFIG = {
  provider: "easyscholar",
  enabled: false,
  endpoint: "https://easyscholar.cc/open/getPublicationRank",
  apiKey: "",
  minIntervalMs: DEFAULT_JOURNAL_METRICS_MIN_INTERVAL_MS,
  request: {
    method: "GET",
    queryName: "publicationName",
    apiKeyQueryName: "secretKey",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    useApiKeyHeader: false
  },
  responseMap: {
    impactFactor: "data.officialRank.all.sciif",
    partition: "data.officialRank.all.sci",
    upgradedPartition: "data.officialRank.all.sciUp"
  }
};
const DEFAULT_GOOGLE_SCHOLAR_CONFIG = {
  provider: "google-scholar-api",
  enabled: false,
  endpoint: "",
  apiKey: "",
  maxPages: 3,
  num: 20,
  rollingFetch: false,
  request: {
    method: "GET",
    queryName: "q",
    apiKeyQueryName: "api_key",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    useApiKeyHeader: false
  },
  responseMap: {
    items: "organic_results",
    title: "title",
    summary: "snippet",
    doi: "doi",
    journal: "publication_info.journal",
    year: "publication_info.year",
    url: "link"
  }
};
const DEFAULT_USER_BACKGROUND = "用户背景：3D-SIM、多层聚焦结构光照明 MPSIM、RIM、PRIM、2D-SIM；当前正在做 PRIM 伪随机的结构光照明显微镜算法。";
const DEFAULT_LLM_CONFIG = {
  provider: "aliyun-modelstudio",
  enabled: false,
  activeProviderId: "aliyun-modelstudio",
  host: "ws-yo0l2l0j1634flxf.ap-southeast-1.maas.aliyuncs.com",
  endpoint: "https://ws-yo0l2l0j1634flxf.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  dashscopeEndpoint: "https://ws-yo0l2l0j1634flxf.ap-southeast-1.maas.aliyuncs.com/api/v1",
  apiKey: "",
  model: "",
  apiMode: "openai",
  contextWindow: 131000,
  reasoning: "auto",
  providers: [
    { id: "anthropic", name: "Anthropic (Claude)", desc: "Official Claude API", provider: "anthropic", enabled: false, apiMode: "anthropic", endpoint: "https://api.anthropic.com", apiKey: "", model: "", modelPresets: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"], contextWindow: 200000, reasoning: "auto" },
    { id: "claude-code-local", name: "Claude Code CLI (local)", desc: "Uses the local claude binary -- no API key needed", provider: "claude-code-local", enabled: false, apiMode: "local", endpoint: "", apiKey: "", model: "local", modelPresets: ["local"], contextWindow: 200000, reasoning: "auto" },
    { id: "codex-cli-local", name: "Codex CLI (local)", desc: "Uses the local codex binary -- no API key needed", provider: "codex-cli-local", enabled: false, apiMode: "local", endpoint: "", apiKey: "", model: "local", modelPresets: ["local"], contextWindow: 128000, reasoning: "auto" },
    { id: "openai", name: "OpenAI (GPT)", desc: "Official OpenAI API", provider: "openai", enabled: false, apiMode: "openai", endpoint: "https://api.openai.com/v1", apiKey: "", model: "", modelPresets: ["gpt-4.1", "gpt-4.1-mini", "gpt-5"], contextWindow: 128000, reasoning: "auto" },
    { id: "gemini", name: "Google (Gemini)", desc: "Generative Language API", provider: "gemini", enabled: false, apiMode: "openai", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "", model: "", modelPresets: ["gemini-2.5-pro", "gemini-2.5-flash"], contextWindow: 1000000, reasoning: "auto" },
    { id: "deepseek", name: "DeepSeek", desc: "api.deepseek.com", provider: "deepseek", enabled: false, apiMode: "openai", endpoint: "https://api.deepseek.com/v1", apiKey: "", model: "", modelPresets: ["deepseek-chat", "deepseek-reasoner"], contextWindow: 64000, reasoning: "auto" },
    { id: "groq", name: "Groq", desc: "api.groq.com", provider: "groq", enabled: false, apiMode: "openai", endpoint: "https://api.groq.com/openai/v1", apiKey: "", model: "", modelPresets: ["llama-3.3-70b-versatile"], contextWindow: 128000, reasoning: "auto" },
    { id: "xai", name: "xAI (Grok)", desc: "api.x.ai", provider: "xai", enabled: false, apiMode: "openai", endpoint: "https://api.x.ai/v1", apiKey: "", model: "", modelPresets: ["grok-4", "grok-3"], contextWindow: 128000, reasoning: "auto" },
    { id: "nvidia", name: "NVIDIA NIM", desc: "integrate.api.nvidia.com", provider: "nvidia", enabled: false, apiMode: "openai", endpoint: "https://integrate.api.nvidia.com/v1", apiKey: "", model: "", modelPresets: ["openai/gpt-oss-120b"], contextWindow: 128000, reasoning: "auto" },
    { id: "moonshot-global", name: "Kimi (Moonshot)", desc: "api.moonshot.ai", provider: "moonshot", enabled: false, apiMode: "openai", endpoint: "https://api.moonshot.ai/v1", apiKey: "", model: "", modelPresets: ["kimi-k2.5", "kimi-latest"], contextWindow: 128000, reasoning: "auto" },
    { id: "moonshot-cn", name: "Kimi (Moonshot, 中国)", desc: "api.moonshot.cn", provider: "moonshot-cn", enabled: false, apiMode: "openai", endpoint: "https://api.moonshot.cn/v1", apiKey: "", model: "", modelPresets: ["kimi-k2.5", "kimi-latest"], contextWindow: 128000, reasoning: "auto" },
    { id: "zhipu", name: "智谱 GLM (Zhipu)", desc: "open.bigmodel.cn", provider: "zhipu", enabled: false, apiMode: "openai", endpoint: "https://open.bigmodel.cn/api/paas/v4", apiKey: "", model: "", modelPresets: ["glm-4.7", "glm-4-flash"], contextWindow: 128000, reasoning: "auto" },
    { id: "minimax-global", name: "MiniMax (Global)", desc: "api.minimax.io/anthropic", provider: "minimax-global", enabled: false, apiMode: "anthropic", endpoint: "https://api.minimax.io/anthropic", apiKey: "", model: "", modelPresets: ["MiniMax-M2.5"], contextWindow: 128000, reasoning: "auto" },
    { id: "minimax-cn", name: "MiniMax (中国)", desc: "api.minimax.com/anthropic", provider: "minimax-cn", enabled: false, apiMode: "anthropic", endpoint: "https://api.minimax.com/anthropic", apiKey: "", model: "", modelPresets: ["MiniMax-M2.5"], contextWindow: 128000, reasoning: "auto" },
    { id: "aliyun-coding", name: "阿里百炼 Coding Plan", desc: "dashscope.aliyuncs.com", provider: "aliyun-modelstudio", enabled: false, apiMode: "openai", host: "ws-yo0l2l0j1634flxf.ap-southeast-1.maas.aliyuncs.com", endpoint: "https://ws-yo0l2l0j1634flxf.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1", dashscopeEndpoint: "https://ws-yo0l2l0j1634flxf.ap-southeast-1.maas.aliyuncs.com/api/v1", apiKey: "", model: "qwen-plus", modelPresets: ["qwen-plus", "qwen-max", "qwen3-coder-plus", "qwen3-coder-next"], contextWindow: 131000, reasoning: "auto" },
    { id: "xiaomi", name: "小米 MiMo (Xiaomi)", desc: "api.xiaomimimo.com", provider: "xiaomi", enabled: false, apiMode: "openai", endpoint: "https://api.xiaomimimo.com/v1", apiKey: "", model: "", modelPresets: ["MiMo"], contextWindow: 128000, reasoning: "auto" },
    { id: "volcengine", name: "火山引擎 Ark (Volcengine)", desc: "ark.cn-beijing.volces.com/api/coding/v3", provider: "volcengine", enabled: false, apiMode: "openai", endpoint: "https://ark.cn-beijing.volces.com/api/coding/v3", apiKey: "", model: "Doubao-Seed-2.0-Code", modelPresets: ["Doubao-Seed-2.0-Code", "Doubao-Seed-2.0-pro", "Doubao-Seed-2.0-lite"], contextWindow: 128000, reasoning: "auto" },
    { id: "ollama-local", name: "Ollama (Local)", desc: "Self-hosted llama.cpp / Ollama", provider: "ollama-local", enabled: false, apiMode: "openai", endpoint: "http://127.0.0.1:11434/v1", apiKey: "", model: "", modelPresets: ["qwen2.5", "llama3.1"], contextWindow: 128000, reasoning: "off" },
    { id: "ollama-cloud", name: "Ollama Cloud", desc: "ollama.com", provider: "ollama-cloud", enabled: false, apiMode: "openai", endpoint: "https://ollama.com/v1", apiKey: "", model: "", modelPresets: ["gpt-oss"], contextWindow: 128000, reasoning: "auto" },
    { id: "custom", name: "Custom", desc: "Any OpenAI- or Anthropic-compatible endpoint", provider: "custom", enabled: false, apiMode: "openai", endpoint: "http://127.0.0.1:8080/v1", apiKey: "", model: "gpt-5.5", modelPresets: ["gpt-5.5"], contextWindow: 262000, reasoning: "auto" }
  ],
  userBackground: DEFAULT_USER_BACKGROUND
};
const DEFAULT_USER_PROFILE = {
  name: "本地科研用户",
  researchArea: "计算显微与成像重建",
  locale: "zh-CN",
  background: DEFAULT_USER_BACKGROUND
};
const DEFAULT_USER_CONFIG = {
  keywords: {
    primary: [
      { text: "structured illumination microscopy", enabled: true },
      { text: "SIM", enabled: true }
    ],
    secondary: [
      { text: "SIM", enabled: false },
      { text: "speckle illumination", enabled: false },
      { text: "structured illumination", enabled: false }
    ],
    inspiration: [
      { text: "物理先验重建", enabled: false },
      { text: "diffusion prior", enabled: false },
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
      title: "Google Scholar",
      desc: "通过 SerpApi / Scholar JSON API 补充论文发现信号；需要在外部接口配置中填写 Endpoint 和 API Key。",
      tags: ["论文搜索", "需配置 API", "SerpApi"],
      enabled: false
    },
    {
      title: "arXiv",
      desc: "通过 arXiv 官方 API 检索预印本；不需要填写密钥。",
      tags: ["论文源", "无需配置", "预印本"],
      enabled: true
    },
    {
      title: "bioRxiv",
      desc: "通过 bioRxiv API 追踪生命科学预印本；不需要填写密钥。",
      tags: ["预印本", "无需配置", "生命科学"],
      enabled: true
    },
    {
      title: "Semantic Scholar",
      desc: "通过 Semantic Scholar Paper Search API 补充论文、引用和开放 PDF；当前不需要填写密钥。",
      tags: ["论文数据库", "无需配置", "开放 PDF"],
      enabled: true
    }
  ]
};
const GOOGLE_SCHOLAR_MAX_PAGES_LIMIT = 10;
const GOOGLE_SCHOLAR_NUM_LIMIT = 20;
const JOURNAL_METRICS_RATE_LIMITER = {
  lastRequestAt: 0,
  chain: Promise.resolve()
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
  const text = String(value).trim();
  if (/^\d{4}$/.test(text)) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return todayString(date);
}

function yearOnlyString(value) {
  const match = String(value || "").trim().match(/^((?:19|20)\d{2})$/);
  return match ? match[1] : "";
}

function dateRangeOverlapsYear(year, startDate, endDate) {
  if (!year) return false;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return (!startDate || yearEnd >= startDate) && (!endDate || yearStart <= endDate);
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultilineText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeGeneratedChineseSummary(value) {
  const text = compactText(value);
  if (!text) return false;
  return /^(该论文|论文|本文|研究提出|该文|这篇论文)/.test(text);
}

function looksLikeTruncatedText(value) {
  return /(?:\.\.\.|…)/.test(compactText(value));
}

function inferPaperShortTitle(paper = {}) {
  const existing = compactText(paper.shortTitle);
  if (/^(19|20)\d{2}@[\w.-]*$/i.test(existing)) return existing;
  const paperYearValue = paperYear(paper.published || paper.date || paper.fetchedAt);
  const year = (/^(19|20)\d{2}$/.test(paperYearValue) ? paperYearValue : "") || yearOnlyString(paper.published) || "n.d.";
  return `${year}@`;
}

function normalizeGeneratedShortTitle(paper = {}, generated = "") {
  const generatedYear = compactText(generated).match(/(19|20)\d{2}/)?.[0] || "";
  const paperYearValue = paperYear(paper.published || paper.date || paper.fetchedAt);
  const year = (/^(19|20)\d{2}$/.test(paperYearValue) ? paperYearValue : "") || yearOnlyString(paper.published) || generatedYear || "n.d.";
  return `${year}@`;
}

function paperHasTruncatedAbstractText(paper) {
  return looksLikeTruncatedText(paper?.summary) || looksLikeTruncatedText(paper?.abstractZh);
}

function arxivIdFromPaper(paper) {
  const candidates = [paper?.id, paper?.url].map(value => String(value || ""));
  for (const value of candidates) {
    const arxiv = value.match(/(?:arxiv-|arxiv\.org\/abs\/)(\d{4}\.\d{4,5}(?:v\d+)?)/i);
    if (arxiv) return arxiv[1];
  }
  return "";
}

function doiFromBioRxivUrl(value) {
  const match = String(value || "").match(/biorxiv\.org\/content\/(10\.\d{4,9}\/[^?#\s]+?)(?:v\d+)?(?:\.abstract)?(?:[?#]|$)/i);
  return match ? normalizeDoi(match[1]) : "";
}

function htmlMetaContent(html, names) {
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["'](?:${escaped})["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:${escaped})["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match) return stripTags(match[1]).replace(/^abstract\s*[:：]\s*/i, "");
  }
  return "";
}

async function fetchOriginalAbstractForPaper(paper, options = {}) {
  if (options.abstractFetcher) return compactText(await options.abstractFetcher(paper));
  const fetchImpl = options.abstractFetchImpl || options.fetchImpl || fetch;
  const arxivId = arxivIdFromPaper(paper);
  if (arxivId) {
    const response = await fetchImpl(`${ARXIV_ENDPOINT}?id_list=${encodeURIComponent(arxivId)}`, {
      headers: { "User-Agent": "paperHOT/0.1 (local research prototype)" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return "";
    const xml = await response.text();
    const entry = parseArxivEntries(xml)[0];
    return compactText(entry?.summary);
  }
  const bioRxivDoi = normalizeDoi(paper?.doi) || doiFromBioRxivUrl(paper?.url);
  const bioRxivUrl = String(paper?.url || "").trim();
  if (bioRxivDoi || /biorxiv\.org/i.test(bioRxivUrl)) {
    const response = await fetchImpl(bioRxivUrl || `https://www.biorxiv.org/content/${bioRxivDoi}v1`, {
      headers: { "User-Agent": "paperHOT/0.1 (mailto:local@example.invalid)", Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return "";
    const html = await response.text();
    return compactText(htmlMetaContent(html, ["citation_abstract", "dc.description", "description", "og:description"]));
  }
  const url = compactText(paper?.url);
  if (/^https?:\/\//i.test(url)) {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "paperHOT/0.1 (mailto:local@example.invalid)", Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return "";
    const html = await response.text();
    return compactText(htmlMetaContent(html, ["citation_abstract", "dc.description", "description", "og:description"]));
  }
  return "";
}

async function recoverGeneratedSummaryPapers(papers, options = {}) {
  const errors = Array.isArray(options.errors) ? options.errors : null;
  return Promise.all(papers.map(async paper => {
    const summary = compactText(paper?.summary);
    const hasTruncatedText = paperHasTruncatedAbstractText(paper);
    const hasUsableSummary = summary && !looksLikeGeneratedChineseSummary(summary) && !looksLikeTruncatedText(summary);
    if (compactText(paper?.abstractZh) && !hasTruncatedText) return paper;
    if (!compactText(paper?.abstractZh) && hasUsableSummary) return paper;
    try {
      const summary = await fetchOriginalAbstractForPaper(paper, options);
      return summary ? { ...paper, summary } : paper;
    } catch (error) {
      if (errors) errors.push({ source: "abstract", message: error.message });
      return paper;
    }
  }));
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

function normalizeDoi(value) {
  return decodeXml(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
}

function paperYear(published) {
  const match = String(published || "").match(/^(\d{4})/);
  return match ? match[1] : "n.d.";
}

function formatCitation({ authors = [], year = "n.d.", title = "", journal = "", doi = "" }) {
  const authorText = authors.length ? authors.join(", ") : "Unknown authors";
  const journalText = journal || "Unknown venue";
  const doiText = doi ? ` doi:${doi}` : "";
  return `${authorText} (${year}). ${title}. ${journalText}.${doiText}`;
}

function inferJournal(paper) {
  if (paper?.journal) return compactText(paper.journal);
  const source = compactText(paper?.source);
  if (/^arXiv\b/i.test(source)) return "arXiv";
  if (/^bioRxiv\b/i.test(source)) return "bioRxiv";
  const parts = source.split("·").map(part => compactText(part)).filter(Boolean);
  if (parts[0] === "Semantic Scholar" && parts[1]) return parts[1];
  if ((parts[0] === "Google Scholar" || parts[0] === "Google 搜索") && parts[1]) return parts[1];
  return source || "";
}

function completePaperRecord(paper) {
  const doi = normalizeDoi(paper?.doi);
  const journal = inferJournal(paper);
  const title = compactText(paper?.title);
  const authors = Array.isArray(paper?.authors) ? paper.authors.map(compactText).filter(Boolean) : [];
  const citation = compactText(paper?.citation) || formatCitation({
    authors,
    year: paperYear(paper?.published || paper?.date),
    title,
    journal,
    doi
  });
  return {
    ...paper,
    doi,
    title,
    summary: compactText(paper?.summary),
    abstractZh: compactText(paper?.abstractZh),
    llmSummary: compactText(paper?.llmSummary),
    shortTitle: compactText(paper?.shortTitle),
    journal,
    citation
  };
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
        doi: textBetween(entry, "arxiv:doi") || textBetween(entry, "doi"),
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

function journalScoreTier(paper = {}) {
  const value = Number.parseFloat(String(paper?.journalMetrics?.impactFactor || "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(value)) {
    if (value > 30) return { tier: "A", weight: 18, impactFactor: value };
    if (value >= 10) return { tier: "B", weight: 12, impactFactor: value };
    if (value >= 0) return { tier: "C", weight: 6, impactFactor: value };
  }
  return { tier: "B", weight: 12, impactFactor: "" };
}

function llmRelevanceScore(paper = {}) {
  const text = compactText([
    paper.title,
    paper.summary,
    paper.abstractZh,
    paper.reason
  ].filter(Boolean).join(" ")).toLowerCase();
  const hasSim = /结构光|structured illumination|\bsim\b/i.test(text);
  const hasParadigm = /新范式|范式创新|创新范式|新理念|理念创新|创新理念|新原理|全新理念|new paradigm|paradigm|new concept|novel concept|new principle|novel principle/i.test(text);
  const hasAlgorithm = /算法|重建|改进|优化|校正|reconstruction|algorithm|method|improvement|optimization|calibration/i.test(text);
  const hasDeepLearning = /深度学习|神经网络|机器学习|扩散模型|foundation model|deep learning|neural|machine learning|diffusion|transformer/i.test(text);
  const hasBioComparison = /生物|细胞|组织|live-cell|biology|biological|bioimage/i.test(text)
    && /对比|比较|优于|benchmark|comparison|compared with|outperform/i.test(text);

  let tier = "C";
  let weight = 6;
  if (hasSim && hasParadigm) {
    tier = "A";
    weight = 18;
  } else if (hasSim && (hasAlgorithm || hasDeepLearning)) {
    tier = "B";
    weight = 12;
  }
  return {
    tier,
    weight,
    bioComparisonBonus: hasBioComparison ? 4 : 0
  };
}

function rescorePaperAfterEnrichment(paper, keywords = DEFAULT_KEYWORDS) {
  const baseScore = Number(paper?.score || scorePaper(`${paper?.title || ""} ${paper?.summary || ""}`, keywords));
  const journal = journalScoreTier(paper);
  const llm = llmRelevanceScore(paper);
  const finalScore = Math.max(50, Math.min(100, Math.round(
    40 + baseScore * 0.35 + journal.weight + llm.weight + llm.bioComparisonBonus
  )));
  return {
    ...paper,
    score: finalScore,
    scoreBreakdown: {
      baseScore,
      journalTier: journal.tier,
      journalWeight: journal.weight,
      impactFactor: journal.impactFactor,
      llmRelevanceTier: llm.tier,
      llmRelevanceWeight: llm.weight,
      bioComparisonBonus: llm.bioComparisonBonus
    }
  };
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
    upgradedPartition: "",
    source: "",
    status: "未查询"
  };
}

function hasResolvedJournalMetrics(metrics = {}) {
  return Boolean(metrics.impactFactor || metrics.partition || metrics.upgradedPartition || metrics.status === "已查询");
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
  const supportedTitles = new Set(DEFAULT_USER_CONFIG.sources.map(source => source.title.toLowerCase()));
  const items = Array.isArray(value) ? value : DEFAULT_USER_CONFIG.sources;
  const cleanItems = items
    .map(item => ({
      title: String(item?.title || "").trim(),
      desc: String(item?.desc || "").trim(),
      tags: Array.isArray(item?.tags) ? item.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
      enabled: item?.enabled !== false
    }))
    .filter(item => item.title && supportedTitles.has(item.title.toLowerCase()));
  const nextItems = cleanItems.length ? cleanItems : [];
  DEFAULT_USER_CONFIG.sources.forEach(defaultSource => {
    const hasSource = nextItems.some(item => item.title.toLowerCase() === defaultSource.title.toLowerCase());
    if (!hasSource) nextItems.push(cloneJson(defaultSource));
  });
  return nextItems.length ? nextItems : cloneJson(DEFAULT_USER_CONFIG.sources);
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
    minIntervalMs: clampPositiveInteger(input.minIntervalMs, DEFAULT_JOURNAL_METRICS_MIN_INTERVAL_MS, 0, 60000),
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

function clampPositiveInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function cleanGoogleScholarConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    provider: String(input.provider || DEFAULT_GOOGLE_SCHOLAR_CONFIG.provider),
    enabled: input.enabled === true,
    endpoint: String(input.endpoint || ""),
    apiKey: String(input.apiKey || ""),
    maxPages: clampPositiveInteger(input.maxPages, DEFAULT_GOOGLE_SCHOLAR_CONFIG.maxPages, 1, GOOGLE_SCHOLAR_MAX_PAGES_LIMIT),
    num: clampPositiveInteger(input.num, DEFAULT_GOOGLE_SCHOLAR_CONFIG.num, 1, GOOGLE_SCHOLAR_NUM_LIMIT),
    rollingFetch: input.rollingFetch === true,
    request: {
      ...DEFAULT_GOOGLE_SCHOLAR_CONFIG.request,
      ...(input.request && typeof input.request === "object" ? input.request : {})
    },
    responseMap: {
      ...DEFAULT_GOOGLE_SCHOLAR_CONFIG.responseMap,
      ...(input.responseMap && typeof input.responseMap === "object" ? input.responseMap : {})
    }
  };
}

async function readGoogleScholarConfig(file = GOOGLE_SCHOLAR_CONFIG_FILE) {
  return cleanGoogleScholarConfig(await readJsonFile(file, DEFAULT_GOOGLE_SCHOLAR_CONFIG));
}
function cleanLlmProvider(value, fallback = {}) {
  const input = value && typeof value === "object" ? value : {};
  const id = String(input.id || fallback.id || input.provider || fallback.provider || "custom").trim();
  return {
    id,
    name: String(input.name || fallback.name || id),
    desc: String(input.desc || fallback.desc || ""),
    provider: String(input.provider || fallback.provider || id),
    enabled: input.enabled === true,
    apiMode: String(input.apiMode || fallback.apiMode || "openai"),
    host: String(input.host || fallback.host || ""),
    endpoint: String(input.endpoint || fallback.endpoint || ""),
    dashscopeEndpoint: String(input.dashscopeEndpoint || fallback.dashscopeEndpoint || ""),
    apiKey: String(input.apiKey || ""),
    model: String(input.model || fallback.model || ""),
    modelPresets: Array.isArray(input.modelPresets) ? input.modelPresets.map(compactText).filter(Boolean) : (fallback.modelPresets || []),
    contextWindow: Number(input.contextWindow || fallback.contextWindow || 131000),
    reasoning: String(input.reasoning || fallback.reasoning || "auto")
  };
}

function cleanLlmConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const fallbackProviders = DEFAULT_LLM_CONFIG.providers;
  const inputProviders = Array.isArray(input.providers) && input.providers.length ? input.providers : [];
  if (!inputProviders.length && (input.endpoint || input.model || input.apiKey)) {
    inputProviders.push({
      id: input.provider || DEFAULT_LLM_CONFIG.activeProviderId,
      name: input.provider || DEFAULT_LLM_CONFIG.activeProviderId,
      desc: input.host || input.endpoint || "",
      provider: input.provider || DEFAULT_LLM_CONFIG.provider,
      enabled: input.enabled === true,
      apiMode: input.apiMode || DEFAULT_LLM_CONFIG.apiMode,
      host: input.host || "",
      endpoint: input.endpoint || "",
      dashscopeEndpoint: input.dashscopeEndpoint || "",
      apiKey: input.apiKey || "",
      model: input.model || "",
      contextWindow: input.contextWindow || DEFAULT_LLM_CONFIG.contextWindow,
      reasoning: input.reasoning || DEFAULT_LLM_CONFIG.reasoning
    });
  }
  const providerSource = inputProviders.length
    ? [
        ...inputProviders,
        ...fallbackProviders.filter(fallback => !inputProviders.some(provider => provider?.id === fallback.id))
      ]
    : fallbackProviders;
  const providers = providerSource
    .map(provider => cleanLlmProvider(provider, fallbackProviders.find(item => item.id === provider?.id)))
    .filter(provider => provider.id);
  const activeProviderId = String(input.activeProviderId || providers.find(provider => provider.enabled)?.id || input.provider || DEFAULT_LLM_CONFIG.activeProviderId);
  const hasActiveProvider = providers.some(provider => provider.id === activeProviderId);
  const finalActiveProviderId = hasActiveProvider ? activeProviderId : (providers[0]?.id || DEFAULT_LLM_CONFIG.activeProviderId);
  const finalProviders = providers.map(provider => ({
    ...provider,
    enabled: provider.id === finalActiveProviderId && (input.enabled !== false)
  }));
  const activeProvider = finalProviders.find(provider => provider.id === finalActiveProviderId) || {};
  return {
    provider: activeProvider.provider || String(input.provider || DEFAULT_LLM_CONFIG.provider),
    enabled: finalProviders.some(provider => provider.enabled),
    activeProviderId: finalActiveProviderId,
    host: activeProvider.host || String(input.host || DEFAULT_LLM_CONFIG.host || ""),
    endpoint: activeProvider.endpoint || String(input.endpoint || DEFAULT_LLM_CONFIG.endpoint || ""),
    dashscopeEndpoint: activeProvider.dashscopeEndpoint || String(input.dashscopeEndpoint || DEFAULT_LLM_CONFIG.dashscopeEndpoint || ""),
    apiKey: activeProvider.apiKey || String(input.apiKey || ""),
    model: activeProvider.model || String(input.model || ""),
    apiMode: activeProvider.apiMode || String(input.apiMode || DEFAULT_LLM_CONFIG.apiMode),
    contextWindow: activeProvider.contextWindow || Number(input.contextWindow || DEFAULT_LLM_CONFIG.contextWindow),
    reasoning: activeProvider.reasoning || String(input.reasoning || DEFAULT_LLM_CONFIG.reasoning),
    providers: finalProviders,
    userBackground: cleanMultilineText(input.userBackground || DEFAULT_USER_BACKGROUND)
  };
}

async function readLlmConfig(file = LLM_CONFIG_FILE) {
  return cleanLlmConfig(await readJsonFile(file, DEFAULT_LLM_CONFIG));
}

function maskSecretConfig(config) {
  const apiKey = String(config?.apiKey || "");
  const providers = Array.isArray(config?.providers) ? config.providers.map(provider => ({
    ...provider,
    apiKey: "",
    hasApiKey: Boolean(provider.apiKey)
  })) : undefined;
  return {
    ...config,
    apiKey: "",
    hasApiKey: Boolean(apiKey),
    ...(providers ? { providers } : {})
  };
}

async function readIntegrationConfigs(options = {}) {
  const llm = await readLlmConfig(options.llmConfigFile);
  const googleScholar = await readGoogleScholarConfig(options.googleScholarConfigFile);
  const journalMetrics = await readJournalMetricsConfig(options.journalMetricsConfigFile);
  return {
    llm: maskSecretConfig(llm),
    googleScholar: maskSecretConfig(googleScholar),
    journalMetrics: maskSecretConfig(journalMetrics)
  };
}

async function readIntegrationSecrets(options = {}) {
  const llm = await readLlmConfig(options.llmConfigFile);
  const googleScholar = await readGoogleScholarConfig(options.googleScholarConfigFile);
  const journalMetrics = await readJournalMetricsConfig(options.journalMetricsConfigFile);
  return {
    llm: {
      apiKey: llm.apiKey || "",
      providers: (llm.providers || []).map(provider => ({
        id: provider.id,
        apiKey: provider.apiKey || ""
      }))
    },
    googleScholar: { apiKey: googleScholar.apiKey || "" },
    journalMetrics: { apiKey: journalMetrics.apiKey || "" }
  };
}

function mergeSecretConfig(previous, next, cleaner) {
  const merged = cleaner({
    ...previous,
    ...(next && typeof next === "object" ? next : {})
  });
  if (!String(next?.apiKey || "").trim()) {
    merged.apiKey = previous.apiKey || "";
  }
  return merged;
}

function mergeLlmConfig(previous, next) {
  const hasProviderList = Array.isArray(next?.providers) && next.providers.length > 0;
  const legacySingleConfig = !hasProviderList && Boolean(next?.endpoint || next?.model || next?.apiKey || next?.provider);
  const previousBase = legacySingleConfig
    ? { userBackground: previous.userBackground }
    : previous;
  const merged = cleanLlmConfig({
    ...(hasProviderList ? {} : previousBase),
    ...(next && typeof next === "object" ? next : {}),
    ...(hasProviderList && next.enabled === undefined ? { enabled: true } : {})
  });
  const previousProviders = new Map((previous.providers || []).map(provider => [provider.id, provider]));
  merged.providers = merged.providers.map(provider => {
    if (String(provider.apiKey || "").trim()) return provider;
    return {
      ...provider,
      apiKey: previousProviders.get(provider.id)?.apiKey || ""
    };
  });
  const activeProvider = merged.providers.find(provider => provider.id === merged.activeProviderId) || {};
  return {
    ...merged,
    provider: activeProvider.provider || merged.provider,
    endpoint: activeProvider.endpoint || merged.endpoint,
    apiKey: activeProvider.apiKey || merged.apiKey || "",
    model: activeProvider.model || merged.model,
    apiMode: activeProvider.apiMode || merged.apiMode,
    contextWindow: activeProvider.contextWindow || merged.contextWindow,
    reasoning: activeProvider.reasoning || merged.reasoning
  };
}

async function writeIntegrationConfigs(payload = {}, options = {}) {
  const llmFile = options.llmConfigFile || LLM_CONFIG_FILE;
  const googleFile = options.googleScholarConfigFile || GOOGLE_SCHOLAR_CONFIG_FILE;
  const journalFile = options.journalMetricsConfigFile || JOURNAL_METRICS_CONFIG_FILE;
  const previousLlm = await readLlmConfig(llmFile);
  const previousGoogle = await readGoogleScholarConfig(googleFile);
  const previousJournal = await readJournalMetricsConfig(journalFile);
  const llm = mergeLlmConfig(previousLlm, payload.llm);
  const googleScholar = mergeSecretConfig(previousGoogle, payload.googleScholar, cleanGoogleScholarConfig);
  const journalMetrics = mergeSecretConfig(previousJournal, payload.journalMetrics, cleanJournalMetricsConfig);

  await Promise.all([
    writeJsonFile(llmFile, llm),
    writeJsonFile(googleFile, googleScholar),
    writeJsonFile(journalFile, journalMetrics)
  ]);
  return {
    llm: maskSecretConfig(llm),
    googleScholar: maskSecretConfig(googleScholar),
    journalMetrics: maskSecretConfig(journalMetrics)
  };
}

function getNestedValue(value, dottedPath) {
  if (!dottedPath) return undefined;
  return String(dottedPath).split(".").reduce((current, key) => (
    current && typeof current === "object" ? current[key] : undefined
  ), value);
}

function normalizeJournalMetrics(rawPayload, config, journalName) {
  const impactFactor = getNestedValue(rawPayload, config.responseMap.impactFactor);
  const partition = getNestedValue(rawPayload, config.responseMap.partition);
  const upgradedPartition = getNestedValue(rawPayload, config.responseMap.upgradedPartition);
  if (!impactFactor && !partition && !upgradedPartition) {
    return defaultJournalMetrics();
  }
  return {
    impactFactor: String(impactFactor || ""),
    partition: String(partition || ""),
    upgradedPartition: String(upgradedPartition || ""),
    source: `${config.provider} · ${journalName}`,
    status: "已查询"
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJournalMetricsRateLimit(options = {}) {
  const limiter = options.rateLimiter || JOURNAL_METRICS_RATE_LIMITER;
  const minIntervalMs = clampPositiveInteger(
    options.minIntervalMs,
    DEFAULT_JOURNAL_METRICS_MIN_INTERVAL_MS,
    0,
    60000
  );
  if (!minIntervalMs) return;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const sleepImpl = options.sleep || sleep;
  const previous = limiter.chain;
  let release;
  limiter.chain = new Promise(resolve => {
    release = resolve;
  });
  await previous.catch(() => {});
  try {
    const elapsed = now() - Number(limiter.lastRequestAt || 0);
    const waitMs = Math.max(0, minIntervalMs - elapsed);
    if (waitMs > 0) await sleepImpl(waitMs);
    limiter.lastRequestAt = now();
  } finally {
    release();
  }
}

async function fetchJournalMetrics(journalName, options = {}) {
  const cleanJournalName = compactText(journalName);
  const config = options.config || await readJournalMetricsConfig(options.configFile);
  if (!config.enabled || !config.endpoint || !config.apiKey || !cleanJournalName) {
    return defaultJournalMetrics();
  }

  const request = config.request || {};
  const url = new URL(config.endpoint);
  url.searchParams.set(request.queryName || "publicationName", cleanJournalName);
  if (request.apiKeyQueryName) {
    url.searchParams.set(request.apiKeyQueryName, config.apiKey);
  }
  const headers = { Accept: "application/json" };
  if (request.useApiKeyHeader !== false && request.apiKeyHeader) {
    headers[request.apiKeyHeader] = `${request.apiKeyPrefix || ""}${config.apiKey}`;
  }

  const fetchImpl = options.fetchImpl || fetch;
  await waitForJournalMetricsRateLimit({
    rateLimiter: options.rateLimiter,
    minIntervalMs: options.minIntervalMs ?? config.minIntervalMs,
    now: options.now,
    sleep: options.sleep
  });
  const response = await fetchImpl(url, {
    method: request.method || "GET",
    headers
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`EasyScholar 查询失败：HTTP ${response.status}`);
  }
  return normalizeJournalMetrics(payload, config, cleanJournalName);
}

function isPreprintSource(paper = {}) {
  const text = [paper.journal, paper.venue, paper.source, paper.sourceType]
    .map(value => compactText(value).toLowerCase())
    .join(" ");
  return /\barxiv\b/.test(text) || /\bbiorxiv\b/.test(text) || text.includes("预印本");
}

function paperJournalName(paper) {
  if (isPreprintSource(paper)) return "";
  if (paper.journal) return compactText(paper.journal);
  if (paper.venue) return compactText(paper.venue);
  const source = compactText(paper.source);
  if (!source || /^arXiv\b/i.test(source) || /^bioRxiv\b/i.test(source)) return "";
  const parts = source.split("·").map(part => compactText(part)).filter(Boolean);
  if (parts[0] === "Semantic Scholar" && parts[1]) return parts[1];
  if (/Nature|Science|Cell|Optics|Bioinformatics|Methods/i.test(source)) return parts.at(-1) || source;
  return "";
}

function journalMetricsCacheKey(journalName) {
  return compactText(journalName).toLowerCase();
}

function cleanJournalMetricsCache(cache = {}) {
  const journals = {};
  Object.entries(cache.journals || {}).forEach(([key, entry]) => {
    const journal = compactText(entry?.journal || key);
    const metrics = entry?.metrics || {};
    if (!journal || !hasResolvedJournalMetrics(metrics)) return;
    journals[journalMetricsCacheKey(journal)] = {
      journal,
      metrics,
      updatedAt: entry.updatedAt || cache.updatedAt || new Date().toISOString()
    };
  });
  return {
    updatedAt: cache.updatedAt || "",
    journals
  };
}

async function readJournalMetricsCache(dataDir = DATA_DIR) {
  const file = path.join(dataDir, JOURNAL_METRICS_CACHE_NAME);
  const cache = await readJsonFile(file, { updatedAt: "", journals: {} });
  return cleanJournalMetricsCache(cache);
}

async function writeJournalMetricsCache(cache, dataDir = DATA_DIR) {
  const cleanCache = cleanJournalMetricsCache({
    ...cache,
    updatedAt: cache.updatedAt || new Date().toISOString()
  });
  const file = path.join(dataDir, JOURNAL_METRICS_CACHE_NAME);
  await writeJsonFile(file, cleanCache);
  return file;
}

function getCachedJournalMetrics(cache, journalName) {
  const entry = cache?.journals?.[journalMetricsCacheKey(journalName)];
  return hasResolvedJournalMetrics(entry?.metrics) ? entry.metrics : null;
}

function setCachedJournalMetrics(cache, journalName, metrics, now = new Date().toISOString()) {
  const cleanJournalName = compactText(journalName);
  if (!cleanJournalName || !hasResolvedJournalMetrics(metrics)) return false;
  cache.updatedAt = now;
  cache.journals = cache.journals || {};
  cache.journals[journalMetricsCacheKey(cleanJournalName)] = {
    journal: cleanJournalName,
    metrics,
    updatedAt: now
  };
  return true;
}

function seedJournalMetricsCacheFromPapers(cache, papers, now = new Date().toISOString()) {
  let changed = false;
  papers.forEach(paper => {
    const journalName = paperJournalName(paper);
    if (!journalName || !hasResolvedJournalMetrics(paper.journalMetrics)) return;
    if (getCachedJournalMetrics(cache, journalName)) return;
    changed = setCachedJournalMetrics(cache, journalName, paper.journalMetrics, now) || changed;
  });
  return changed;
}

async function enrichPapersWithJournalMetrics(papers, options = {}) {
  const config = options.config || await readJournalMetricsConfig(options.configFile);
  if (!config.enabled || !config.endpoint || !config.apiKey) return papers;

  const dataDir = options.dataDir || DATA_DIR;
  const persistentCache = options.cache || await readJournalMetricsCache(dataDir);
  const runCache = new Map();
  let cacheChanged = seedJournalMetricsCacheFromPapers(persistentCache, papers);
  const enriched = [];

  for (const paper of papers) {
    const journalName = paperJournalName(paper);
    if (!journalName) {
      enriched.push(paper);
      continue;
    }
    try {
      if (!runCache.has(journalName)) {
        const cachedMetrics = getCachedJournalMetrics(persistentCache, journalName);
        if (cachedMetrics) {
          runCache.set(journalName, cachedMetrics);
        } else {
          const metrics = await fetchJournalMetrics(journalName, { ...options, config });
          if (hasResolvedJournalMetrics(metrics)) {
            const now = new Date().toISOString();
            setCachedJournalMetrics(persistentCache, journalName, metrics, now);
            cacheChanged = true;
          }
          runCache.set(journalName, metrics);
        }
      }
      const metrics = runCache.get(journalName);
      enriched.push(hasResolvedJournalMetrics(metrics) ? { ...paper, journalMetrics: metrics } : paper);
    } catch (error) {
      enriched.push(paper);
    }
  }

  if (cacheChanged && !options.cache) await writeJournalMetricsCache(persistentCache, dataDir);
  return enriched;
}

async function writeJsonFile(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

async function readGoogleRollingCursors(dataDir = DATA_DIR) {
  const data = await readJsonFile(path.join(dataDir, GOOGLE_ROLLING_CURSOR_NAME), { cursors: {} });
  return data && typeof data.cursors === "object" ? data : { cursors: {} };
}

async function writeGoogleRollingCursors(payload, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, GOOGLE_ROLLING_CURSOR_NAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
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
  const doi = normalizeDoi(entry.doi);
  const journal = "arXiv";
  const published = entry.published || entry.updated || "";
  return {
    id: `arxiv-${idPart || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    doi,
    journal,
    citation: formatCitation({ authors, year: paperYear(published), title, journal, doi }),
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
    published
  };
}

function normalizeBioRxivItem(item, keywords = DEFAULT_KEYWORDS) {
  const title = compactText(item.title || item.preprint_title);
  const summary = compactText(item.abstract || item.preprint_abstract);
  const categoryName = compactText(item.category || item.preprint_category || "bioRxiv");
  const text = `${title} ${summary} ${categoryName}`;
  const classified = classifyPaper(`bioimage biology ${text}`);
  const doi = normalizeDoi(item.doi || item.biorxiv_doi);
  const journal = "bioRxiv";
  const authors = compactText(item.authors || item.preprint_authors)
    .split(/\s*;\s*/)
    .map(author => author.trim())
    .filter(Boolean);
  const published = item.date || item.preprint_date || "";
  return {
    id: `biorxiv-${doi || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    doi,
    journal,
    citation: formatCitation({ authors, year: paperYear(published), title, journal, doi }),
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
    published
  };
}

function parseEnabledSources(sourceNames) {
  const names = (Array.isArray(sourceNames) ? sourceNames : []).map(name => String(name || "").toLowerCase());
  const sources = [];
  if (names.some(name => name.includes("arxiv"))) sources.push("arxiv");
  if (names.some(name => name.includes("biorxiv") || name.includes("bioarxiv"))) sources.push("biorxiv");
  if (names.some(name => name.includes("semantic scholar") || name.includes("semanticscholar"))) sources.push("semanticscholar");
  if (names.some(name => name.includes("google scholar") || name.includes("googlescholar") || name.includes("谷歌学术"))) sources.push("googlescholar");
  if (names.some(name => (name.includes("google") || name.includes("谷歌")) && !name.includes("scholar") && !name.includes("学术"))) sources.push("googlesearch");
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

async function fetchArxivPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const params = new URLSearchParams({
    search_query: buildArxivQuery(keywords),
    start: "0",
    max_results: String(options.maxResults || 50),
    sortBy: "submittedDate",
    sortOrder: "descending"
  });
  const xml = await fetchText(`${ARXIV_ENDPOINT}?${params.toString()}`);
  return parseArxivEntries(xml).map(entry => normalizeArxivEntry(entry, keywords));
}

async function fetchBioRxivPapers(date, keywords = DEFAULT_KEYWORDS, options = {}) {
  const startDate = options.startDate || date;
  const endDate = options.endDate || date;
  const data = await fetchJson(`${BIORXIV_ENDPOINT}/${startDate}/${endDate}/0/json`);
  const items = Array.isArray(data.collection) ? data.collection : [];
  return filterPapersByKeywords(items.map(item => normalizeBioRxivItem(item, keywords)), keywords);
}

function buildSemanticScholarQuery(keywords = DEFAULT_KEYWORDS) {
  const clean = cleanKeywords(keywords)
    .map(keyword => ACRONYM_EXPANSIONS[keyword.toLowerCase()] || keyword)
    .filter(keyword => !/[\u4e00-\u9fff]/.test(keyword));
  const unique = Array.from(new Set(clean.map(keyword => keyword.toLowerCase())))
    .map(lower => clean.find(keyword => keyword.toLowerCase() === lower));
  return unique.slice(0, 5).join(" ") || "computational microscopy reconstruction";
}

function normalizeSemanticScholarPaper(item, keywords = DEFAULT_KEYWORDS) {
  const title = compactText(item.title);
  const summary = compactText(item.abstract);
  const venue = compactText(item.journal?.name || item.venue || item.publicationVenue?.name || "论文数据库");
  const text = `${title} ${summary} ${venue}`;
  const classified = classifyPaper(text);
  const authors = Array.isArray(item.authors)
    ? item.authors.map(author => compactText(author.name)).filter(Boolean)
    : [];
  const published = item.publicationDate || (item.year ? String(item.year) : "");
  const doi = normalizeDoi(item.externalIds?.DOI || item.externalIds?.doi || item.doi);
  const journal = venue;
  return {
    id: `semanticscholar-${compactText(item.paperId || title)}`,
    doi,
    journal,
    citation: formatCitation({ authors, year: paperYear(published), title, journal, doi }),
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

function isRobotChallengeText(text) {
  return /captcha|automated queries|unusual traffic|bot detection|cf-chl|cloudflare challenge|just a moment/i.test(String(text || ""));
}

function isRobotChallengePayload(payload) {
  const statusText = [
    payload?.error,
    payload?.message,
    payload?.search_metadata?.status,
    payload?.search_metadata?.error,
    payload?.serpapi_error
  ].map(value => compactText(value)).filter(Boolean).join(" ");
  return isRobotChallengeText(statusText);
}

function serpApiNextUrl(payload) {
  const pagination = payload?.serpapi_pagination || payload?.pagination || {};
  return compactText(pagination.next || pagination.next_link);
}

function serpApiStartValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function googleStartFromItem(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) - 1 : null;
}

function googleManualStart(options = {}) {
  const startItem = googleStartFromItem(options.startItem);
  return startItem === null ? googleStartFromItem(options.googleStartItem) : startItem;
}

function googleRollingCursorKey({ sourceLabel, keywords, config, num }) {
  return crypto.createHash("sha1").update(JSON.stringify({
    sourceLabel,
    endpoint: compactText(config.endpoint),
    query: cleanKeywords(keywords).map(keyword => keyword.toLowerCase()).sort(),
    num
  })).digest("hex");
}

async function readGoogleRollingStart(params) {
  if (!params.config?.rollingFetch) return 0;
  const data = await readGoogleRollingCursors(params.dataDir);
  const cursor = data.cursors[params.key] || {};
  return serpApiStartValue(cursor.nextStart, 0);
}

async function writeGoogleRollingStart(params) {
  if (!params.config?.rollingFetch) return;
  const data = await readGoogleRollingCursors(params.dataDir);
  data.cursors[params.key] = {
    nextStart: serpApiStartValue(params.nextStart, 0),
    source: params.sourceLabel,
    keywords: cleanKeywords(params.keywords),
    num: params.num,
    maxPages: params.maxPages,
    updatedAt: new Date().toISOString()
  };
  await writeGoogleRollingCursors(data, params.dataDir);
}

function googleRollingSources(sourceNames) {
  const enabledSources = parseEnabledSources(sourceNames);
  const labels = [];
  if (!enabledSources.length || enabledSources.includes("googlescholar")) labels.push("Google Scholar");
  if (!enabledSources.length || enabledSources.includes("googlesearch")) labels.push("Google 搜索");
  return labels;
}

function googleRollingCursorDescriptors({ keywords = DEFAULT_KEYWORDS, config = DEFAULT_GOOGLE_SCHOLAR_CONFIG, sources = [] } = {}) {
  const num = Number(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num);
  return googleRollingSources(sources).map(label => ({
    label,
    key: googleRollingCursorKey({ sourceLabel: label, keywords, config, num }),
    num
  }));
}

async function readGoogleRollingCursorStatus(options = {}) {
  const config = options.config || await readGoogleScholarConfig(options.configFile);
  const data = await readGoogleRollingCursors(options.dataDir || DATA_DIR);
  const items = googleRollingCursorDescriptors({
    keywords: options.keywords || DEFAULT_KEYWORDS,
    config,
    sources: options.sources || []
  }).map(item => {
    const cursor = data.cursors[item.key] || {};
    const nextStart = config.rollingFetch ? serpApiStartValue(cursor.nextStart, 0) : 0;
    return {
      source: item.label === "Google Scholar" ? "googlescholar" : "googlesearch",
      label: item.label,
      nextStart,
      nextItem: nextStart + 1,
      rollingFetch: config.rollingFetch === true,
      updatedAt: cursor.updatedAt || ""
    };
  });
  return { ok: true, items };
}

async function resetGoogleRollingCursors(options = {}) {
  const config = options.config || await readGoogleScholarConfig(options.configFile);
  const dataDir = options.dataDir || DATA_DIR;
  const data = await readGoogleRollingCursors(dataDir);
  let resetCount = 0;
  for (const item of googleRollingCursorDescriptors({
    keywords: options.keywords || DEFAULT_KEYWORDS,
    config,
    sources: options.sources || []
  })) {
    if (data.cursors[item.key]) {
      delete data.cursors[item.key];
      resetCount += 1;
    }
  }
  await writeGoogleRollingCursors(data, dataDir);
  const status = await readGoogleRollingCursorStatus({ ...options, config, dataDir });
  return { ok: true, resetCount, items: status.items };
}

function nextSerpApiStart(currentUrl, fallbackStart, num) {
  if (!currentUrl) return fallbackStart + num;
  const nextStart = Number(currentUrl.searchParams.get("start"));
  if (Number.isFinite(nextStart)) return nextStart;
  return fallbackStart + num;
}

function emitSerpApiPageProgress(onProgress, { sourceLabel, pageStart, pageSize, pageIndex, maxPages, skipped = false, message }) {
  if (typeof onProgress !== "function") return;
  const page = Math.floor(pageStart / pageSize) + 1;
  const itemStart = pageStart + 1;
  const itemEnd = pageStart + pageSize;
  const sourcePage = {
    sourceLabel,
    page,
    maxPages,
    start: pageStart,
    num: pageSize,
    itemStart,
    itemEnd
  };
  if (skipped) {
    sourcePage.skipped = true;
    sourcePage.message = compactText(message);
  }
  onProgress({
    stage: "source-page",
    percent: Math.min(18, 8 + Math.round((pageIndex / Math.max(1, maxPages)) * 10)),
    message: skipped ? `${sourceLabel} 第 ${page} 页跳过` : `${sourceLabel} 第 ${page} 页正在抓取`,
    detail: skipped ? `第 ${itemStart}-${itemEnd} 篇失败，已继续后续页` : `正在抓第 ${page} 页，第 ${itemStart}-${itemEnd} 篇`,
    sourcePage
  });
}

async function fetchSerpApiPages(url, { request, headers, fetchImpl, sourceLabel, maxPages = 50, start = 0, num = 10, onProgress, skipBlockedPages = false }) {
  const pages = [];
  const skippedPages = [];
  const seenUrls = new Set();
  const authQueryName = request.apiKeyQueryName || "";
  const authQueryValue = authQueryName ? url.searchParams.get(authQueryName) : "";
  const resultCountValue = url.searchParams.get("num") || "";
  const pageSize = Number(resultCountValue || num || 10);
  let currentUrl = new URL(url.toString());
  let lastStart = serpApiStartValue(start, 0);
  let attemptedPages = 0;
  if (lastStart > 0) currentUrl.searchParams.set("start", String(lastStart));
  const skipCurrentPage = message => {
    if (!skipBlockedPages) return false;
    skippedPages.push({ start: lastStart, num: pageSize, itemStart: lastStart + 1, itemEnd: lastStart + pageSize, message });
    emitSerpApiPageProgress(onProgress, {
      sourceLabel,
      pageStart: lastStart,
      pageSize,
      pageIndex: attemptedPages,
      maxPages,
      skipped: true,
      message
    });
    currentUrl.searchParams.set("start", String(lastStart + pageSize));
    return true;
  };
  while (currentUrl && attemptedPages < maxPages) {
    const urlKey = currentUrl.toString();
    if (seenUrls.has(urlKey)) break;
    seenUrls.add(urlKey);
    lastStart = serpApiStartValue(currentUrl.searchParams.get("start"), lastStart);
    attemptedPages += 1;
    emitSerpApiPageProgress(onProgress, {
      sourceLabel,
      pageStart: lastStart,
      pageSize,
      pageIndex: attemptedPages,
      maxPages
    });

    const response = await fetchImpl(currentUrl, {
      method: request.method || "GET",
      headers,
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    if (!response.ok || response.status === 403 || response.status === 429) {
      const message = `${sourceLabel} 信源失败：HTTP ${response.status}`;
      if ((response.status === 403 || response.status === 429) && skipCurrentPage(message)) continue;
      throw new Error(message);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      if (isRobotChallengeText(text)) {
        const message = `${sourceLabel} 机器人访问/反爬挑战：请使用 SerpApi 等合规 JSON API`;
        if (skipCurrentPage(message)) continue;
        throw new Error(message);
      }
      throw new Error(`${sourceLabel} 信源返回的不是 JSON；请使用 SerpApi / 合规代理端点`);
    }
    if (isRobotChallengePayload(payload)) {
      const message = `${sourceLabel} 机器人访问/反爬挑战：API 返回了验证或限流提示`;
      if (skipCurrentPage(message)) continue;
      throw new Error(message);
    }
    pages.push(payload);

    const nextUrl = serpApiNextUrl(payload);
    if (!nextUrl) {
      currentUrl = null;
    } else {
      currentUrl = new URL(nextUrl, currentUrl);
      if (authQueryName && authQueryValue && !currentUrl.searchParams.has(authQueryName)) {
        currentUrl.searchParams.set(authQueryName, authQueryValue);
      }
      if (resultCountValue && !currentUrl.searchParams.has("num")) {
        currentUrl.searchParams.set("num", resultCountValue);
      }
    }
  }
  return {
    pages,
    skippedPages,
    nextStart: nextSerpApiStart(currentUrl, lastStart, pageSize)
  };
}

function normalizeScholarAuthors(value) {
  if (Array.isArray(value)) {
    return value.map(author => compactText(author?.name || author)).filter(Boolean);
  }
  return compactText(value)
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map(author => author.trim())
    .filter(Boolean);
}

function parseScholarPublicationSummary(value) {
  const summary = compactText(value);
  if (!summary) return { authors: [], journal: "", year: "" };
  const parts = summary.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  const authors = normalizeScholarAuthors(parts[0] || "");
  const yearMatch = summary.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";
  let journal = "";
  if (parts.length >= 3 && /^\d{4}$/.test(parts[1])) {
    journal = parts[2];
  } else if (parts[1]) {
    journal = parts[1].replace(/\b(19|20)\d{2}\b/g, "").replace(/,+\s*$/, "").trim();
  }
  journal = journal
    .replace(/\s*-\s*.*$/, "")
    .replace(/\s*\.\.\.$/, "")
    .replace(/\.+$/, "")
    .trim();
  return { authors, journal, year };
}

function scholarPublishedDate(item, year) {
  const text = [
    item?.link,
    item?.url,
    item?.snippet,
    item?.summary,
    item?.publication_info?.summary,
    item?.date,
    item?.title
  ].map(compactText).join(" ");
  const dotted = text.match(/\b((?:19|20)\d{2})[./-](\d{2})[./-](\d{2})\b/);
  if (dotted) return `${dotted[1]}-${dotted[2]}-${dotted[3]}`;
  const named = text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*((?:19|20)\d{2})\b/i);
  if (named) {
    const month = new Date(`${named[0]} UTC`).getUTCMonth() + 1;
    if (month) return `${named[2]}-${String(month).padStart(2, "0")}-${String(named[1]).padStart(2, "0")}`;
  }
  return year && /^\d{4}$/.test(year) ? year : year;
}

function normalizeGoogleScholarPaper(item, keywords = DEFAULT_KEYWORDS, responseMap = DEFAULT_GOOGLE_SCHOLAR_CONFIG.responseMap) {
  const title = compactText(getNestedValue(item, responseMap.title) || item.title);
  const summary = compactText(getNestedValue(item, responseMap.summary) || item.snippet || item.summary);
  const publicationSummary = getNestedValue(item, responseMap.journal) || item.publication_info?.summary || "";
  const parsedPublication = parseScholarPublicationSummary(publicationSummary);
  const journal = compactText(item.journal || item.venue || parsedPublication.journal || publicationSummary || "Google Scholar");
  const mappedYear = compactText(getNestedValue(item, responseMap.year));
  const parsedYear = parseScholarPublicationSummary(mappedYear).year;
  const year = compactText(parsedYear || parsedPublication.year || item.year || item.publication_year);
  const published = scholarPublishedDate(item, year);
  const doi = normalizeDoi(getNestedValue(item, responseMap.doi) || item.doi);
  const authors = normalizeScholarAuthors(getNestedValue(item, responseMap.authors) || item.authors || item.publication_info?.authors);
  const authorList = authors.length ? authors : parsedPublication.authors;
  const text = `${title} ${summary} ${journal}`;
  const classified = classifyPaper(text);
  return {
    id: `googlescholar-${doi || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    doi,
    journal,
    citation: formatCitation({ authors: authorList, year: paperYear(published), title, journal, doi }),
    time: timeString(published),
    sourceType: "论文搜索",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: `Google Scholar · ${journal}`,
    title,
    summary,
    tags: [journal, "Google Scholar", ...authorList.slice(0, 2)].filter(Boolean).slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url: getNestedValue(item, responseMap.url) || item.link || item.url || "",
    authors: authorList,
    published
  };
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("base64url").slice(0, 16);
}

function titleLooksTruncated(value) {
  return /\.\.\.|…/.test(String(value || ""));
}

function normalizeGoogleSearchPaper(item, keywords = DEFAULT_KEYWORDS, responseMap = DEFAULT_GOOGLE_SCHOLAR_CONFIG.responseMap) {
  const title = compactText(getNestedValue(item, responseMap.title) || item.title);
  const summary = compactText(getNestedValue(item, responseMap.summary) || item.snippet || item.summary);
  const url = getNestedValue(item, responseMap.url) || item.link || item.url || "";
  const journal = compactText(getNestedValue(item, responseMap.journal) || item.source || item.displayed_link || hostnameFromUrl(url) || "Google 搜索");
  const year = compactText(getNestedValue(item, responseMap.year) || item.date).match(/\b(19|20)\d{2}\b/)?.[0] || "";
  const published = scholarPublishedDate(item, year);
  const doi = normalizeDoi(getNestedValue(item, responseMap.doi) || item.doi);
  const text = `${title} ${summary} ${journal}`;
  const classified = classifyPaper(text);
  return {
    id: `googlesearch-${doi || hashText(`${url}|${title}`)}`,
    doi,
    journal,
    citation: formatCitation({ year: paperYear(published), title, journal, doi }),
    time: timeString(published),
    sourceType: "网页搜索",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: `Google 搜索 · ${journal}`,
    title,
    summary,
    tags: [journal, "Google 搜索"].filter(Boolean).slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url,
    authors: [],
    published
  };
}

function cleanHtmlTitle(value) {
  return compactText(decodeXml(String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-|]\s*(Nature|SpringerLink|Optica Publishing Group|Light: Science & Applications|ScienceDirect|Wiley Online Library|PubMed|PMC|MDPI)\s*$/i, "")
    .replace(/\s*[-|]\s*Optica\s*$/i, "")));
}

function extractHtmlPaperTitle(html) {
  const text = String(html || "");
  const citation = text.match(/<meta\b[^>]*(?:name|property)=["']citation_title["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || text.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']citation_title["'][^>]*>/i);
  if (citation) return cleanHtmlTitle(citation[1]);
  const og = text.match(/<meta\b[^>]*(?:property|name)=["'](?:og:title|dc\.title|twitter:title)["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || text.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:title|dc\.title|twitter:title)["'][^>]*>/i);
  if (og) return cleanHtmlTitle(og[1]);
  const title = text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? cleanHtmlTitle(stripTags(title[1])) : "";
}

async function enrichTruncatedGoogleTitles(papers, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  return Promise.all(papers.map(async paper => {
    if (!titleLooksTruncated(paper?.title) || !/^https?:\/\//i.test(paper?.url || "")) return paper;
    try {
      const response = await fetchImpl(paper.url, {
        headers: { "User-Agent": "paperHOT/0.1 (mailto:local@example.invalid)", Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) return paper;
      const html = await response.text();
      const title = extractHtmlPaperTitle(html);
      if (!title || titleLooksTruncated(title)) return paper;
      return completePaperRecord({
        ...paper,
        title,
        citation: formatCitation({
          authors: Array.isArray(paper.authors) ? paper.authors : [],
          year: paperYear(paper.published),
          title,
          journal: paper.journal,
          doi: paper.doi
        })
      });
    } catch {
      return paper;
    }
  }));
}

function textTokens(value) {
  return compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length > 2);
}

function titleSimilarity(left, right) {
  const leftTokens = new Set(textTokens(left));
  const rightTokens = new Set(textTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const matches = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return matches / Math.max(leftTokens.size, rightTokens.size);
}

function crossrefTitleMatches(sourceTitle, metadataTitle) {
  if (titleSimilarity(sourceTitle, metadataTitle) >= 0.65) return true;
  if (!/\.\.\.|…/.test(sourceTitle)) return false;
  const sourceTokens = textTokens(sourceTitle);
  const metadataTokens = new Set(textTokens(metadataTitle));
  if (!sourceTokens.length || !metadataTokens.size) return false;
  const matches = sourceTokens.filter(token => metadataTokens.has(token)).length;
  return matches / sourceTokens.length >= 0.8;
}

function crossrefDate(parts) {
  const values = Array.isArray(parts?.["date-parts"]?.[0]) ? parts["date-parts"][0] : [];
  if (!values.length) return "";
  const [year, month = 1, day = 1] = values;
  return [year, month, day]
    .map((value, index) => index === 0 ? String(value).padStart(4, "0") : String(value).padStart(2, "0"))
    .join("-");
}

function crossrefMetadataFromItem(item) {
  const title = compactText(Array.isArray(item?.title) ? item.title[0] : item?.title);
  const container = Array.isArray(item?.["container-title"]) ? item["container-title"][0] : item?.["container-title"];
  const authors = Array.isArray(item?.author)
    ? item.author.map(author => compactText([author.given, author.family].filter(Boolean).join(" "))).filter(Boolean)
    : [];
  return {
    doi: normalizeDoi(item?.DOI || item?.doi),
    journal: compactText(container),
    authors,
    published: crossrefDate(item?.published || item?.["published-print"] || item?.["published-online"]),
    title
  };
}

function normalizeCrossrefWork(item, sourceTitle = "") {
  const metadata = crossrefMetadataFromItem(item);
  const similarity = titleSimilarity(sourceTitle, metadata.title);
  if (!metadata.title || similarity < 0.65) return null;
  return metadata;
}

function inferDoiFromUrl(value) {
  const url = String(value || "");
  const nature = url.match(/nature\.com\/articles\/([^/?#]+)/i);
  if (nature) return normalizeDoi(`10.1038/${nature[1]}`);
  return "";
}

async function fetchCrossrefWorkByDoi(doi, options = {}) {
  const cleanDoi = normalizeDoi(doi);
  if (!cleanDoi) return null;
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${CROSSREF_WORKS_ENDPOINT}/${encodeURIComponent(cleanDoi)}`, {
    headers: { "User-Agent": "paperHOT/0.1 (mailto:local@example.invalid)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Crossref DOI 元数据补全失败：HTTP ${response.status}`);
  const payload = await response.json();
  return payload?.message ? crossrefMetadataFromItem(payload.message) : null;
}

async function fetchCrossrefWorkByTitle(paper, options = {}) {
  const doi = normalizeDoi(paper?.doi) || inferDoiFromUrl(paper?.url);
  if (doi) return fetchCrossrefWorkByDoi(doi, options);
  const title = compactText(paper?.title);
  if (!title) return null;
  const url = new URL(CROSSREF_WORKS_ENDPOINT);
  url.searchParams.set("query.bibliographic", title);
  url.searchParams.set("rows", String(options.rows || 3));
  url.searchParams.set("select", "DOI,title,container-title,author,published,published-print,published-online");
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "paperHOT/0.1 (mailto:local@example.invalid)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Crossref DOI 补全失败：HTTP ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload?.message?.items) ? payload.message.items : [];
  return items.map(item => normalizeCrossrefWork(item, title)).find(item => item?.doi) || null;
}

function applyCrossrefMetadata(paper, metadata, options = {}) {
  if (!metadata?.doi) return completePaperRecord(paper);
  if (options.requireTitleMatch && !crossrefTitleMatches(paper.title, metadata.title)) {
    return completePaperRecord({
      ...paper,
      doi: "",
      url: "",
      sourceWarning: "Google 搜索链接与 Crossref 标题不一致，已移除可疑链接"
    });
  }
  const doi = normalizeDoi(metadata.doi);
  const journal = compactText(metadata.journal) || inferJournal(paper);
  const authors = Array.isArray(metadata.authors) && metadata.authors.length ? metadata.authors : paper.authors;
  const published = metadata.published || paper.published;
  const title = /\.\.\.|…/.test(paper.title) ? (compactText(metadata.title) || paper.title) : paper.title;
  const source = /^Google\s+搜索\s*·/i.test(paper.source || "") && journal ? `Google 搜索 · ${journal}` : paper.source;
  return completePaperRecord({
    ...paper,
    title,
    doi,
    journal,
    source,
    authors,
    published,
    citation: formatCitation({
      authors: Array.isArray(authors) ? authors : [],
      year: paperYear(published),
      title,
      journal,
      doi
    })
  });
}

async function enrichPapersWithCrossref(papers, options = {}) {
  const fetcher = options.fetcher || (paper => fetchCrossrefWorkByTitle(paper, options));
  const errors = Array.isArray(options.errors) ? options.errors : null;
  return Promise.all(papers.map(async paper => {
    const inferredDoi = inferDoiFromUrl(paper?.url);
    const record = completePaperRecord({ ...paper, doi: inferredDoi || paper?.doi });
    if (record.doi && !/\.\.\.|…/.test(record.title) && !inferredDoi) return record;
    try {
      if (record.doi && !/\.\.\.|…/.test(record.title)) {
        const metadata = await fetcher(record);
        return applyCrossrefMetadata(record, metadata, { requireTitleMatch: true });
      }
      const metadata = await fetcher(record);
      return applyCrossrefMetadata(record, metadata);
    } catch (error) {
      if (errors) errors.push({ source: "crossref", message: error.message, paper: summarizePaperForOperationLog(record) });
      return record;
    }
  }));
}
function buildLlmPaperPrompt(paper, userBackground) {
  return [
    "请作为中文科研论文助手，根据用户背景判断论文价值。",
    "只返回 JSON，不要返回 Markdown。JSON 字段：abstractZh, reason, shortTitle。",
    "保留英文标题不翻译；abstractZh 严格按照原始摘要翻译成中文，不要扩写、改写或加入评价。",
    "reason 写成通俗的推荐理由：不要重复摘要，不要写‘为什么与你相关’或‘高度相关’，用 1-2 句说明这篇最值得看的点、能给用户当前工作带来什么启发。",
    "shortTitle 只写成 年份@，例如 2026@；不要自动补技术缩写，@ 后面的具体技术名称留给用户手动填写。",
    userBackground,
    `英文标题：${paper.title}`,
    `原始摘要：${paper.summary}`,
    `期刊/来源：${paper.journal || paper.source}`,
    `DOI：${paper.doi || "未记录"}`
  ].join("\n");
}

function parseLlmJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function llmChatCompletionsUrl(endpoint) {
  const cleanEndpoint = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!cleanEndpoint) return "";
  if (/\/chat\/completions$/i.test(cleanEndpoint)) return cleanEndpoint;
  return `${cleanEndpoint}/chat/completions`;
}

async function callConfiguredLlm({ paper, userBackground, config, fetchImpl }) {
  if (!config.enabled || !config.endpoint || !config.model) return null;  if (config.apiMode === "local") throw new Error("本地 CLI 模型暂不支持网页连通性测试");

  const response = await fetchImpl(llmChatCompletionsUrl(config.endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "你是服务于显微成像方向科研人员的中文论文阅读助手。" },
        { role: "user", content: buildLlmPaperPrompt(paper, userBackground) }
      ],
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`LLM 摘要失败：HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || payload?.output_text || "";
  const parsed = parseLlmJson(content);
  return {
    abstractZh: parsed.abstractZh || parsed.abstractTranslation || parsed.translatedAbstract || parsed.summary,
    reason: parsed.reason,
    shortTitle: parsed.shortTitle || parsed.short_title || parsed.shortName,
    tokenUsage: {
      prompt: Number(payload?.usage?.prompt_tokens || 0),
      completion: Number(payload?.usage?.completion_tokens || 0),
      total: Number(payload?.usage?.total_tokens || 0),
      model: config.model,
      status: "已调用 AI"
    }
  };
}

async function testLlmConfig(payload = {}, options = {}) {
  const previous = await readLlmConfig(options.configFile);
  const config = mergeLlmConfig(previous, payload.llm || payload);
  if (!config.enabled) throw new Error("LLM 未启用，请先打开右侧开关");
  if (!config.endpoint) throw new Error("LLM Endpoint 未填写");
  if (!config.model) throw new Error("LLM 模型未填写");
  if (!config.apiKey && config.apiMode !== "local") throw new Error("LLM API 密钥未填写");
  const insight = await callConfiguredLlm({
    paper: {
      title: "Structured illumination microscopy connectivity test",
      summary: "This is a short connection test for structured illumination microscopy paper summarization.",
      reason: "连接测试",
      journal: "paperHOT test",
      doi: ""
    },
    userBackground: config.userBackground || DEFAULT_USER_BACKGROUND,
    config,
    fetchImpl: options.fetchImpl || fetch
  });
  return {
    ok: true,
    provider: config.provider,
    model: config.model,
    endpoint: llmChatCompletionsUrl(config.endpoint),
    abstractZh: compactText(insight?.abstractZh || insight?.summary || ""),
    llmSummary: compactText(insight?.llmSummary || ""),
    reason: compactText(insight?.reason || ""),
    tokenUsage: insight?.tokenUsage || defaultTokenUsage()
  };
}
function applyLlmPaperInsight(paper, insight) {
  const legacySummary = compactText(insight?.summary);
  const abstractZh = compactText(insight?.abstractZh || insight?.abstractTranslation || insight?.translatedAbstract || legacySummary);
  const reason = compactText(insight?.reason);
  const generatedShortTitle = compactText(insight?.shortTitle || insight?.short_title || insight?.shortName);
  if (!abstractZh && !reason) return paper;
  const nextPaper = {
    ...paper,
    abstractZh: abstractZh || paper.abstractZh,
    reason: reason || paper.reason,
    shortTitle: normalizeGeneratedShortTitle(paper, generatedShortTitle || paper.shortTitle),
    tokenUsage: {
      ...defaultTokenUsage(),
      ...(paper.tokenUsage || {}),
      ...(insight?.tokenUsage || {}),
      status: insight?.tokenUsage?.status || "已调用 AI"
    }
  };
  return {
    ...nextPaper,
    shortTitle: nextPaper.shortTitle || inferPaperShortTitle(nextPaper)
  };
}

async function enrichPapersWithLlmInsights(papers, options = {}) {
  const errors = Array.isArray(options.errors) ? options.errors : null;
  const llmLog = Array.isArray(options.llmLog) ? options.llmLog : null;
  const fetcher = options.fetcher;
  const config = options.config || await readLlmConfig(options.configFile);
  const enabled = Boolean(fetcher) || (config.enabled && config.endpoint && config.model);
  if (!enabled) return papers;
  const userBackground = compactText(options.userBackground || config.userBackground || DEFAULT_USER_BACKGROUND);
  const fetchImpl = options.fetchImpl || fetch;
  return Promise.all(papers.map(async paper => {
    try {
      const insight = fetcher
        ? await fetcher({ paper, userBackground })
        : await callConfiguredLlm({ paper, userBackground, config, fetchImpl });
      if (llmLog && insight?.tokenUsage?.status === "已调用 AI") {
        const usage = insight.tokenUsage;
        const prompt = Number(usage.prompt || 0);
        const completion = Number(usage.completion || 0);
        llmLog.push({
          model: usage.model || config.model || "未记录模型",
          prompt,
          completion,
          total: Number(usage.total || prompt + completion),
          paperId: paper.id,
          paperTitle: paper.title
        });
      }
      return applyLlmPaperInsight(paper, insight);
    } catch (error) {
      if (errors) errors.push({ source: "llm", message: error.message, paper: summarizePaperForOperationLog(paper) });
      return paper;
    }
  }));
}
async function fetchGoogleScholarPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const config = options.config || await readGoogleScholarConfig(options.configFile);
  if (!config.enabled || !config.endpoint) {
    throw new Error("Google Scholar 信源未配置：请填写 config/google-scholar.json 后再启用");
  }

  const request = config.request || {};
  const url = new URL(config.endpoint);
  url.searchParams.set(request.queryName || "q", buildSemanticScholarQuery(keywords));
  url.searchParams.set("num", String(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num));
  if (request.apiKeyQueryName && config.apiKey) {
    url.searchParams.set(request.apiKeyQueryName, config.apiKey);
  }
  const headers = { Accept: "application/json" };
  if (request.useApiKeyHeader !== false && request.apiKeyHeader && config.apiKey) {
    headers[request.apiKeyHeader] = `${request.apiKeyPrefix || ""}${config.apiKey}`;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const num = Number(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num);
  const maxPages = options.maxPages || config.maxPages || DEFAULT_GOOGLE_SCHOLAR_CONFIG.maxPages;
  const cursorKey = googleRollingCursorKey({ sourceLabel: "Google Scholar", keywords, config, num });
  const rollingStart = await readGoogleRollingStart({
    dataDir: options.dataDir || DATA_DIR,
    config,
    key: cursorKey
  });
  const manualStart = googleManualStart(options);
  const start = manualStart === null ? rollingStart : manualStart;
  const result = await fetchSerpApiPages(url, {
    request,
    headers,
    fetchImpl,
    sourceLabel: "Google Scholar",
    maxPages,
    start,
    num,
    onProgress: options.onProgress,
    skipBlockedPages: config.rollingFetch === true
  });
  await writeGoogleRollingStart({
    dataDir: options.dataDir || DATA_DIR,
    config,
    key: cursorKey,
    nextStart: result.nextStart,
    sourceLabel: "Google Scholar",
    keywords,
    num,
    maxPages
  });
  const pages = result.pages;
  const items = pages.flatMap(payload => {
    const pageItems = getNestedValue(payload, config.responseMap.items);
    return Array.isArray(pageItems) ? pageItems : [];
  });
  if (!items.length) return [];
  return filterPapersByKeywords(
    items.map(item => normalizeGoogleScholarPaper(item, keywords, config.responseMap)),
    keywords
  );
}

async function fetchGoogleSearchPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const config = options.config || await readGoogleScholarConfig(options.configFile);
  if (!config.enabled || !config.endpoint) {
    throw new Error("Google 搜索信源未配置：请填写 config/google-scholar.json 的 SerpApi 配置后再启用");
  }

  const request = config.request || {};
  const url = new URL(config.endpoint);
  url.searchParams.set("engine", "google");
  url.searchParams.set(request.queryName || "q", buildSemanticScholarQuery(keywords));
  url.searchParams.set("num", String(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num));
  if (request.apiKeyQueryName && config.apiKey) {
    url.searchParams.set(request.apiKeyQueryName, config.apiKey);
  }
  const headers = { Accept: "application/json" };
  if (request.useApiKeyHeader !== false && request.apiKeyHeader && config.apiKey) {
    headers[request.apiKeyHeader] = `${request.apiKeyPrefix || ""}${config.apiKey}`;
  }

  const responseMap = {
    ...config.responseMap,
    journal: config.responseMap.journal === DEFAULT_GOOGLE_SCHOLAR_CONFIG.responseMap.journal ? "source" : config.responseMap.journal,
    year: config.responseMap.year === DEFAULT_GOOGLE_SCHOLAR_CONFIG.responseMap.year ? "date" : config.responseMap.year
  };
  const fetchImpl = options.fetchImpl || fetch;
  const num = Number(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num);
  const maxPages = options.maxPages || config.maxPages || DEFAULT_GOOGLE_SCHOLAR_CONFIG.maxPages;
  const cursorKey = googleRollingCursorKey({ sourceLabel: "Google 搜索", keywords, config, num });
  const rollingStart = await readGoogleRollingStart({
    dataDir: options.dataDir || DATA_DIR,
    config,
    key: cursorKey
  });
  const manualStart = googleManualStart(options);
  const start = manualStart === null ? rollingStart : manualStart;
  const result = await fetchSerpApiPages(url, {
    request,
    headers,
    fetchImpl,
    sourceLabel: "Google 搜索",
    maxPages,
    start,
    num,
    onProgress: options.onProgress,
    skipBlockedPages: config.rollingFetch === true
  });
  await writeGoogleRollingStart({
    dataDir: options.dataDir || DATA_DIR,
    config,
    key: cursorKey,
    nextStart: result.nextStart,
    sourceLabel: "Google 搜索",
    keywords,
    num,
    maxPages
  });
  const pages = result.pages;
  const items = pages.flatMap(payload => {
    const pageItems = getNestedValue(payload, responseMap.items);
    return Array.isArray(pageItems) ? pageItems : [];
  });
  if (!items.length) return [];
  return filterPapersByKeywords(
    items.map(item => normalizeGoogleSearchPaper(item, keywords, responseMap)),
    keywords
  );
}

async function fetchSemanticScholarPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const params = new URLSearchParams({
    query: buildSemanticScholarQuery(keywords),
    limit: String(options.limit || 80),
    fields: "paperId,title,abstract,year,publicationDate,venue,journal,externalIds,url,authors,fieldsOfStudy,openAccessPdf"
  });
  const data = await fetchJson(`${SEMANTIC_SCHOLAR_ENDPOINT}?${params.toString()}`);
  const items = Array.isArray(data.data) ? data.data : [];
  const papers = filterPapersByKeywords(items.map(item => normalizeSemanticScholarPaper(item, keywords)), keywords);
  if (!options.startDate && !options.endDate) return papers;
  return papers.filter(paper => {
    const date = dateString(paper.published);
    if (!date) return false;
    return (!options.startDate || date >= options.startDate) && (!options.endDate || date <= options.endDate);
  });
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

function filterPapersByDateRange(papers, startDate, endDate) {
  return papers.filter(paper => {
    const date = dateString(paper.published);
    // Google web results often omit dates; keep them so Crossref/LLM can still surface Nature/Optica pages.
    if (!date && paper.sourceType === "网页搜索") return true;
    if (!date && dateRangeOverlapsYear(yearOnlyString(paper.published), startDate, endDate)) return true;
    if (!date) return false;
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });
}

function filterPapersByStrictDateRange(papers, startDate, endDate) {
  return papers.filter(paper => {
    const date = dateString(paper.published);
    if (!date) return false;
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });
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

function buildKnownPaperIndex(papers = []) {
  const index = new Map();
  papers.map(completePaperRecord).forEach(paper => {
    paperFlexibleLookupKeys(paper).forEach(key => {
      if (!index.has(key)) index.set(key, paper);
    });
  });
  return index;
}

function enrichCandidateSnapshotPaper(candidate, knownPaperIndex) {
  const known = paperFlexibleLookupKeys(candidate)
    .map(key => knownPaperIndex.get(key))
    .find(Boolean);
  if (!known) return normalizeCandidateSnapshotDate(candidate);
  return {
    ...candidate,
    doi: known.doi || candidate.doi,
    journal: known.journal || candidate.journal,
    published: known.published || candidate.published,
    authors: Array.isArray(known.authors) && known.authors.length ? known.authors : candidate.authors
  };
}

function normalizeCandidateSnapshotDate(candidate) {
  const published = compactText(candidate?.published);
  if (!/^(19|20)\d{2}-01-01$/.test(published)) return candidate;
  const sourceText = [candidate?.source, candidate?.sourceType].map(compactText).join(" ").toLowerCase();
  const canBeYearOnlySource = sourceText.includes("google scholar")
    || sourceText.includes("google 搜索")
    || sourceText.includes("semantic scholar")
    || sourceText.includes("论文搜索")
    || sourceText.includes("论文数据库");
  if (!canBeYearOnlySource || normalizeDoi(candidate?.doi)) return candidate;
  return { ...candidate, published: published.slice(0, 4) };
}

function enrichFetchLogCandidateSnapshots(entry, knownPaperIndex) {
  const snapshots = entry?.candidateSnapshots;
  if (!snapshots || typeof snapshots !== "object") return entry;
  const nextSnapshots = {};
  Object.entries(snapshots).forEach(([key, snapshot]) => {
    const papers = Array.isArray(snapshot?.papers) ? snapshot.papers : [];
    nextSnapshots[key] = {
      ...snapshot,
      papers: papers.map(paper => enrichCandidateSnapshotPaper(paper, knownPaperIndex))
    };
  });
  return { ...entry, candidateSnapshots: nextSnapshots };
}

async function enrichFetchLogEntries(entries, dataDir = DATA_DIR) {
  try {
    const archive = await readPaperArchive(dataDir);
    const knownPaperIndex = buildKnownPaperIndex(archive.papers);
    return entries.map(entry => enrichFetchLogCandidateSnapshots(entry, knownPaperIndex));
  } catch {
    return entries;
  }
}

// 抓取日志：把每次真实抓取的报告追加到 data/papers/fetch-log.json，仅保留最近 FETCH_LOG_LIMIT 条。
async function readFetchLog(dataDir = DATA_DIR) {
  const data = await readJsonFile(path.join(dataDir, FETCH_LOG_NAME), { entries: [] });
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return enrichFetchLogEntries(entries, dataDir);
}

async function appendFetchLog(entry, dataDir = DATA_DIR) {
  const entries = await readFetchLog(dataDir);
  entries.unshift(entry);
  const trimmed = entries.slice(0, FETCH_LOG_LIMIT);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, FETCH_LOG_NAME), `${JSON.stringify({ entries: trimmed }, null, 2)}\n`, "utf8");
  return trimmed;
}

function fetchLogRetryPapers(entry = {}) {
  const byKey = new Map();
  const addPaper = paper => {
    const record = completePaperRecord(paper);
    const key = paperArchiveKey(record);
    if (key) byKey.set(key, record);
  };
  (Array.isArray(entry.papers) ? entry.papers : []).forEach(addPaper);
  Object.values(entry.candidateSnapshots || {}).forEach(snapshot => {
    (Array.isArray(snapshot?.papers) ? snapshot.papers : []).forEach(addPaper);
  });
  (Array.isArray(entry.errors) ? entry.errors : []).forEach(error => {
    if (error?.paper) addPaper(error.paper);
  });
  return Array.from(byKey.values());
}

async function retryFailedFetchLogEnrichment(index, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const entries = await readFetchLog(dataDir);
  const entry = entries[Number(index)];
  if (!entry) throw new Error("抓取日志不存在或已过期");
  const retryableErrors = (Array.isArray(entry.errors) ? entry.errors : [])
    .filter(error => ["crossref", "llm", "abstract"].includes(error.source));
  if (!retryableErrors.length) {
    return {
      ok: true,
      retried: false,
      message: "这条日志没有可重试的 Crossref/LLM 失败",
      entry
    };
  }
  const retryPapers = fetchLogRetryPapers(entry);
  if (!retryPapers.length) {
    return {
      ok: true,
      retried: false,
      message: "这条日志没有保存可重试的论文明细",
      entry
    };
  }

  const errors = [];
  const llmLog = [];
  const crossrefPapers = await enrichPapersWithCrossref(retryPapers, {
    ...(options.crossref || {}),
    fetcher: options.fetchers?.crossref,
    errors
  });
  const llmPapers = await enrichPapersWithLlmInsights(crossrefPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    errors,
    llmLog
  });
  const journalPapers = await enrichPapersWithJournalMetrics(llmPapers, {
    dataDir,
    ...(options.journalMetrics || {})
  });
  const keywords = entry.keywords || options.keywords || [];
  const rescoredPapers = journalPapers.map(paper => rescorePaperAfterEnrichment({
    ...paper,
    fetchedAt: new Date().toISOString()
  }, keywords));
  const archive = await mergePapersIntoArchive(rescoredPapers, {
    dataDir,
    date: todayString(),
    mode: "retry",
    operation: "retry-failed-enrichment",
    keywords,
    sources: ["fetch-log-retry"]
  });
  await appendOperationLogSafe({
    action: "modify",
    operation: "retry-failed-enrichment",
    beforeCount: archive.count,
    afterCount: archive.count,
    modifiedCount: rescoredPapers.length,
    paperCount: rescoredPapers.length,
    papers: rescoredPapers.slice(0, 20).map(summarizePaperForOperationLog)
  }, dataDir);
  return {
    ok: true,
    retried: true,
    index: Number(index),
    attemptedCount: retryPapers.length,
    updatedCount: rescoredPapers.length,
    remainingErrors: errors,
    llm: {
      calls: llmLog.length,
      totalTokens: llmLog.reduce((sum, item) => sum + Number(item.total || 0), 0),
      models: Array.from(new Set(llmLog.map(item => item.model).filter(Boolean)))
    },
    archive,
    papers: rescoredPapers
  };
}

function summarizePaperForOperationLog(paper = {}) {
  return {
    id: compactText(paper.id),
    title: compactText(paper.title),
    doi: normalizeDoi(paper.doi),
    published: compactText(paper.published || paper.date),
    source: compactText(paper.source),
    journal: compactText(paper.journal)
  };
}

async function appendOperationLog(entry, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, OPERATION_LOG_NAME);
  const payload = {
    at: new Date().toISOString(),
    action: entry.action || "modify",
    operation: entry.operation || entry.action || "modify",
    ...entry
  };
  await fs.appendFile(file, `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

async function appendOperationLogSafe(entry, dataDir = DATA_DIR) {
  try {
    return await appendOperationLog(entry, dataDir);
  } catch {
    return null;
  }
}

async function readOperationLog(dataDir = DATA_DIR) {
  const file = path.join(dataDir, OPERATION_LOG_NAME);
  try {
    const text = await fs.readFile(file, "utf8");
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

function paperArchiveKey(paper) {
  const doi = normalizeDoi(paper?.doi);
  if (doi) return `doi:${doi}`;
  return compactText(paper?.id || paper?.url || paper?.title).toLowerCase();
}

function candidatePaperToArchiveRecord(candidate = {}) {
  const title = compactText(candidate.title);
  const journal = compactText(candidate.journal);
  const source = compactText(candidate.source || (journal ? `候选论文 · ${journal}` : "候选论文"));
  const published = dateString(candidate.published) || compactText(candidate.published);
  const doi = normalizeDoi(candidate.doi);
  return completePaperRecord({
    id: compactText(candidate.id) || `candidate-${crypto.createHash("sha1").update(`${doi}|${candidate.url || ""}|${title}`).digest("hex").slice(0, 16)}`,
    doi,
    title,
    summary: compactText(candidate.summary),
    abstractZh: compactText(candidate.abstractZh),
    llmSummary: compactText(candidate.llmSummary),
    reason: compactText(candidate.reason),
    journal,
    source,
    sourceType: compactText(candidate.sourceType) || "候选论文",
    published,
    url: compactText(candidate.url),
    pdfUrl: compactText(candidate.pdfUrl),
    score: Number(candidate.score || 0),
    tags: Array.isArray(candidate.tags) ? candidate.tags.map(compactText).filter(Boolean) : (journal ? [journal] : []),
    authors: Array.isArray(candidate.authors) ? candidate.authors.map(compactText).filter(Boolean) : [],
    tokenUsage: candidate.tokenUsage || defaultTokenUsage(),
    journalMetrics: candidate.journalMetrics || defaultJournalMetrics(),
    addedFrom: "fetch-log-candidate",
    fetchedAt: new Date().toISOString()
  });
}

function paperFlexibleLookupKeys(paper) {
  return [
    normalizeDoi(paper?.doi),
    compactText(paper?.url),
    compactText(paper?.pdfUrl),
    compactText(paper?.id),
    compactText(paper?.title)
  ]
    .map(value => String(value || "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
}

function favoriteRecordFromPaper(paper = {}) {
  const keys = paperFlexibleLookupKeys(paper);
  const primaryKey = keys[0] || "";
  return {
    key: primaryKey,
    keys,
    paper: summarizePaperForOperationLog(paper),
    addedAt: new Date().toISOString()
  };
}

function cleanFavoriteRecord(record = {}) {
  const keys = Array.isArray(record.keys) ? record.keys : [record.key];
  const cleanKeys = Array.from(new Set(keys
    .map(value => String(value || "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)));
  return {
    key: cleanKeys[0] || "",
    keys: cleanKeys,
    paper: record.paper && typeof record.paper === "object" ? record.paper : {},
    addedAt: compactText(record.addedAt) || new Date().toISOString()
  };
}

async function readFavoritesFile(dataDir = DATA_DIR) {
  const payload = await readJsonFile(path.join(dataDir, FAVORITES_NAME), { favorites: [] });
  const favorites = Array.isArray(payload.favorites)
    ? payload.favorites.map(cleanFavoriteRecord).filter(record => record.keys.length)
    : [];
  return {
    ...payload,
    favorites
  };
}

async function writeFavoritesFile(payload, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, FAVORITES_NAME);
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

function favoriteMatchesPaper(favorite, paper) {
  const favoriteKeys = new Set(favorite.keys || []);
  return paperFlexibleLookupKeys(paper).some(key => favoriteKeys.has(key));
}

function favoriteMatchesTarget(favorite, target) {
  const targetKeys = new Set(paperFlexibleLookupKeys(target));
  return (favorite.keys || []).some(key => targetKeys.has(key));
}

async function readFavoritesPayload(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const payload = await readFavoritesFile(dataDir);
  const archive = await readPaperArchive(dataDir);
  const papers = payload.favorites
    .map(favorite => archive.papers.find(paper => favoriteMatchesPaper(favorite, paper)))
    .filter(Boolean)
    .map(completePaperRecord);
  return {
    ok: true,
    count: papers.length,
    favorites: payload.favorites,
    papers: sortPapersForDisplay(papers),
    favoritesFile: path.join(dataDir, FAVORITES_NAME)
  };
}

async function updateFavoritePaper(input = {}, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const paper = input.paper || input;
  const favorite = input.favorite !== false;
  const record = favoriteRecordFromPaper(paper);
  if (!record.keys.length) throw new Error("收藏论文缺少可识别的 DOI、URL、ID 或标题");
  const payload = await readFavoritesFile(dataDir);
  const beforeCount = payload.favorites.length;
  const nextFavorites = favorite
    ? [...payload.favorites.filter(item => !favoriteMatchesTarget(item, paper)), record]
    : payload.favorites.filter(item => !favoriteMatchesTarget(item, paper));
  const nextPayload = {
    ...payload,
    mode: "favorites",
    updatedAt: new Date().toISOString(),
    count: nextFavorites.length,
    favorites: nextFavorites
  };
  nextPayload.favoritesFile = await writeFavoritesFile(nextPayload, dataDir);
  if (beforeCount !== nextFavorites.length || favorite) {
    await appendOperationLogSafe({
      action: favorite ? "add" : "delete",
      operation: favorite ? "favorite-add" : "favorite-delete",
      beforeCount,
      afterCount: nextFavorites.length,
      paper: summarizePaperForOperationLog(paper)
    }, dataDir);
  }
  const result = await readFavoritesPayload({ dataDir });
  return {
    ...result,
    favorite,
    updated: beforeCount !== nextFavorites.length || favorite
  };
}

function cleanPaperNotePatch(note = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(note, "shortTitle")) {
    patch.shortTitle = compactText(note.shortTitle);
  }
  if (Object.prototype.hasOwnProperty.call(note, "read")) {
    patch.read = note.read === true;
  }
  if (Object.prototype.hasOwnProperty.call(note, "starred")) {
    patch.starred = note.starred === true;
  }
  return patch;
}

function paperNoteRecordFromPaper(paper = {}, note = {}, previous = {}) {
  const keys = Array.from(new Set([
    ...paperFlexibleLookupKeys(paper),
    ...(Array.isArray(previous.keys) ? previous.keys : [])
  ].filter(Boolean)));
  return {
    key: keys[0] || "",
    keys,
    paper: summarizePaperForOperationLog(paper),
    shortTitle: compactText(note.shortTitle),
    read: note.read === true,
    starred: note.starred === true,
    updatedAt: new Date().toISOString()
  };
}

function cleanPaperNoteRecord(record = {}) {
  const keys = Array.isArray(record.keys) ? record.keys : [record.key];
  const cleanKeys = Array.from(new Set(keys
    .map(value => String(value || "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)));
  return {
    key: cleanKeys[0] || "",
    keys: cleanKeys,
    paper: record.paper && typeof record.paper === "object" ? record.paper : {},
    shortTitle: compactText(record.shortTitle),
    read: record.read === true,
    starred: record.starred === true,
    updatedAt: compactText(record.updatedAt) || new Date().toISOString()
  };
}

async function readPaperNotesFile(dataDir = DATA_DIR) {
  const payload = await readJsonFile(path.join(dataDir, PAPER_NOTES_NAME), { notes: [] });
  const notes = Array.isArray(payload.notes)
    ? payload.notes.map(cleanPaperNoteRecord).filter(record => record.keys.length)
    : [];
  return {
    ...payload,
    notes
  };
}

async function writePaperNotesFile(payload, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, PAPER_NOTES_NAME);
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

function paperNoteMatchesPaper(note, paper) {
  const noteKeys = new Set(note.keys || []);
  return paperFlexibleLookupKeys(paper).some(key => noteKeys.has(key));
}

function paperNoteMatchesTarget(note, target) {
  const targetKeys = new Set(paperFlexibleLookupKeys(target));
  return (note.keys || []).some(key => targetKeys.has(key));
}

async function readPaperNotesPayload(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const payload = await readPaperNotesFile(dataDir);
  const archive = await readPaperArchive(dataDir);
  const papers = payload.notes
    .map(note => archive.papers.find(paper => paperNoteMatchesPaper(note, paper)))
    .filter(Boolean)
    .map(completePaperRecord);
  return {
    ok: true,
    count: payload.notes.length,
    notes: payload.notes,
    papers: sortPapersForDisplay(papers),
    paperNotesFile: path.join(dataDir, PAPER_NOTES_NAME)
  };
}

async function updatePaperNote(input = {}, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const paper = input.paper || input;
  const patch = cleanPaperNotePatch(input.note || {});
  const keys = paperFlexibleLookupKeys(paper);
  if (!keys.length) throw new Error("论文标注缺少可识别的 DOI、URL、ID 或标题");
  const payload = await readPaperNotesFile(dataDir);
  const previous = payload.notes.find(item => paperNoteMatchesTarget(item, paper));
  const mergedNote = {
    shortTitle: previous?.shortTitle || "",
    read: previous?.read === true,
    starred: previous?.starred === true,
    ...patch
  };
  const record = paperNoteRecordFromPaper(paper, mergedNote, previous);
  const nextNotes = [
    ...payload.notes.filter(item => !paperNoteMatchesTarget(item, paper)),
    record
  ];
  const nextPayload = {
    ...payload,
    mode: "paper-notes",
    updatedAt: new Date().toISOString(),
    count: nextNotes.length,
    notes: nextNotes
  };
  nextPayload.paperNotesFile = await writePaperNotesFile(nextPayload, dataDir);
  await appendOperationLogSafe({
    action: "modify",
    operation: "paper-note-update",
    beforeCount: payload.notes.length,
    afterCount: nextNotes.length,
    paper: summarizePaperForOperationLog(paper)
  }, dataDir);
  const result = await readPaperNotesPayload({ dataDir });
  return {
    ...result,
    updated: true
  };
}

function sortPapersForDisplay(papers) {
  return [...papers].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff) return scoreDiff;
    return String(b.published || "").localeCompare(String(a.published || ""));
  });
}

function mergePaperLists(existingPapers, nextPapers) {
  const byKey = new Map();
  existingPapers.map(completePaperRecord).forEach(paper => {
    const key = paperArchiveKey(paper);
    if (!key) return;
    byKey.set(key, paper);
  });
  nextPapers.map(completePaperRecord).forEach(paper => {
    const key = paperArchiveKey(paper);
    if (!key) return;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, paper);
      return;
    }
    const hasNewLlmInsight = paper.tokenUsage?.status === "已调用 AI";
    byKey.set(key, {
      ...previous,
      ...(hasNewLlmInsight ? {
        summary: paper.summary || previous.summary,
        abstractZh: paper.abstractZh || previous.abstractZh,
        llmSummary: paper.llmSummary || previous.llmSummary,
        reason: paper.reason || previous.reason,
        shortTitle: paper.shortTitle || previous.shortTitle
      } : {}),
      tokenUsage: {
        ...(previous.tokenUsage || {}),
        ...(paper.tokenUsage || {})
      },
      journalMetrics: hasResolvedJournalMetrics(paper.journalMetrics)
        ? { ...(previous.journalMetrics || {}), ...(paper.journalMetrics || {}) }
        : (previous.journalMetrics || paper.journalMetrics || defaultJournalMetrics())
    });
  });
  return sortPapersForDisplay(Array.from(byKey.values()));
}

function mergePaperListsAppendOnly(existingPapers, nextPapers) {
  const papers = existingPapers.map(completePaperRecord);
  const byExactId = new Map();
  papers.forEach((paper, index) => {
    const key = compactText(paper.id);
    if (key) byExactId.set(key, index);
  });

  nextPapers.map(completePaperRecord).forEach(paper => {
    const exactId = compactText(paper.id);
    const previousIndex = exactId ? byExactId.get(exactId) : undefined;
    if (previousIndex === undefined) {
      if (exactId) byExactId.set(exactId, papers.length);
      papers.push(paper);
      return;
    }

    const previous = papers[previousIndex];
    const hasNewLlmInsight = paper.tokenUsage?.status === "已调用 AI";
    papers[previousIndex] = {
      ...previous,
      ...(hasNewLlmInsight ? {
        summary: paper.summary || previous.summary,
        abstractZh: paper.abstractZh || previous.abstractZh,
        llmSummary: paper.llmSummary || previous.llmSummary,
        reason: paper.reason || previous.reason,
        shortTitle: paper.shortTitle || previous.shortTitle
      } : {}),
      fetchedAt: paper.fetchedAt || previous.fetchedAt,
      score: paper.score || previous.score,
      scoreBreakdown: paper.scoreBreakdown || previous.scoreBreakdown,
      tokenUsage: {
        ...(previous.tokenUsage || {}),
        ...(paper.tokenUsage || {})
      },
      journalMetrics: hasResolvedJournalMetrics(paper.journalMetrics)
        ? { ...(previous.journalMetrics || {}), ...(paper.journalMetrics || {}) }
        : (previous.journalMetrics || paper.journalMetrics || defaultJournalMetrics())
    };
  });

  return sortPapersForDisplay(papers);
}

function paperNeedsLlmInsight(paper) {
  const needsFirstLlmCall = paper?.tokenUsage?.status !== "已调用 AI";
  const needsShortTitle = !compactText(paper?.shortTitle);
  const needsAbstractTranslation = (
    !compactText(paper?.abstractZh)
    && !looksLikeGeneratedChineseSummary(paper?.summary)
  ) || paperHasTruncatedAbstractText(paper);
  return needsFirstLlmCall || needsShortTitle || needsAbstractTranslation;
}

async function enrichMissingLlmInsights(papers, options = {}) {
  const recoveredPapers = await recoverGeneratedSummaryPapers(papers, options);
  const pendingPapers = recoveredPapers.filter(paperNeedsLlmInsight);
  if (!pendingPapers.length) return recoveredPapers;
  const enrichedPapers = await enrichPapersWithLlmInsights(pendingPapers, options);
  const enrichedByKey = new Map();
  enrichedPapers.forEach(paper => {
    const key = paperArchiveKey(paper);
    if (key) enrichedByKey.set(key, paper);
  });
  return recoveredPapers.map(paper => enrichedByKey.get(paperArchiveKey(paper)) || paper);
}

async function buildPaperArchiveFromCaches(dataDir = DATA_DIR) {
  const papers = [];
  try {
    const files = await fs.readdir(dataDir);
    await Promise.all(files.map(async fileName => {
      if (fileName === PAPER_ARCHIVE_NAME || !dateKeyFromCacheFile(fileName)) return;
      const payload = JSON.parse(await fs.readFile(path.join(dataDir, fileName), "utf8"));
      if (Array.isArray(payload.papers)) papers.push(...payload.papers);
    }));
  } catch {
    // No cache directory yet; the archive will start empty.
  }
  return {
    mode: "archive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers: mergePaperListsAppendOnly([], papers)
  };
}

async function readPaperArchive(dataDir = DATA_DIR) {
  const file = path.join(dataDir, PAPER_ARCHIVE_NAME);
  try {
    const payload = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      ...payload,
      papers: Array.isArray(payload.papers) ? payload.papers : []
    };
  } catch {
    return buildPaperArchiveFromCaches(dataDir);
  }
}

async function writePaperArchive(payload, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, PAPER_ARCHIVE_NAME);
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

async function mergePapersIntoArchive(papers, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const beforeById = new Set(archive.papers.map(paper => compactText(paper.id)).filter(Boolean));
  const mergedPapers = options.dedupe === true
    ? mergePaperLists(archive.papers, papers)
    : mergePaperListsAppendOnly(archive.papers, papers);
  const addedPapers = papers.filter(paper => {
    const id = compactText(paper.id);
    return !id || !beforeById.has(id);
  });
  const modifiedCount = Math.max(0, papers.length - addedPapers.length);
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    lastFetch: {
      date: options.date || "",
      mode: options.mode || "",
      keywords: options.keywords || [],
      sources: options.sources || [],
      fetchedCount: papers.length
    },
    count: mergedPapers.length,
    papers: mergedPapers
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  if (papers.length && options.log !== false) {
    await appendOperationLogSafe({
      action: addedPapers.length ? "add" : "modify",
      operation: options.operation || "archive-merge",
      source: options.mode || "archive",
      beforeCount: archive.papers.length,
      afterCount: mergedPapers.length,
      addedCount: addedPapers.length,
      modifiedCount,
      paperCount: papers.length,
      papers: papers.slice(0, 20).map(summarizePaperForOperationLog)
    }, dataDir);
  }
  return nextArchive;
}

async function readArchivePayload(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  return {
    ...archive,
    count: archive.papers.length,
    papers: sortPapersForDisplay(archive.papers),
    archiveFile: path.join(dataDir, PAPER_ARCHIVE_NAME)
  };
}

async function dedupePaperArchive(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const beforeCount = archive.papers.length;
  const papers = mergePaperLists([], archive.papers);
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    lastMaintenance: {
      action: "dedupe",
      beforeCount,
      afterCount: papers.length
    },
    count: papers.length,
    papers
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  await appendOperationLogSafe({
    action: "modify",
    operation: "archive-dedupe",
    beforeCount,
    afterCount: papers.length,
    removedCount: beforeCount - papers.length
  }, dataDir);
  return {
    ok: true,
    beforeCount,
    afterCount: papers.length,
    removedCount: beforeCount - papers.length,
    archive: nextArchive,
    papers
  };
}

async function addCandidatePaperToArchive(candidate, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  let paper = candidatePaperToArchiveRecord(candidate);
  const candidateKeys = new Set(paperFlexibleLookupKeys(paper));
  const archive = await readPaperArchive(dataDir);
  const exists = archive.papers.some(item => paperFlexibleLookupKeys(item).some(key => candidateKeys.has(key)));
  if (exists) {
    return {
      ok: true,
      added: false,
      existed: true,
      paper,
      archive
    };
  }
  const errors = [];
  const llmLog = [];
  const [crossrefPaper] = await enrichPapersWithCrossref([paper], {
    ...(options.crossref || {}),
    fetcher: options.fetchers?.crossref,
    errors
  });
  const [paperWithAbstract] = await recoverGeneratedSummaryPapers([crossrefPaper], {
    ...(options.llm || {}),
    fetcher: options.fetchers?.llm,
    abstractFetcher: options.fetchers?.abstract,
    abstractFetchImpl: options.fetchers?.abstractFetch,
    fetchImpl: options.fetchImpl,
    errors
  });
  const [llmPaper] = await enrichPapersWithLlmInsights([paperWithAbstract], {
    ...(options.llm || {}),
    fetcher: options.fetchers?.llm,
    errors,
    llmLog
  });
  const [enrichedPaper] = await enrichPapersWithJournalMetrics([llmPaper], {
    dataDir,
    ...(options.journalMetrics || {})
  });
  paper = {
    ...rescorePaperAfterEnrichment(enrichedPaper, options.keywords || []),
    fetchedAt: new Date().toISOString()
  };
  const nextArchive = await mergePapersIntoArchive([paper], {
    dataDir,
    date: options.date || dateString(paper.published) || todayString(),
    mode: "candidate",
    operation: "candidate-add",
    keywords: options.keywords || [],
    sources: [paper.source || paper.sourceType || "候选论文"]
  });
  return {
    ok: true,
    added: true,
    existed: false,
    paper,
    archive: nextArchive,
    errors,
    llm: {
      calls: llmLog.length,
      totalTokens: llmLog.reduce((sum, entry) => sum + Number(entry.total || 0), 0),
      models: Array.from(new Set(llmLog.map(entry => entry.model).filter(Boolean)))
    }
  };
}

async function removeCandidatePaperFromArchive(candidate, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const paper = candidatePaperToArchiveRecord(candidate);
  const candidateKeys = new Set(paperFlexibleLookupKeys(paper));
  const archive = await readPaperArchive(dataDir);
  if (!candidateKeys.size) {
    return {
      ok: true,
      removed: false,
      existed: false,
      paper,
      archive
    };
  }
  const papers = archive.papers.filter(item =>
    !paperFlexibleLookupKeys(item).some(key => candidateKeys.has(key))
  );
  const removed = papers.length !== archive.papers.length;
  if (!removed) {
    return {
      ok: true,
      removed: false,
      existed: false,
      paper,
      archive
    };
  }
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  await appendOperationLogSafe({
    action: "delete",
    operation: "candidate-delete",
    beforeCount: archive.papers.length,
    afterCount: papers.length,
    removedCount: archive.papers.length - papers.length,
    paper: summarizePaperForOperationLog(paper)
  }, dataDir);
  return {
    ok: true,
    removed: true,
    existed: true,
    paper,
    archive: nextArchive
  };
}

function paperHasLlmInsight(paper) {
  return Boolean(compactText(paper?.abstractZh))
    && Boolean(compactText(paper?.reason))
    && Boolean(compactText(paper?.shortTitle))
    && paper?.tokenUsage?.status === "已调用 AI"
    && !paperHasTruncatedAbstractText(paper);
}

function archivePaperMatchesTarget(paper, target = {}) {
  const targetKeys = new Set(paperFlexibleLookupKeys(target));
  if (!targetKeys.size && target.id) targetKeys.add(compactText(target.id).toLowerCase());
  if (!targetKeys.size) return false;
  return paperFlexibleLookupKeys(paper).some(key => targetKeys.has(key));
}

async function enrichArchivePapersWithLlm(papers, options = {}) {
  const errors = [];
  const llmLog = [];
  const recoveredPapers = await recoverGeneratedSummaryPapers(papers, {
    ...options,
    errors
  });
  const enriched = await enrichPapersWithLlmInsights(recoveredPapers, {
    ...(options.llm || {}),
    fetcher: options.fetcher || options.fetchers?.llm,
    fetchImpl: options.fetchImpl,
    config: options.config,
    configFile: options.configFile,
    userBackground: options.userBackground,
    errors,
    llmLog
  });
  return { enriched, errors, llmLog };
}

async function refreshArchivePaperLlmInsight(target = {}, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const index = archive.papers.findIndex(paper => archivePaperMatchesTarget(paper, target));
  if (index < 0) {
    return { ok: true, updated: false, existed: false, paper: null, archive };
  }
  const original = completePaperRecord(archive.papers[index]);
  const llmOptions = {
    ...options,
    fetcher: options.fetcher || target.fetcher,
    fetchers: options.fetchers || target.fetchers
  };
  const { enriched, errors, llmLog } = await enrichArchivePapersWithLlm([original], llmOptions);
  const nextPaper = {
    ...rescorePaperAfterEnrichment(enriched[0] || original, options.keywords || []),
    fetchedAt: original.fetchedAt || new Date().toISOString(),
    llmUpdatedAt: new Date().toISOString()
  };
  const papers = archive.papers.slice();
  papers[index] = nextPaper;
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  await appendOperationLogSafe({
    action: "modify",
    operation: "archive-llm-refresh-one",
    updatedCount: 1,
    paper: summarizePaperForOperationLog(nextPaper)
  }, dataDir);
  return {
    ok: true,
    updated: true,
    existed: true,
    paper: nextPaper,
    archive: nextArchive,
    errors,
    llm: {
      calls: llmLog.length,
      totalTokens: llmLog.reduce((sum, entry) => sum + Number(entry.total || 0), 0),
      models: Array.from(new Set(llmLog.map(entry => entry.model).filter(Boolean)))
    }
  };
}

async function refreshArchiveLlmInsights(options = {}, runtimeOptions = {}) {
  const dataDir = runtimeOptions.dataDir || options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const pending = archive.papers
    .map((paper, index) => ({ paper: completePaperRecord(paper), index }))
    .filter(entry => !paperHasLlmInsight(entry.paper));
  if (!pending.length) {
    return {
      ok: true,
      updatedCount: 0,
      skippedCount: archive.papers.length,
      archive,
      papers: archive.papers,
      errors: [],
      llm: { calls: 0, totalTokens: 0, models: [] }
    };
  }
  const { enriched, errors, llmLog } = await enrichArchivePapersWithLlm(pending.map(entry => entry.paper), options);
  const papers = archive.papers.slice();
  pending.forEach((entry, offset) => {
    papers[entry.index] = {
      ...rescorePaperAfterEnrichment(enriched[offset] || entry.paper, options.keywords || []),
      fetchedAt: entry.paper.fetchedAt || new Date().toISOString(),
      llmUpdatedAt: new Date().toISOString()
    };
  });
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  await appendOperationLogSafe({
    action: "modify",
    operation: "archive-llm-refresh-missing",
    updatedCount: pending.length,
    skippedCount: archive.papers.length - pending.length,
    paperCount: papers.length,
    papers: pending.slice(0, 20).map(entry => summarizePaperForOperationLog(papers[entry.index]))
  }, dataDir);
  return {
    ok: true,
    updatedCount: pending.length,
    skippedCount: archive.papers.length - pending.length,
    archive: nextArchive,
    papers,
    errors,
    llm: {
      calls: llmLog.length,
      totalTokens: llmLog.reduce((sum, entry) => sum + Number(entry.total || 0), 0),
      models: Array.from(new Set(llmLog.map(entry => entry.model).filter(Boolean)))
    }
  };
}

function collectArchiveJournalNames(papers) {
  const byKey = new Map();
  papers.forEach(paper => {
    const journalName = paperJournalName(paper);
    if (!journalName) return;
    const key = journalMetricsCacheKey(journalName);
    if (!byKey.has(key)) byKey.set(key, journalName);
  });
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

async function refreshJournalMetricsForArchive(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const config = options.config || await readJournalMetricsConfig(options.configFile);
  const archive = await readPaperArchive(dataDir);
  const journals = collectArchiveJournalNames(archive.papers);
  const cache = await readJournalMetricsCache(dataDir);
  seedJournalMetricsCacheFromPapers(cache, archive.papers);
  const refreshed = [];
  const errors = [];
  let matchedCount = 0;

  if (config.enabled && config.endpoint && config.apiKey) {
    for (const journalName of journals) {
      try {
        const metrics = await fetchJournalMetrics(journalName, { ...options, config });
        if (hasResolvedJournalMetrics(metrics)) {
          setCachedJournalMetrics(cache, journalName, metrics);
          matchedCount += 1;
          refreshed.push({ journal: journalName, status: "matched" });
        } else {
          refreshed.push({ journal: journalName, status: "unresolved" });
        }
      } catch (error) {
        errors.push({ journal: journalName, message: error.message });
        refreshed.push({ journal: journalName, status: "failed", message: error.message });
      }
    }
  }

  const cacheFile = await writeJournalMetricsCache(cache, dataDir);
  let updatedCount = 0;
  const papers = archive.papers.map(paper => {
    const journalName = paperJournalName(paper);
    const metrics = journalName ? getCachedJournalMetrics(cache, journalName) : null;
    if (!metrics) return paper;
    if (JSON.stringify(paper.journalMetrics || {}) !== JSON.stringify(metrics)) updatedCount += 1;
    return { ...paper, journalMetrics: metrics };
  });
  const nextArchive = {
    ...archive,
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers: sortPapersForDisplay(papers)
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  if (updatedCount) {
    await appendOperationLogSafe({
      action: "modify",
      operation: "journal-refresh",
      beforeCount: archive.papers.length,
      afterCount: nextArchive.papers.length,
      modifiedCount: updatedCount,
      journalCount: journals.length,
      matchedCount
    }, dataDir);
  }

  return {
    ok: true,
    mode: "journal-refresh",
    fetchedAt: new Date().toISOString(),
    journalCount: journals.length,
    matchedCount,
    updatedCount,
    skippedCount: journals.length - matchedCount,
    errors,
    refreshed,
    cacheFile,
    archiveFile: nextArchive.archiveFile,
    count: nextArchive.papers.length,
    papers: nextArchive.papers
  };
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

function paperTokenStatsKey(paper, fallback = "") {
  const archiveKey = paperArchiveKey(paper);
  return archiveKey || `fallback:${fallback}`;
}

function paperTokenStatsDate(paper) {
  return dateString(paper?.fetchedAt || paper?.updatedAt || paper?.addedAt || paper?.date || paper?.published);
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
  const countedKeys = new Set();

  const recordPaperUsage = (paper, date, fallbackKey) => {
    if (!date || date < start30 || date > today) return;
    const usage = paper.tokenUsage || {};
    const prompt = Number(usage.prompt || 0);
    const completion = Number(usage.completion || 0);
    const total = Number(usage.total || prompt + completion);
    if (total <= 0) return;
    const key = `${date}|${paperTokenStatsKey(paper, fallbackKey)}`;
    if (countedKeys.has(key)) return;
    countedKeys.add(key);
    const dayBucket = dailyMap.get(date) || { date, ...emptyTokenBucket() };
    addTokenUsage(dayBucket, usage);
    addTokenUsage(last30DaysBucket, usage);
    if (date >= start7) addTokenUsage(last7DaysBucket, usage);
    if (date === today) addTokenUsage(todayBucket, usage);
    const model = usage.model || usage.modelName || "未记录模型";
    const modelBucket = modelMap.get(model) || { model, ...emptyTokenBucket() };
    addTokenUsage(modelBucket, usage);
    modelMap.set(model, modelBucket);
    dailyMap.set(date, dayBucket);
  };

  try {
    const files = await fs.readdir(dataDir);
    await Promise.all(files.map(async fileName => {
      const date = dateKeyFromCacheFile(fileName);
      if (!date || date < start30 || date > today) return;
      const payload = JSON.parse(await fs.readFile(path.join(dataDir, fileName), "utf8"));
      const papers = Array.isArray(payload.papers) ? payload.papers : [];
      papers.forEach((paper, index) => recordPaperUsage(paper, date, `${fileName}:${index}`));
    }));

    try {
      const archivePayload = JSON.parse(await fs.readFile(path.join(dataDir, PAPER_ARCHIVE_NAME), "utf8"));
      const archivePapers = Array.isArray(archivePayload.papers) ? archivePayload.papers : [];
      archivePapers.forEach((paper, index) => {
        recordPaperUsage(paper, paperTokenStatsDate(paper), `${PAPER_ARCHIVE_NAME}:${index}`);
      });
    } catch {
      // Archive is optional for fresh installs.
    }
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

// 汇总本次抓取的报告：调用了哪些 API、消耗了哪些大模型、抓到了哪几篇论文。
function buildFetchReport({ mode, startDate, endDate, keywords, apiCalls = [], errors = [], llmLog = [], fetchedPapers = [] }) {
  const apis = apiCalls.slice();

  // 富集类 API（基于本次实际结果推断是否调用）。
  const crossrefMatched = fetchedPapers.filter(p => p?.doi).length;
  if (fetchedPapers.length) {
    apis.push({
      api: "crossref",
      label: API_LABELS.crossref,
      kind: "enrich",
      status: errors.some(e => e.source === "crossref") ? "failed" : "ok",
      returned: crossrefMatched
    });
  }
  const easyscholarHits = fetchedPapers.filter(p => p?.journalMetrics && p.journalMetrics.source === "easyscholar").length;
  if (easyscholarHits) {
    apis.push({ api: "easyscholar", label: API_LABELS.easyscholar, kind: "enrich", status: "ok", returned: easyscholarHits });
  }

  // 大模型用量按模型汇总。
  const byModel = new Map();
  let totalTokens = 0;
  llmLog.forEach(entry => {
    const key = entry.model || "未记录模型";
    const acc = byModel.get(key) || { model: key, calls: 0, prompt: 0, completion: 0, total: 0 };
    acc.calls += 1;
    acc.prompt += Number(entry.prompt || 0);
    acc.completion += Number(entry.completion || 0);
    acc.total += Number(entry.total || 0);
    byModel.set(key, acc);
    totalTokens += Number(entry.total || 0);
  });
  const llmModels = Array.from(byModel.values());
  if (llmModels.length || errors.some(e => e.source === "llm")) {
    apis.push({
      api: "llm",
      label: API_LABELS.llm,
      kind: "llm",
      status: errors.some(e => e.source === "llm") ? (llmModels.length ? "部分失败" : "failed") : "ok",
      returned: llmLog.length,
      models: llmModels.map(m => m.model)
    });
  }

  return {
    range: { mode, startDate, endDate },
    keywords,
    apis,
    llm: { models: llmModels, calls: llmLog.length, totalTokens },
    papers: fetchedPapers.map(p => ({
      id: p.id,
      title: p.title,
      source: p.source || p.journal || "",
      score: p.score,
      published: p.published,
      url: p.url || "",
      aiStatus: p.tokenUsage?.status || "",
      model: p.tokenUsage?.model || ""
    })),
    fetchedCount: fetchedPapers.length,
    errors
  };
}

function paperCandidateJournal(paper) {
  const values = [
    paper?.journal,
    paper?.venue,
    ...(Array.isArray(paper?.tags) ? paper.tags : [])
  ];
  const fromSource = String(paper?.source || "").split("·").map(part => part.trim()).filter(Boolean).at(-1);
  if (fromSource) values.push(fromSource);
  return compactText(values.find(value => compactText(value)) || "");
}

function paperCandidateSnapshot(paper) {
  return {
    title: compactText(paper?.title || "未记录标题"),
    summary: compactText(paper?.summary),
    abstractZh: compactText(paper?.abstractZh),
    reason: compactText(paper?.reason),
    journal: paperCandidateJournal(paper),
    source: compactText(paper?.source || paper?.sourceType || ""),
    published: dateString(paper?.published) || compactText(paper?.published || ""),
    url: compactText(paper?.url || paper?.pdfUrl || ""),
    pdfUrl: compactText(paper?.pdfUrl),
    doi: normalizeDoi(paper?.doi),
    authors: Array.isArray(paper?.authors) ? paper.authors.map(compactText).filter(Boolean) : [],
    score: paper?.score ?? ""
  };
}

function buildPaperCandidateSnapshot(papers, limit = 200) {
  const items = Array.isArray(papers) ? papers : [];
  return {
    total: items.length,
    shown: Math.min(items.length, limit),
    papers: items.slice(0, limit).map(paperCandidateSnapshot)
  };
}

function emitFetchProgress(options, progress) {
  if (typeof options.onProgress !== "function") return;
  options.onProgress({
    at: new Date().toISOString(),
    ...progress
  });
}

function recordSourcePageProgress(sourcePages, api, event = {}) {
  const page = event.sourcePage || {};
  const start = serpApiStartValue(page.start, 0);
  const num = serpApiStartValue(page.num, 0);
  const skipped = page.skipped === true;
  const current = sourcePages[api] || {
    sourceLabel: page.sourceLabel || API_LABELS[api] || api,
    firstPage: page.page,
    lastPage: page.page,
    firstStart: start,
    lastStart: start,
    num,
    nextStart: start + num,
    pages: 0,
    skippedPages: [],
    firstItem: page.itemStart,
    lastItem: page.itemEnd
  };
  current.sourceLabel = page.sourceLabel || current.sourceLabel;
  current.firstPage = Math.min(Number(current.firstPage ?? page.page ?? 1), Number(page.page || 1));
  current.lastPage = Math.max(Number(current.lastPage ?? page.page ?? 1), Number(page.page || 1));
  current.firstStart = Math.min(Number(current.firstStart ?? start), start);
  current.lastStart = Math.max(Number(current.lastStart ?? start), start);
  current.num = num || current.num;
  current.nextStart = start + (num || current.num || 0);
  if (skipped) {
    if (Number(current.lastStart) === start && Number(current.pages) > 0) {
      current.pages -= 1;
    }
    current.skippedPages = Array.isArray(current.skippedPages) ? current.skippedPages : [];
    current.skippedPages.push({
      start,
      num: num || current.num || 0,
      itemStart: page.itemStart,
      itemEnd: page.itemEnd,
      message: compactText(page.message)
    });
  } else {
    current.pages += 1;
  }
  current.firstItem = Math.min(Number(current.firstItem ?? page.itemStart ?? 1), Number(page.itemStart || 1));
  current.lastItem = Math.max(Number(current.lastItem ?? page.itemEnd ?? 1), Number(page.itemEnd || 1));
  if (Array.isArray(current.skippedPages) && !current.skippedPages.length) delete current.skippedPages;
  sourcePages[api] = current;
}

async function fetchPaperPayload(options = {}) {
  const date = options.date || todayString();
  const mode = options.mode || "today";
  const endDate = options.endDate || date;
  // “最近”模式默认抓取 2026-05-01 至今；“近 7 天”模式抓取今天往前 6 天。
  const startDate = options.startDate || (mode === "recent" ? RECENT_RANGE_START : (mode === "last7" ? shiftDate(date, -6) : date));
  const keywords = cleanKeywords(options.keywords).length ? cleanKeywords(options.keywords) : DEFAULT_KEYWORDS;
  const requestedSources = parseEnabledSources(options.sources || []);
  const sources = requestedSources.length ? requestedSources : ["arxiv", "biorxiv", "semanticscholar"];
  const dataDir = options.dataDir || DATA_DIR;
  if (!options.refresh) {
    try {
      const cachedPayload = await readCachedPapers(mode === "today" ? date : `${date}-${mode}`, dataDir);
      const cachedPapers = Array.isArray(cachedPayload.papers) ? cachedPayload.papers : [];
      const archive = await mergePapersIntoArchive(cachedPapers, {
        dataDir,
        date,
        mode,
        keywords: cachedPayload.keywords || [],
        sources: cachedPayload.sources || []
      });
      const archivedPapers = mode === "today"
        ? filterPapersByDate(archive.papers, date)
        : filterPapersByStrictDateRange(archive.papers, startDate, endDate);
      const papers = await enrichMissingLlmInsights(archivedPapers, {
        ...(options.llm || {}),
        fetcher: options.fetchers?.llm,
        abstractFetcher: options.fetchers?.abstract,
        abstractFetchImpl: options.fetchers?.abstractFetch,
        errors: []
      });
      const nextArchive = await mergePapersIntoArchive(papers, { dataDir, date, mode, keywords: cachedPayload.keywords || [], sources: cachedPayload.sources || [] });
      return {
        ...cachedPayload,
        papers,
        count: papers.length,
        archivedCount: nextArchive.count,
        archiveFile: nextArchive.archiveFile,
        fetchReport: {
          cached: true,
          range: { mode, startDate: cachedPayload.startDate || date, endDate: cachedPayload.endDate || date },
          keywords: cachedPayload.keywords || [],
          apis: [],
          llm: { models: [], calls: 0, totalTokens: 0 },
          papers: [],
          fetchedCount: 0,
          errors: []
        }
      };
    } catch {
      // Cache miss is expected on the first run.
    }
  }

  const errors = [];
  const apiCalls = [];
  const llmLog = [];
  const sourcePages = {};
  const progressForSource = source => event => {
    if (event?.stage === "source-page") recordSourcePageProgress(sourcePages, source, event);
    emitFetchProgress(options, event);
  };
  emitFetchProgress(options, {
    stage: "sources",
    percent: 8,
    message: "正在请求数据源",
    counts: { raw: 0, deduped: 0, keywordMatched: 0, domainMatched: 0, dateMatched: 0, ranked: 0, fetched: 0 },
    sources: []
  });
  const groups = await Promise.all(sources.map(async source => {
    try {
      let result;
      if (source === "arxiv") result = options.fetchers?.arxiv ? await options.fetchers.arxiv() : await fetchArxivPapers(keywords, { maxResults: mode === "recent" ? 200 : 50 });
      else if (source === "biorxiv") result = options.fetchers?.biorxiv ? await options.fetchers.biorxiv() : await fetchBioRxivPapers(date, keywords, mode === "today" ? {} : { startDate, endDate });
      else if (source === "semanticscholar") result = options.fetchers?.semanticscholar ? await options.fetchers.semanticscholar() : await fetchSemanticScholarPapers(keywords, mode === "today" ? {} : { startDate, endDate, limit: 100 });
      else if (source === "googlescholar") result = options.fetchers?.googlescholar ? await options.fetchers.googlescholar() : await fetchGoogleScholarPapers(keywords, { ...(options.googleScholar || {}), onProgress: progressForSource(source) });
      else if (source === "googlesearch") result = options.fetchers?.googlesearch ? await options.fetchers.googlesearch() : await fetchGoogleSearchPapers(keywords, { ...(options.googleScholar || {}), onProgress: progressForSource(source) });
      else result = [];
      apiCalls.push({ api: source, label: API_LABELS[source] || source, kind: "source", status: "ok", returned: result.length });
      emitFetchProgress(options, {
        stage: "sources",
        percent: 18,
        message: `${API_LABELS[source] || source} 返回 ${result.length} 篇`,
        counts: { raw: apiCalls.reduce((sum, call) => sum + Number(call.returned || 0), 0) },
        sources: apiCalls.filter(call => call.kind === "source")
      });
      return result;
    } catch (error) {
      errors.push({ source, message: error.message });
      apiCalls.push({ api: source, label: API_LABELS[source] || source, kind: "source", status: "failed", returned: 0, message: error.message });
      emitFetchProgress(options, {
        stage: "sources",
        percent: 18,
        message: `${API_LABELS[source] || source} 抓取失败`,
        counts: { raw: apiCalls.reduce((sum, call) => sum + Number(call.returned || 0), 0) },
        sources: apiCalls.filter(call => call.kind === "source"),
        errors
      });
      return [];
    }
  }));
  const rawPapers = groups.flat();
  emitFetchProgress(options, {
    stage: "dedupe",
    percent: 28,
    message: `原始返回 ${rawPapers.length} 篇，正在去重`,
    counts: { raw: rawPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const dedupedPapers = dedupePapers(rawPapers);
  emitFetchProgress(options, {
    stage: "keyword",
    percent: 40,
    message: `去重后 ${dedupedPapers.length} 篇，正在匹配关键词`,
    counts: { raw: rawPapers.length, deduped: dedupedPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const keywordPapers = filterPapersByKeywords(dedupedPapers, keywords);
  emitFetchProgress(options, {
    stage: "domain",
    percent: 52,
    message: `关键词命中 ${keywordPapers.length} 篇，正在领域过滤`,
    counts: { raw: rawPapers.length, deduped: dedupedPapers.length, keywordMatched: keywordPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const refinedPapers = filterPapersByDomainAnchors(keywordPapers, keywords);
  emitFetchProgress(options, {
    stage: "date",
    percent: 64,
    message: `领域过滤后 ${refinedPapers.length} 篇，正在筛选日期`,
    counts: { raw: rawPapers.length, deduped: dedupedPapers.length, keywordMatched: keywordPapers.length, domainMatched: refinedPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const scopedPapers = mode === "today" ? filterPapersByDate(refinedPapers, date) : filterPapersByDateRange(refinedPapers, startDate, endDate);
  const rankedPapers = scopedPapers
    .sort((a, b) => b.score - a.score || String(b.published).localeCompare(String(a.published)))
    .slice(0, 80);
  const pipelineCounts = {
    raw: rawPapers.length,
    deduped: dedupedPapers.length,
    keywordMatched: keywordPapers.length,
    domainMatched: refinedPapers.length,
    dateMatched: scopedPapers.length,
    ranked: rankedPapers.length
  };
  const candidateSnapshots = {
    beforeDomain: buildPaperCandidateSnapshot(keywordPapers),
    afterDomain: buildPaperCandidateSnapshot(refinedPapers),
    dateMatched: buildPaperCandidateSnapshot(scopedPapers)
  };
  emitFetchProgress(options, {
    stage: "enrich",
    percent: 74,
    message: `日期范围内 ${scopedPapers.length} 篇，候选 ${rankedPapers.length} 篇，正在补全元数据`,
    counts: pipelineCounts,
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const titlePapers = await enrichTruncatedGoogleTitles(rankedPapers, {
    fetchImpl: options.fetchers?.html
  });
  const crossrefPapers = await enrichPapersWithCrossref(titlePapers, {
    ...(options.crossref || {}),
    fetcher: options.fetchers?.crossref,
    errors
  });
  emitFetchProgress(options, {
    stage: "llm",
    percent: 84,
    message: `元数据补全后 ${crossrefPapers.length} 篇，正在生成摘要翻译和推荐理由`,
    counts: pipelineCounts,
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const llmPapers = await enrichPapersWithLlmInsights(crossrefPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    errors,
    llmLog
  });
  emitFetchProgress(options, {
    stage: "archive",
    percent: 92,
    message: `AI 处理完成，正在写入本地库`,
    counts: pipelineCounts,
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const datedLlmPapers = mode === "today" ? filterPapersByDate(llmPapers, date) : filterPapersByStrictDateRange(llmPapers, startDate, endDate);
  const fetchedPapers = sortPapersForDisplay((await enrichPapersWithJournalMetrics(datedLlmPapers, {
    dataDir,
    ...(options.journalMetrics || {})
  }))
    .map(paper => rescorePaperAfterEnrichment({ ...paper, fetchedAt: new Date().toISOString() }, keywords)));
  const archive = await mergePapersIntoArchive(fetchedPapers, { dataDir, date, mode, keywords, sources });
  const archivedPapers = mode === "today"
    ? filterPapersByDate(archive.papers, date)
    : filterPapersByStrictDateRange(archive.papers, startDate, endDate);
  const enrichedArchivePapers = (await enrichMissingLlmInsights(archivedPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    abstractFetcher: options.fetchers?.abstract,
    abstractFetchImpl: options.fetchers?.abstractFetch,
    errors,
    llmLog
  })).map(paper => rescorePaperAfterEnrichment(paper, keywords));
  const archiveWithInsights = await mergePapersIntoArchive(enrichedArchivePapers, { dataDir, date, mode, keywords, sources });
  const papers = sortPapersForDisplay((await enrichMissingLlmInsights(fetchedPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    abstractFetcher: options.fetchers?.abstract,
    abstractFetchImpl: options.fetchers?.abstractFetch,
    errors,
    llmLog
  })).map(paper => rescorePaperAfterEnrichment(paper, keywords)));
  const finalArchive = await mergePapersIntoArchive(papers, { dataDir, date, mode, keywords, sources });
  const fetchReport = buildFetchReport({
    mode,
    startDate: mode === "today" ? date : startDate,
    endDate,
    keywords,
    apiCalls,
    errors,
    llmLog,
    fetchedPapers
  });
  const payload = {
    date,
    startDate: mode === "today" ? date : startDate,
    endDate,
    mode,
    fetchedAt: new Date().toISOString(),
    keywords,
    sources,
    errors,
    fetchedCount: fetchedPapers.length,
    archivedCount: finalArchive.count,
    archiveFile: finalArchive.archiveFile,
    count: papers.length,
    fetchReport,
    papers
  };
  emitFetchProgress(options, {
    stage: "done",
    percent: 100,
    message: `完成：最终入库/展示 ${papers.length} 篇`,
    counts: { ...pipelineCounts, fetched: papers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  payload.cacheFile = await writeCachedPapers(mode === "today" ? date : `${date}-${mode}`, payload, dataDir);
  // 每次刷新都写抓取日志。即使最终 0 篇，也要保留逐源返回数、失败原因和筛选漏斗，便于排查。
  try {
    await appendFetchLog({
      at: payload.fetchedAt,
      mode,
      range: fetchReport.range,
      keywords,
      fetchedCount: payload.count,
      newFetchedCount: fetchReport.fetchedCount,
      pipelineCounts,
      // 仅保留数据源类 API 的逐源抓取数量（arXiv / bioRxiv / Google 等抓到多少篇）。
      sources: fetchReport.apis
        .filter(a => a.kind === "source")
        .map(a => ({ api: a.api, label: a.label, status: a.status, count: a.returned, message: a.message || "" })),
      sourcePages,
      llm: fetchReport.llm,
      candidateSnapshots,
      errors,
      papers: papers.map(p => ({ title: p.title, source: p.source, score: p.score, url: p.url || "" }))
    }, dataDir);
  } catch {
    // 日志写入失败不应影响抓取主流程。
  }
  return payload;
}

async function fetchTodayPapers(options = {}) {
  return fetchPaperPayload({ ...options, mode: "today" });
}

async function fetchRecentPapers(options = {}) {
  return fetchPaperPayload({ ...options, refresh: options.refresh !== false, mode: "recent" });
}

async function fetchLast7DaysPapers(options = {}) {
  return fetchPaperPayload({ ...options, refresh: options.refresh !== false, mode: "last7" });
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
  addCandidatePaperToArchive,
  removeCandidatePaperFromArchive,
  dedupePaperArchive,
  buildTokenStats,
  buildArxivQuery,
  classifyPaper,
  cleanKeywords,
  enrichPapersWithCrossref,
  enrichPapersWithJournalMetrics,
  enrichPapersWithLlmInsights,
  enrichTruncatedGoogleTitles,
  fetchArxivPapers,
  fetchCrossrefWorkByTitle,
  fetchBioRxivPapers,
  fetchGoogleScholarPapers,
  fetchGoogleSearchPapers,
  fetchJournalMetrics,
  fetchLast7DaysPapers,
  fetchRecentPapers,
  fetchSemanticScholarPapers,
  fetchTodayPapers,
  inferPaperShortTitle,
  testLlmConfig,
  filterPapersByDate,
  filterPapersByDateRange,
  filterPapersByKeywords,
  normalizeArxivEntry,
  normalizeBioRxivItem,
  normalizeSemanticScholarPaper,
  parseArxivEntries,
  parseEnabledSources,
  readFetchLog,
  readFavoritesPayload,
  readGoogleRollingCursorStatus,
  readPaperNotesPayload,
  readOperationLog,
  readArchivePayload,
  appendFetchLog,
  appendOperationLog,
  readIntegrationConfigs,
  readIntegrationSecrets,
  readJournalMetricsConfig,
  readJournalMetricsCache,
  readLlmConfig,
  readUserState,
  refinePaperPool,
  rescorePaperAfterEnrichment,
  refreshJournalMetricsForArchive,
  refreshArchiveLlmInsights,
  refreshArchivePaperLlmInsight,
  retryFailedFetchLogEnrichment,
  resetGoogleRollingCursors,
  scorePaper,
  todayString,
  updateFavoritePaper,
  updatePaperNote,
  writeIntegrationConfigs,
  writeUserConfig
};






