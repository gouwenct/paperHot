const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const DATA_DIR = path.join(__dirname, "data", "papers");
const PAPER_ARCHIVE_NAME = "archive.json";
const FAVORITES_NAME = "favorites.json";
const PAPER_NOTES_NAME = "paper-notes.json";
const FETCH_LOG_NAME = "fetch-log.json";
const OPERATION_LOG_NAME = "operation-log.jsonl";
const JOURNAL_METRICS_CACHE_NAME = "journal-metrics-cache.json";
const GOOGLE_ROLLING_CURSOR_NAME = "google-rolling-cursors.json";
const RECENT_FETCH_CURSORS_NAME = "recent-fetch-cursors.json";
const WEB_OF_SCIENCE_USAGE_NAME = "web-of-science-usage.json";
const LLM_MODEL_POOL_STATE_NAME = "llm-model-pool-state.json";
const LOCAL_DATA_FORMAT = "paperhot-local-data";
const LOCAL_DATA_VERSION = 1;
const FETCH_LOG_LIMIT = 30;
const USER_DATA_DIR = path.join(__dirname, "data", "user");
const USER_CONFIG_FILE = path.join(USER_DATA_DIR, "config.json");
const USER_PROFILE_FILE = path.join(USER_DATA_DIR, "profile.json");
const JOURNAL_METRICS_CONFIG_FILE = path.join(__dirname, "config", "journal-metrics.json");
const GOOGLE_SCHOLAR_CONFIG_FILE = path.join(__dirname, "config", "google-scholar.json");
const WEB_OF_SCIENCE_CONFIG_FILE = path.join(__dirname, "config", "web-of-science.json");
const FIRECRAWL_CONFIG_FILE = path.join(__dirname, "config", "firecrawl.json");
const ACADEMIC_APIS_CONFIG_FILE = path.join(__dirname, "config", "academic-apis.json");
const OPENALEX_CONFIG_FILE = path.join(__dirname, "config", "openalex.json");
const LLM_CONFIG_FILE = path.join(__dirname, "config", "llm.json");
// “最近”抓取模式的默认起始日期（含当日）。从该日期一直抓取到今天。
const RECENT_RANGE_START = "2026-05-01";
// 数据源 / 外部 API 的中文展示名，用于本次抓取报告。
const API_LABELS = {
  arxiv: "arXiv",
  biorxiv: "bioRxiv",
  semanticscholar: "Semantic Scholar",
  openalex: "OpenAlex",
  googlescholar: "Google Scholar (SerpApi)",
  googlesearch: "Google 搜索 (SerpApi)",
  webofscience: "Web of Science",
  crossref: "Crossref 元数据",
  publisher: "出版社日期",
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
const SEMANTIC_SCHOLAR_PAPER_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper";
const SEMANTIC_SCHOLAR_BATCH_ENDPOINT = `${SEMANTIC_SCHOLAR_PAPER_ENDPOINT}/batch`;
const CROSSREF_WORKS_ENDPOINT = "https://api.crossref.org/works";
const DEFAULT_ACADEMIC_APIS_CONFIG = { contactEmail: "" };
const DEFAULT_OPENALEX_CONFIG = {
  provider: "openalex",
  enabled: false,
  endpoint: "https://api.openalex.org/works",
  apiKey: "",
  maxPages: 3,
  perPage: 100
};
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
const DEFAULT_USER_BACKGROUND = "请在页面中填写你的研究背景、关注方向和评分偏好。";
const LLM_MODEL_POOL_STATE_FORMAT = "paperhot-llm-model-pool-state";
const DEFAULT_ALIYUN_MODEL_POOL_MODELS = [
  "qwen-plus",
  "qwen-flash",
  "qwen-turbo",
  "qwen-long",
  "qwen3.5-flash",
  "qwen3.7-plus",
  "qwen3-coder-plus"
];
const ALIYUN_TEXT_MODEL_REGISTRY = [
  ["qwen-plus", "Qwen Plus", "Qwen"],
  ["qwen-flash", "Qwen Flash", "Qwen"],
  ["qwen-turbo", "Qwen Turbo", "Qwen"],
  ["qwen-long", "Qwen Long", "Qwen"],
  ["qwen-max", "Qwen Max", "Qwen"],
  ["qwen-max-latest", "Qwen Max Latest", "Qwen"],
  ["qwen-plus-latest", "Qwen Plus Latest", "Qwen"],
  ["qwen-turbo-latest", "Qwen Turbo Latest", "Qwen"],
  ["qwen3-coder-plus", "Qwen3 Coder Plus", "Qwen Coder"],
  ["qwen3-coder-flash", "Qwen3 Coder Flash", "Qwen Coder"],
  ["qwen3-coder-plus-latest", "Qwen3 Coder Plus Latest", "Qwen Coder"],
  ["qwen3.5-flash", "Qwen3.5 Flash", "Qwen"],
  ["qwen3.7-plus", "Qwen3.7 Plus", "Qwen"],
  ["qwen3-235b-a22b", "Qwen3 235B A22B", "Qwen"],
  ["qwen3-32b", "Qwen3 32B", "Qwen"],
  ["qwen3-30b-a3b", "Qwen3 30B A3B", "Qwen"],
  ["qwen3-14b", "Qwen3 14B", "Qwen"],
  ["qwen3-8b", "Qwen3 8B", "Qwen"],
  ["qwen3-4b", "Qwen3 4B", "Qwen"],
  ["qwen3-1.7b", "Qwen3 1.7B", "Qwen"],
  ["qwen2.5-72b-instruct", "Qwen2.5 72B Instruct", "Qwen"],
  ["qwen2.5-32b-instruct", "Qwen2.5 32B Instruct", "Qwen"],
  ["qwen2.5-14b-instruct", "Qwen2.5 14B Instruct", "Qwen"],
  ["qwen2.5-7b-instruct", "Qwen2.5 7B Instruct", "Qwen"],
  ["qwen2.5-coder-32b-instruct", "Qwen2.5 Coder 32B Instruct", "Qwen Coder"],
  ["qwen2.5-coder-14b-instruct", "Qwen2.5 Coder 14B Instruct", "Qwen Coder"],
  ["qwen2.5-coder-7b-instruct", "Qwen2.5 Coder 7B Instruct", "Qwen Coder"],
  ["deepseek-v3", "DeepSeek V3", "DeepSeek"],
  ["deepseek-r1", "DeepSeek R1", "DeepSeek"],
  ["deepseek-r1-distill-qwen-32b", "DeepSeek R1 Distill Qwen 32B", "DeepSeek"],
  ["deepseek-r1-distill-qwen-14b", "DeepSeek R1 Distill Qwen 14B", "DeepSeek"]
].map(([model, displayName, family], index) => ({
  model,
  displayName,
  family,
  enabled: DEFAULT_ALIYUN_MODEL_POOL_MODELS.includes(model),
  freeQuotaTokens: 1000000,
  priority: (index + 1) * 10,
  source: "aliyun-modelstudio-text-generation",
  notes: "Text chat model for PaperHot summary and recommendation prompts."
}));
const DEFAULT_ALIYUN_MODEL_POOL = {
  quotaMode: "official-first",
  quotaFallback: "local",
  quotaSwitchRatio: 0.85,
  failureSwitchThreshold: 3,
  models: ALIYUN_TEXT_MODEL_REGISTRY.map(item => ({
    model: item.model,
    displayName: item.displayName,
    family: item.family,
    enabled: DEFAULT_ALIYUN_MODEL_POOL_MODELS.includes(item.model),
    freeQuotaTokens: item.freeQuotaTokens,
    priority: item.priority,
    source: item.source,
    notes: item.notes
  }))
};
const DEFAULT_LLM_CONFIG = {
  provider: "aliyun-modelstudio",
  enabled: false,
  activeProviderId: "aliyun-modelstudio",
  host: "dashscope.aliyuncs.com",
  endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  dashscopeEndpoint: "https://dashscope.aliyuncs.com/api/v1",
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
    { id: "aliyun-coding", name: "阿里百炼 Coding Plan", desc: "dashscope.aliyuncs.com", provider: "aliyun-modelstudio", enabled: false, apiMode: "openai", host: "dashscope.aliyuncs.com", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1", dashscopeEndpoint: "https://dashscope.aliyuncs.com/api/v1", apiKey: "", model: "qwen-plus", modelPresets: ["qwen-plus", "qwen-max", "qwen3-coder-plus", "qwen3-coder-next"], contextWindow: 131000, reasoning: "auto" },
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
  researchArea: "填写你的研究方向",
  locale: "zh-CN",
  background: DEFAULT_USER_BACKGROUND
};
const DEFAULT_FIRECRAWL_CONFIG = {
  provider: "firecrawl",
  enabled: false,
  endpoint: "https://api.firecrawl.dev/v2/scrape",
  apiKey: ""
};
const DEFAULT_WEB_OF_SCIENCE_CONFIG = {
  provider: "web-of-science",
  enabled: false,
  endpoint: "https://api.clarivate.com/apis/wos-starter/v1/documents",
  apiKey: "",
  databaseId: "WOS",
  maxPages: 2,
  pageSize: 25,
  queryTemplate: "TS=({query})",
  request: {
    method: "GET",
    queryName: "q",
    databaseQueryName: "db",
    pageQueryName: "page",
    limitQueryName: "limit",
    apiKeyHeader: "X-ApiKey",
    apiKeyPrefix: "",
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
    authors: "names.authors",
    citationCount: "citations"
  }
};
const DEFAULT_USER_CONFIG = {
  keywords: {
    primary: [],
    secondary: [],
    inspiration: []
  },
  searchLogic: {
    activeKeywords: [],
    andEdges: []
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
      title: "Web of Science",
      desc: "通过 Clarivate Web of Science API 纳入订阅数据库检索结果；建议每次仅抓取少量页面。",
      tags: ["论文数据库", "需配置 API", "有限分页"],
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
    },
    {
      title: "OpenAlex",
      desc: "通过 OpenAlex Works API 检索论文并补充开放元数据；需要免费的 API Key。",
      tags: ["论文数据库", "需配置 API", "开放元数据"],
      enabled: false
    }
  ]
};
const GOOGLE_SCHOLAR_MAX_PAGES_LIMIT = 10;
const GOOGLE_SCHOLAR_NUM_LIMIT = 20;
const WEB_OF_SCIENCE_MAX_PAGES_LIMIT = 5;
const WEB_OF_SCIENCE_PAGE_SIZE_LIMIT = 50;
const OPENALEX_MAX_PAGES_LIMIT = 10;
const OPENALEX_PER_PAGE_LIMIT = 100;
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

function publicationDateRange(value) {
  const clean = compactText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return { start: clean, end: clean };
  if (/^\d{4}-\d{2}$/.test(clean)) {
    const [year, month] = clean.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: `${clean}-01`, end: `${clean}-${String(lastDay).padStart(2, "0")}` };
  }
  if (/^\d{4}$/.test(clean)) return { start: `${clean}-01-01`, end: `${clean}-12-31` };
  const date = dateString(clean);
  if (date) return { start: date, end: date };
  return null;
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

function cleanAbstractText(value) {
  return compactText(stripTags(String(value || "")
    .replace(/([\p{L}\p{N}])-\s*\r?\n\s*([\p{L}\p{N}])/gu, "$1$2")))
    .replace(/\b(?:abstract|background|objective|purpose|methods?|results?|conclusions?)\s*[:：]\s*/gi, "")
    .normalize("NFKC")
    .trim();
}

function abstractMatchText(value) {
  return cleanAbstractText(value)
    .toLowerCase()
    .replace(/[\p{P}\p{Z}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompleteAbstract(value) {
  const text = cleanAbstractText(value);
  return Boolean(text)
    && !looksLikeTruncatedText(text)
    && !looksLikeGeneratedChineseSummary(text)
    && !isRobotChallengeText(text);
}

function abstractSourceLabel(value) {
  const label = compactText(value).toLowerCase();
  const key = label.replace(/[^a-z]/g, "");
  if (label.includes("semantic scholar") || key.startsWith("semanticscholar")) return "semantic-scholar";
  if (label.includes("openalex") || key.startsWith("openalex")) return "openalex";
  if (label.includes("web of science") || key.startsWith("webofscience") || key === "wos") return "wos";
  if (key.startsWith("crossref")) return "crossref";
  if (key.startsWith("arxiv")) return "arxiv";
  if (key.startsWith("biorxiv")) return "biorxiv";
  return label;
}

function abstractCandidateMatchesPaper(candidate, paper) {
  const candidateDoi = normalizeDoi(candidate?.doi);
  const paperDoi = normalizeDoi(paper?.doi);
  if (candidateDoi && paperDoi) return candidateDoi === paperDoi;
  const candidateTitle = normalizedTitleKey(candidate?.title);
  const paperTitle = normalizedTitleKey(paper?.title);
  if (!candidateTitle || candidateTitle !== paperTitle) return false;
  const candidateAuthors = Array.isArray(candidate?.authors) ? candidate.authors : [];
  const paperAuthors = Array.isArray(paper?.authors) ? paper.authors : [];
  return !candidateAuthors.length || !paperAuthors.length || hasMeaningfulAuthorOverlap(candidateAuthors, paperAuthors);
}

function normalizeAbstractCandidate(source, value, paper) {
  if (!value) return null;
  const isExactText = typeof value === "string";
  const record = isExactText ? { abstract: value } : value;
  const cleanAbstract = cleanAbstractText(record.cleanAbstract || record.rawAbstract || record.abstract || record.summary);
  const candidate = {
    source: abstractSourceLabel(source),
    doi: normalizeDoi(record.doi || (isExactText ? paper?.doi : "")),
    title: compactText(record.title || (isExactText ? paper?.title : "")),
    authors: Array.isArray(record.authors) ? record.authors.map(compactText).filter(Boolean) : (paper?.authors || []),
    rawAbstract: compactText(record.rawAbstract || record.abstract || record.summary),
    cleanAbstract,
    matchText: abstractMatchText(cleanAbstract),
    isComplete: isCompleteAbstract(cleanAbstract),
    error: ""
  };
  return candidate.isComplete && abstractCandidateMatchesPaper(candidate, paper) ? candidate : null;
}

function selectMatchingAbstractCandidate(candidates) {
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (!left?.isComplete && !isCompleteAbstract(left?.cleanAbstract)) continue;
    const leftText = left.matchText || abstractMatchText(left.cleanAbstract);
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (abstractSourceLabel(left.source) === abstractSourceLabel(right?.source)) continue;
      if (!right?.isComplete && !isCompleteAbstract(right?.cleanAbstract)) continue;
      const rightText = right.matchText || abstractMatchText(right.cleanAbstract);
      if (!leftText || leftText !== rightText) continue;
      const preferred = cleanAbstractText(left.cleanAbstract).length >= cleanAbstractText(right.cleanAbstract).length ? left : right;
      return {
        abstract: cleanAbstractText(preferred.cleanAbstract),
        sources: [abstractSourceLabel(left.source), abstractSourceLabel(right.source)]
      };
    }
  }
  return null;
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

async function fetchSemanticScholarAbstractByDoi(paper, options = {}) {
  const doi = normalizeDoi(paper?.doi);
  if (!doi) return null;
  const fetchImpl = options.abstractFetchImpl || options.fetchImpl || fetch;
  const fields = "paperId,title,abstract,externalIds,authors";
  const response = await fetchImpl(`${SEMANTIC_SCHOLAR_PAPER_ENDPOINT}/DOI:${encodeURIComponent(doi)}?fields=${fields}`, {
    headers: { "User-Agent": "paperHOT/0.1 (local research prototype)", Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) return null;
  const item = await response.json();
  return {
    doi: normalizeDoi(item?.externalIds?.DOI || doi),
    title: item?.title,
    authors: Array.isArray(item?.authors) ? item.authors.map(author => author?.name).filter(Boolean) : [],
    abstract: item?.abstract
  };
}

async function fetchSemanticScholarAbstractBatch(papers, options = {}) {
  const dois = [...new Set(papers.map(preferredPaperDoi).filter(Boolean))];
  if (!dois.length) return new Map();
  const fetchImpl = options.abstractFetchImpl || options.fetchImpl || fetch;
  const request = () => fetchImpl(`${SEMANTIC_SCHOLAR_BATCH_ENDPOINT}?fields=paperId,title,abstract,externalIds,authors`, {
    method: "POST",
    headers: { "User-Agent": "paperHOT/0.1 (local research prototype)", Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ ids: dois.map(doi => `DOI:${doi}`) }),
    signal: AbortSignal.timeout(20000)
  });
  let response = await request();
  for (let attempt = 0; response.status === 429 && attempt < 2; attempt += 1) {
    const retryAfterSeconds = Number(response.headers?.get?.("retry-after") || 0);
    await sleep(retryAfterSeconds > 0 ? Math.min(retryAfterSeconds * 1000, 30000) : 1500);
    response = await request();
  }
  if (!response.ok) throw new Error(`Semantic Scholar 摘要批量补全失败：HTTP ${response.status}`);
  const items = await response.json();
  const byDoi = new Map();
  dois.forEach((doi, index) => {
    const item = Array.isArray(items) ? items[index] : null;
    if (!item) return;
    byDoi.set(doi, {
      doi: normalizeDoi(item?.externalIds?.DOI || doi),
      title: item?.title,
      authors: Array.isArray(item?.authors) ? item.authors.map(author => author?.name).filter(Boolean) : [],
      abstract: item?.abstract
    });
  });
  return byDoi;
}

function restoreOpenAlexAbstract(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  Object.entries(index).forEach(([word, positions]) => {
    if (!Array.isArray(positions)) return;
    positions.forEach(position => {
      if (Number.isInteger(position) && position >= 0) words[position] = word;
    });
  });
  return compactText(words.filter(Boolean).join(" "));
}

async function openAlexRequestOptions(options = {}) {
  const config = options.config || await readOpenAlexConfig(options.configFile || options.openAlexConfigFile);
  const academicApis = options.academicApis || await readAcademicApisConfig(options.academicApisConfigFile);
  return {
    config,
    fetchImpl: options.fetchImpl || options.abstractFetchImpl || fetch,
    headers: {
      Accept: "application/json",
      "User-Agent": academicApis.contactEmail
        ? `paperHOT/0.1 (mailto:${academicApis.contactEmail})`
        : "paperHOT/0.1 (local research prototype)"
    }
  };
}

function openAlexWorkUrl(endpoint, doi) {
  return `${String(endpoint || DEFAULT_OPENALEX_CONFIG.endpoint).replace(/\/$/, "")}/doi:${normalizeDoi(doi)}`;
}

async function fetchOpenAlexWorkByDoi(paper, options = {}) {
  const doi = normalizeDoi(paper?.doi);
  if (!doi) return null;
  const { config, fetchImpl, headers } = await openAlexRequestOptions(options);
  if (!config.enabled || !config.apiKey) return null;
  const url = new URL(openAlexWorkUrl(config.endpoint, doi));
  url.searchParams.set("api_key", config.apiKey);
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OpenAlex 字段补全失败：HTTP ${response.status}`);
  return response.json();
}

async function fetchOpenAlexAbstractByDoi(paper, options = {}) {
  const item = await fetchOpenAlexWorkByDoi(paper, options);
  if (!item) return null;
  return {
    doi: normalizeDoi(item.doi || item.ids?.doi || paper.doi),
    title: item.title || item.display_name,
    authors: Array.isArray(item.authorships)
      ? item.authorships.map(entry => compactText(entry?.author?.display_name)).filter(Boolean)
      : [],
    abstract: restoreOpenAlexAbstract(item.abstract_inverted_index)
  };
}

async function fetchCrossrefAbstractByDoi(paper, options = {}) {
  const metadata = await fetchCrossrefWorkByDoi(paper?.doi, {
    fetchImpl: options.abstractFetchImpl || options.fetchImpl || fetch,
    academicApis: options.academicApis,
    academicApisConfigFile: options.academicApisConfigFile
  });
  return metadata?.abstract ? { ...metadata, abstract: metadata.abstract } : null;
}

async function fetchWebOfScienceAbstractByDoi(paper, options = {}) {
  const doi = normalizeDoi(paper?.doi);
  if (!doi) return null;
  const config = options.webOfScience?.config || await readWebOfScienceConfig(options.webOfScience?.configFile);
  if (!config.enabled || !config.endpoint || !config.apiKey) return null;
  const papers = await fetchWebOfSciencePapers([], {
    ...(options.webOfScience || {}),
    config,
    dataDir: options.dataDir,
    rawQuery: `DO=(${doi})`,
    searchMode: "exact",
    maxPages: 1,
    startPage: 1,
    fetchImpl: options.webOfScience?.fetchImpl || options.abstractFetchImpl
  });
  return papers.find(candidate => normalizeDoi(candidate.doi) === doi) || null;
}

function markdownAbstract(markdown) {
  const match = String(markdown || "").match(/(?:^|\n)#{1,6}\s*abstract\s*\n+([\s\S]*?)(?=\n#{1,6}\s+|$)/i);
  if (!match) return "";
  const blocks = match[1].split(/\n\s*\n/).map(cleanMultilineText).filter(Boolean);
  const abstractBlocks = [];
  for (const block of blocks) {
    if (/^(?:click to copy|this is a preview|acs publications|copyright\b|©|access this article)/i.test(block)) {
      if (abstractBlocks.length) break;
      continue;
    }
    if (/^(?:!\[|[-*]\s|\[.+\]\()/.test(block)) {
      if (abstractBlocks.length) break;
      continue;
    }
    if (!abstractBlocks.length && block.length < 40) continue;
    abstractBlocks.push(block);
  }
  return abstractBlocks.join(" ");
}

async function fetchFirecrawlAbstractForPaper(paper, options = {}) {
  const doi = normalizeDoi(paper?.doi);
  if (!doi) return null;
  const config = options.config || await readFirecrawlConfig(options.configFile);
  if (!config.enabled || !config.endpoint || !config.apiKey) return null;
  const fetchImpl = options.fetchImpl || fetch;
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  const scrape = async url => {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        formats: ["markdown", "rawHtml"],
        onlyMainContent: true,
        proxy: "auto",
        timeout: 25000
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Firecrawl 摘要抓取失败：HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success === false) throw new Error(payload.error || "Firecrawl 摘要抓取失败");
    const data = payload?.data || {};
    const metadataAbstract = cleanAbstractText(htmlMetaContent(data.rawHtml, ["citation_abstract", "dc.description"]));
    const abstract = isCompleteAbstract(metadataAbstract)
      ? metadataAbstract
      : cleanAbstractText(markdownAbstract(data.markdown));
    if (!isCompleteAbstract(abstract)) return null;
    return {
      doi,
      title: data.metadata?.title || paper.title,
      authors: paper.authors || [],
      abstract
    };
  };
  const knownUrls = [...new Set([
    `https://doi.org/${doi}`,
    compactText(paper?.url)
  ].filter(url => /^https?:\/\//i.test(url)))];
  const searchEndpoint = String(config.endpoint).replace(/\/scrape\/?$/i, "/search");
  const searchCandidates = async () => {
    if (searchEndpoint === config.endpoint) return null;
    const response = await fetchImpl(searchEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `"${doi}" "${compactText(paper?.title)}"`,
        limit: 5,
        sources: ["web"],
        categories: ["research", "pdf"],
        timeout: 15000,
        ignoreInvalidURLs: true
      }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Firecrawl 摘要搜索失败：HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.success === false) throw new Error(payload.error || "Firecrawl 摘要搜索失败");
    const urls = [...new Set((payload?.data?.web || [])
      .map(item => compactText(item?.url))
      .filter(url => /^https?:\/\//i.test(url) && !knownUrls.includes(url)))]
      .slice(0, 3);
    if (!urls.length) return null;
    try {
      return await Promise.any(urls.map(url => scrape(url).then(result => result || Promise.reject(null))));
    } catch (error) {
      const cause = error?.errors?.find(item => item instanceof Error);
      if (cause) throw cause;
      return null;
    }
  };
  try {
    return await Promise.any([
      ...knownUrls.map(url => scrape(url)),
      searchCandidates()
    ].map(request => request.then(result => result || Promise.reject(null))));
  } catch (error) {
    const cause = error?.errors?.find(item => item instanceof Error);
    if (cause) throw cause;
    return null;
  }
}

function defaultAbstractSources(paper, options) {
  const directSource = arxivIdFromPaper(paper)
    ? "arxiv"
    : (doiFromBioRxivUrl(paper?.url) || /biorxiv\.org/i.test(paper?.url || "") ? "biorxiv" : "publisher");
  return {
    wos: () => fetchWebOfScienceAbstractByDoi(paper, options),
    semanticScholar: async () => options.semanticScholarBatchPromise
      ? (await options.semanticScholarBatchPromise).get(normalizeDoi(paper?.doi)) || null
      : fetchSemanticScholarAbstractByDoi(paper, options),
    openAlex: () => fetchOpenAlexAbstractByDoi(paper, options.openAlex || options),
    crossref: () => fetchCrossrefAbstractByDoi(paper, options),
    firecrawl: () => fetchFirecrawlAbstractForPaper(paper, options.firecrawl || {}),
    [directSource]: () => fetchOriginalAbstractForPaper(paper, options)
  };
}

async function recoverAbstractConsensus(paper, options = {}) {
  const errors = Array.isArray(options.errors) ? options.errors : null;
  const lookupPaper = { ...paper, doi: preferredPaperDoi(paper) };
  const currentSource = abstractSourceLabel(lookupPaper?.retrievalSource || lookupPaper?.source || "existing");
  const current = normalizeAbstractCandidate(currentSource, {
    doi: lookupPaper?.doi,
    title: lookupPaper?.title,
    authors: lookupPaper?.authors,
    abstract: lookupPaper?.summary
  }, lookupPaper);
  if (current) {
    return { abstract: current.cleanAbstract, sources: [current.source], doi: lookupPaper.doi };
  }
  const sources = options.abstractSources || defaultAbstractSources(lookupPaper, options);
  const pending = Object.entries(sources).map(([source, loader], index) => ({
    index,
    promise: Promise.resolve()
      .then(() => loader(lookupPaper))
      .then(value => ({ index, source, value }))
      .catch(error => ({ index, source, error }))
  }));

  while (pending.length) {
    const result = await Promise.race(pending.map(item => item.promise));
    pending.splice(pending.findIndex(item => item.index === result.index), 1);
    if (result.error) {
      if (errors) errors.push({ source: "abstract", message: `${abstractSourceLabel(result.source)}: ${result.error.message}` });
      continue;
    }
    const candidate = normalizeAbstractCandidate(result.source, result.value, lookupPaper);
    if (!candidate) continue;
    return {
      abstract: candidate.cleanAbstract,
      sources: [candidate.source],
      doi: lookupPaper.doi
    };
  }
  return null;
}

async function recoverGeneratedSummaryPapers(papers, options = {}) {
  const academicApis = options.academicApis
    || (options.abstractSources
      ? DEFAULT_ACADEMIC_APIS_CONFIG
      : await readAcademicApisConfig(options.academicApisConfigFile));
  const semanticScholarBatchPromise = options.abstractSources ? null : fetchSemanticScholarAbstractBatch(papers, options)
    .catch(error => {
      if (Array.isArray(options.errors)) options.errors.push({ source: "abstract", message: error.message });
      return new Map();
    });
  const recoveryOptions = {
    ...options,
    academicApis,
    ...(semanticScholarBatchPromise ? { semanticScholarBatchPromise } : {})
  };
  return mapWithConcurrency(papers, 2, async paper => {
    if (compactText(paper?.abstractZh)
      && !paperHasTruncatedAbstractText(paper)
      && paper?.tokenUsage?.status === "已调用 AI") return paper;
    if (Array.isArray(paper?.abstractConsensusSources)
      && paper.abstractConsensusSources.length >= 1
      && isCompleteAbstract(paper?.summary)) {
      return { ...paper, abstractStatus: "confirmed" };
    }
    const match = await recoverAbstractConsensus(paper, recoveryOptions);
    if (!match) {
      return {
        ...paper,
        doi: preferredPaperDoi(paper),
        abstractZh: paperHasTruncatedAbstractText(paper) ? "" : paper.abstractZh,
        abstractStatus: "unconfirmed",
        abstractConsensusSources: []
      };
    }
    return {
      ...paper,
      doi: match.doi || paper.doi,
      summary: match.abstract,
      abstractStatus: "confirmed",
      abstractConsensusSources: match.sources
    };
  });
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
  const doi = decodeXml(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return doi.replace(/^(10\.1117\/[^?#\s]+?)\.(?:short|full)$/i, "$1");
}

function detectExactPaperInput(value) {
  const clean = compactText(value);
  const doi = normalizeDoi(clean);
  if (/^10\.\d{4,9}\/\S+$/i.test(doi)) return { type: "doi", value: doi };
  if (/^WOS:\d+$/i.test(clean)) return { type: "wos-ut", value: clean.toUpperCase() };
  const arxiv = clean.match(/^(?:arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i)
    || clean.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (arxiv) return { type: "arxiv", value: arxiv[1] };
  if (/^https?:\/\//i.test(clean)) return { type: "url", value: clean };
  return { type: "title", value: clean };
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

const DISPLAY_TITLE_ACRONYMS = new Map(
  ["SIM", "RIM", "DNA", "RNA", "AI", "3D", "2D", "PSF", "OTF"].map(value => [value.toLowerCase(), value])
);

function formatDisplayTitle(value) {
  const title = compactText(value);
  const letters = title.replace(/[^a-z]/gi, "");
  if (!letters || (title !== title.toUpperCase() && title !== title.toLowerCase())) return title;
  return title.toLowerCase().replace(/[a-z0-9]+/g, word => (
    DISPLAY_TITLE_ACRONYMS.get(word) || `${word[0].toUpperCase()}${word.slice(1)}`
  ));
}

function datePrecision(value) {
  const clean = compactText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "day";
  if (/^\d{4}-\d{2}$/.test(clean)) return "month";
  if (/^\d{4}$/.test(clean)) return "year";
  return "unknown";
}

const DATE_PRECISION_RANK = { unknown: 0, year: 1, month: 2, day: 3 };

function mostPrecisePublishedDate(values) {
  return values.filter(Boolean).reduce((best, value) => {
    const rank = DATE_PRECISION_RANK[datePrecision(value)];
    const bestRank = DATE_PRECISION_RANK[datePrecision(best)];
    return rank > bestRank || (rank === bestRank && value < best) ? value : best;
  }, "");
}

function normalizeCitationCount(value) {
  const clean = value === null || value === undefined ? "" : compactText(String(value));
  return clean && Number.isFinite(Number(clean)) ? Number(clean) : null;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
    retrievalSource: compactText(paper?.retrievalSource),
    sourceId: compactText(paper?.sourceId || paper?.id),
    displayTitle: compactText(paper?.displayTitle || formatDisplayTitle(title)),
    publishedPrecision: compactText(paper?.publishedPrecision || datePrecision(paper?.published)),
    publicationStage: compactText(paper?.publicationStage || "formal"),
    citationCount: normalizeCitationCount(paper?.citationCount),
    citationSource: compactText(paper?.citationSource),
    relatedVersions: Array.isArray(paper?.relatedVersions) ? paper.relatedVersions.map(compactText).filter(Boolean) : [],
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

function sanitizeLocalExportValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeLocalExportValue);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
      .replace(/sk-[A-Za-z0-9._-]{12,}/g, "sk-[REDACTED]")
      .replace(/AIzaSy[A-Za-z0-9._-]{12,}/g, "AIzaSy[REDACTED]");
  }
  const result = {};
  Object.entries(value).forEach(([key, child]) => {
    if (/api[_-]?key|secret|authorization|password/i.test(key)) return;
    result[key] = sanitizeLocalExportValue(child);
  });
  return result;
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let crc = index;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      return crc >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function buildZip(entries) {
  const fileRecords = [];
  const localParts = [];
  let offset = 0;
  const { time, day } = dosDateTime();

  entries.forEach(entry => {
    const name = String(entry.path || "").replace(/\\/g, "/");
    if (!name || name.startsWith("/") || name.includes("..")) return;
    const nameBuffer = Buffer.from(name, "utf8");
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(String(entry.content ?? ""), "utf8");
    const compressed = zlib.deflateRawSync(content);
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(day, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, compressed);
    fileRecords.push({ nameBuffer, crc, compressedSize: compressed.length, size: content.length, offset, time, day });
    offset += localHeader.length + nameBuffer.length + compressed.length;
  });

  const centralParts = [];
  let centralSize = 0;
  fileRecords.forEach(record => {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(record.time, 12);
    header.writeUInt16LE(record.day, 14);
    header.writeUInt32LE(record.crc, 16);
    header.writeUInt32LE(record.compressedSize, 20);
    header.writeUInt32LE(record.size, 24);
    header.writeUInt16LE(record.nameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(record.offset, 42);
    centralParts.push(header, record.nameBuffer);
    centralSize += header.length + record.nameBuffer.length;
  });

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(fileRecords.length, 8);
  end.writeUInt16LE(fileRecords.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function findZipEndOffset(buffer) {
  const min = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP 文件缺少结束目录");
}

function parseZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const endOffset = findZipEndOffset(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = {};
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP 中央目录无效");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.slice(nameStart, nameStart + nameLength).toString(flags & 0x0800 ? "utf8" : "utf8").replace(/\\/g, "/");
    offset = nameStart + nameLength + extraLength + commentLength;
    if (!name || name.endsWith("/") || name.startsWith("/") || name.includes("..")) continue;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("ZIP 本地文件头无效");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    if (method === 0) {
      entries[name] = compressed;
    } else if (method === 8) {
      entries[name] = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`ZIP 压缩方式不支持：${method}`);
    }
  }
  return entries;
}

function parseZipJsonEntry(entries, name) {
  if (!entries[name]) return undefined;
  return JSON.parse(entries[name].toString("utf8"));
}

function parseZipJsonlEntry(entries, name) {
  if (!entries[name]) return undefined;
  return entries[name]
    .toString("utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
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

function cleanSearchLogic(value, keywordConfig) {
  const hasStoredLogic = value && typeof value === "object"
    && (Array.isArray(value.activeKeywords) || Array.isArray(value.andEdges));
  const available = new Map(
    Object.values(keywordConfig).flat().map(item => [compactText(item.text).toLowerCase(), compactText(item.text)])
  );
  const defaultActive = Object.values(keywordConfig).flat()
    .filter(item => item.enabled !== false)
    .map(item => item.text);
  const activeKeywords = Array.from(new Set((hasStoredLogic ? value.activeKeywords || [] : defaultActive)
    .map(item => available.get(compactText(item).toLowerCase()))
    .filter(Boolean)));
  const andEdges = [];
  const seen = new Set();
  for (const pair of Array.isArray(value?.andEdges) ? value.andEdges : []) {
    const left = available.get(compactText(pair?.[0]).toLowerCase());
    const right = available.get(compactText(pair?.[1]).toLowerCase());
    if (!left || !right || left === right) continue;
    const key = [left.toLowerCase(), right.toLowerCase()].sort().join("::");
    if (!seen.has(key)) andEdges.push([left, right]);
    seen.add(key);
  }
  return { activeKeywords, andEdges };
}

function searchLogicGroups(searchLogic) {
  const graph = new Map();
  for (const [left, right] of searchLogic.andEdges || []) {
    if (!graph.has(left)) graph.set(left, new Set());
    if (!graph.has(right)) graph.set(right, new Set());
    graph.get(left).add(right);
    graph.get(right).add(left);
  }
  const groups = [];
  const visited = new Set();
  for (const keyword of graph.keys()) {
    if (visited.has(keyword)) continue;
    const stack = [keyword];
    const group = [];
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      group.push(current);
      for (const next of graph.get(current) || []) stack.push(next);
    }
    groups.push(group);
  }
  return groups;
}

function buildSearchExpression(searchLogic = {}) {
  const connected = new Set((searchLogic.andEdges || []).flat());
  const clauses = searchLogicGroups(searchLogic).map(group => `(${group.join(" AND ")})`);
  for (const keyword of searchLogic.activeKeywords || []) {
    if (!connected.has(keyword)) clauses.push(keyword);
  }
  return clauses.join(" OR ");
}

function paperMatchesSearchLogic(paper, searchLogic) {
  if (paper.retrievalSource === "webofscience") return true;
  const text = `${paper.title || ""} ${paper.summary || ""} ${(paper.tags || []).join(" ")}`;
  const matches = keyword => keywordMatches(text, [keyword]).length > 0;
  const connected = new Set((searchLogic.andEdges || []).flat());
  const groups = searchLogicGroups(searchLogic);
  if (groups.some(group => group.every(matches))) return true;
  return (searchLogic.activeKeywords || []).some(keyword => !connected.has(keyword) && matches(keyword));
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
  const keywords = cleanKeywordConfig(value?.keywords);
  return {
    keywords,
    searchLogic: cleanSearchLogic(value?.searchLogic, keywords),
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

function cleanWebOfScienceConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    provider: String(input.provider || DEFAULT_WEB_OF_SCIENCE_CONFIG.provider),
    enabled: input.enabled === true,
    endpoint: String(input.endpoint || ""),
    apiKey: String(input.apiKey || ""),
    databaseId: String(input.databaseId || DEFAULT_WEB_OF_SCIENCE_CONFIG.databaseId),
    maxPages: clampPositiveInteger(input.maxPages, DEFAULT_WEB_OF_SCIENCE_CONFIG.maxPages, 1, WEB_OF_SCIENCE_MAX_PAGES_LIMIT),
    pageSize: clampPositiveInteger(input.pageSize, DEFAULT_WEB_OF_SCIENCE_CONFIG.pageSize, 1, WEB_OF_SCIENCE_PAGE_SIZE_LIMIT),
    queryTemplate: String(input.queryTemplate || DEFAULT_WEB_OF_SCIENCE_CONFIG.queryTemplate),
    request: {
      ...DEFAULT_WEB_OF_SCIENCE_CONFIG.request,
      ...(input.request && typeof input.request === "object" ? input.request : {})
    },
    responseMap: {
      ...DEFAULT_WEB_OF_SCIENCE_CONFIG.responseMap,
      ...(input.responseMap && typeof input.responseMap === "object" ? input.responseMap : {})
    }
  };
}

async function readWebOfScienceConfig(file = WEB_OF_SCIENCE_CONFIG_FILE) {
  return cleanWebOfScienceConfig(await readJsonFile(file, DEFAULT_WEB_OF_SCIENCE_CONFIG));
}

function cleanFirecrawlConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const apiKey = String(input.apiKey || "").trim();
  return {
    provider: String(input.provider || DEFAULT_FIRECRAWL_CONFIG.provider),
    enabled: input.enabled === true,
    endpoint: String(input.endpoint || DEFAULT_FIRECRAWL_CONFIG.endpoint),
    apiKey: apiKey === "********" ? "" : apiKey
  };
}

async function readFirecrawlConfig(file = FIRECRAWL_CONFIG_FILE) {
  return cleanFirecrawlConfig(await readJsonFile(file, DEFAULT_FIRECRAWL_CONFIG));
}

function cleanAcademicApisConfig(value) {
  const contactEmail = String(value?.contactEmail || "").trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new Error("学术 API 联系邮箱格式不正确");
  }
  return { contactEmail };
}

async function readAcademicApisConfig(file = ACADEMIC_APIS_CONFIG_FILE) {
  return cleanAcademicApisConfig(await readJsonFile(file, DEFAULT_ACADEMIC_APIS_CONFIG));
}

function cleanOpenAlexConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const apiKey = String(input.apiKey || "").trim();
  return {
    provider: String(input.provider || DEFAULT_OPENALEX_CONFIG.provider),
    enabled: input.enabled === true,
    endpoint: String(input.endpoint || DEFAULT_OPENALEX_CONFIG.endpoint),
    apiKey: apiKey === "********" ? "" : apiKey,
    maxPages: clampPositiveInteger(input.maxPages, DEFAULT_OPENALEX_CONFIG.maxPages, 1, OPENALEX_MAX_PAGES_LIMIT),
    perPage: clampPositiveInteger(input.perPage, DEFAULT_OPENALEX_CONFIG.perPage, 1, OPENALEX_PER_PAGE_LIMIT)
  };
}

async function readOpenAlexConfig(file = OPENALEX_CONFIG_FILE) {
  return cleanOpenAlexConfig(await readJsonFile(file, DEFAULT_OPENALEX_CONFIG));
}

async function readFirecrawlCreditUsage(config, fetchImpl = fetch) {
  if (!config.apiKey) return { status: "unconfigured" };
  try {
    const endpoint = new URL("/v2/team/credit-usage", config.endpoint).toString();
    const response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return { status: "error", httpStatus: response.status };
    const payload = await response.json();
    const remainingCredits = Number(payload?.data?.remainingCredits);
    const planCredits = Number(payload?.data?.planCredits);
    if (!Number.isFinite(remainingCredits) || !Number.isFinite(planCredits)) return { status: "error" };
    return {
      status: "ok",
      remainingCredits,
      planCredits,
      billingPeriodStart: String(payload.data.billingPeriodStart || ""),
      billingPeriodEnd: String(payload.data.billingPeriodEnd || "")
    };
  } catch {
    return { status: "error" };
  }
}

function cleanLlmModelPoolEntry(value = {}, index = 0) {
  const model = compactText(value.model);
  if (!model) return null;
  const quota = Number(value.freeQuotaTokens);
  const priority = Number(value.priority);
  return {
    model,
    displayName: compactText(value.displayName || value.name || model),
    family: compactText(value.family || "Aliyun Text"),
    enabled: value.enabled !== false,
    freeQuotaTokens: Number.isFinite(quota) && quota > 0 ? Math.round(quota) : 1000000,
    priority: Number.isFinite(priority) ? priority : (index + 1) * 10,
    source: compactText(value.source || "aliyun-modelstudio-text-generation"),
    notes: compactText(value.notes)
  };
}

function cleanAliyunTextModelRegistryEntry(value = {}, index = 0) {
  const model = compactText(value.model);
  if (!model) return null;
  if (/embedding|embed|rerank|ocr|audio|image|video|vision|speech/i.test(model)) return null;
  return {
    model,
    displayName: compactText(value.displayName || value.name || model),
    family: compactText(value.family || "Aliyun Text"),
    enabled: value.enabled === true,
    freeQuotaTokens: Math.max(1, Math.round(Number(value.freeQuotaTokens || 1000000))),
    priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : (index + 1) * 10,
    source: "aliyun-modelstudio-text-generation",
    notes: compactText(value.notes || "Text chat model for PaperHot summary and recommendation prompts.")
  };
}

function readAliyunTextModelRegistry() {
  return ALIYUN_TEXT_MODEL_REGISTRY
    .map((item, index) => cleanAliyunTextModelRegistryEntry(item, index))
    .filter(Boolean);
}

function cleanLlmModelPool(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const ratio = Number(input.quotaSwitchRatio);
  const failureSwitchThreshold = Number(input.failureSwitchThreshold);
  const registry = readAliyunTextModelRegistry();
  const registryByModel = new Map(registry.map(item => [item.model.toLowerCase(), item]));
  const savedRows = new Map();
  (Array.isArray(input.models) ? input.models : [])
    .map((item, index) => cleanLlmModelPoolEntry(item, index))
    .filter(Boolean)
    .forEach(item => {
      const key = item.model.toLowerCase();
      if (registryByModel.has(key) && !savedRows.has(key)) savedRows.set(key, item);
    });
  const models = registry
    .map(item => ({ ...item, ...(savedRows.get(item.model.toLowerCase()) || {}) }))
    .sort((left, right) => left.priority - right.priority);
  return {
    quotaMode: input.quotaMode === "official-first" ? "official-first" : DEFAULT_ALIYUN_MODEL_POOL.quotaMode,
    quotaFallback: input.quotaFallback === "local" ? "local" : DEFAULT_ALIYUN_MODEL_POOL.quotaFallback,
    quotaSwitchRatio: Number.isFinite(ratio) && ratio > 0
      ? Math.min(ratio, DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio)
      : DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio,
    failureSwitchThreshold: Number.isInteger(failureSwitchThreshold) && failureSwitchThreshold > 0 ? failureSwitchThreshold : DEFAULT_ALIYUN_MODEL_POOL.failureSwitchThreshold,
    models
  };
}

function cleanLlmProvider(value, fallback = {}) {
  const input = value && typeof value === "object" ? value : {};
  const id = String(input.id || fallback.id || input.provider || fallback.provider || "custom").trim();
  const provider = String(input.provider || fallback.provider || id);
  return {
    id,
    name: String(input.name || fallback.name || id),
    desc: String(input.desc || fallback.desc || ""),
    provider,
    enabled: input.enabled === true,
    apiMode: String(input.apiMode || fallback.apiMode || "openai"),
    host: String(input.host || fallback.host || ""),
    endpoint: String(input.endpoint || fallback.endpoint || ""),
    dashscopeEndpoint: String(input.dashscopeEndpoint || fallback.dashscopeEndpoint || ""),
    apiKey: String(input.apiKey || ""),
    model: String(input.model || fallback.model || ""),
    modelPresets: Array.isArray(input.modelPresets) ? input.modelPresets.map(compactText).filter(Boolean) : (fallback.modelPresets || []),
    contextWindow: Number(input.contextWindow || fallback.contextWindow || 131000),
    reasoning: String(input.reasoning || fallback.reasoning || "auto"),
    ...(provider === "aliyun-modelstudio" ? { modelPool: cleanLlmModelPool(input.modelPool || fallback.modelPool) } : {})
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
  const webOfScience = await readWebOfScienceConfig(options.webOfScienceConfigFile);
  const firecrawl = await readFirecrawlConfig(options.firecrawlConfigFile);
  const academicApis = await readAcademicApisConfig(options.academicApisConfigFile);
  const openAlex = await readOpenAlexConfig(options.openAlexConfigFile);
  return {
    llm: maskSecretConfig(llm),
    googleScholar: maskSecretConfig(googleScholar),
    journalMetrics: maskSecretConfig(journalMetrics),
    webOfScience: {
      ...maskSecretConfig(webOfScience),
      usage: await readWebOfScienceUsage(options.dataDir || DATA_DIR)
    },
    firecrawl: {
      ...maskSecretConfig(firecrawl),
      usage: await readFirecrawlCreditUsage(firecrawl, options.firecrawlFetchImpl)
    },
    openAlex: maskSecretConfig(openAlex),
    academicApis
  };
}

async function readIntegrationSecrets(options = {}) {
  const llm = await readLlmConfig(options.llmConfigFile);
  const googleScholar = await readGoogleScholarConfig(options.googleScholarConfigFile);
  const journalMetrics = await readJournalMetricsConfig(options.journalMetricsConfigFile);
  const webOfScience = await readWebOfScienceConfig(options.webOfScienceConfigFile);
  const firecrawl = await readFirecrawlConfig(options.firecrawlConfigFile);
  const openAlex = await readOpenAlexConfig(options.openAlexConfigFile);
  return {
    llm: {
      apiKey: llm.apiKey || "",
      providers: (llm.providers || []).map(provider => ({
        id: provider.id,
        apiKey: provider.apiKey || ""
      }))
    },
    googleScholar: { apiKey: googleScholar.apiKey || "" },
    journalMetrics: { apiKey: journalMetrics.apiKey || "" },
    webOfScience: { apiKey: webOfScience.apiKey || "" },
    firecrawl: { apiKey: firecrawl.apiKey || "" },
    openAlex: { apiKey: openAlex.apiKey || "" }
  };
}

function mergeSecretConfig(previous, next, cleaner) {
  const merged = cleaner({
    ...previous,
    ...(next && typeof next === "object" ? next : {})
  });
  const nextApiKey = String(next?.apiKey || "").trim();
  if (!nextApiKey || nextApiKey === "********") {
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
  const webOfScienceFile = options.webOfScienceConfigFile || WEB_OF_SCIENCE_CONFIG_FILE;
  const firecrawlFile = options.firecrawlConfigFile || FIRECRAWL_CONFIG_FILE;
  const academicApisFile = options.academicApisConfigFile || ACADEMIC_APIS_CONFIG_FILE;
  const openAlexFile = options.openAlexConfigFile || OPENALEX_CONFIG_FILE;
  const previousGoogle = await readGoogleScholarConfig(googleFile);
  const previousJournal = await readJournalMetricsConfig(journalFile);
  const previousWebOfScience = await readWebOfScienceConfig(webOfScienceFile);
  const previousFirecrawl = await readFirecrawlConfig(firecrawlFile);
  const previousAcademicApis = await readAcademicApisConfig(academicApisFile);
  const previousOpenAlex = await readOpenAlexConfig(openAlexFile);
  const llmPromise = queueLlmModelPoolConfigUpdate(llmFile, async () => {
    const previousLlm = await readLlmConfig(llmFile);
    const llm = mergeLlmConfig(previousLlm, payload.llm);
    await writeJsonFile(llmFile, llm);
    return llm;
  });
  const googleScholar = mergeSecretConfig(previousGoogle, payload.googleScholar, cleanGoogleScholarConfig);
  const journalMetrics = mergeSecretConfig(previousJournal, payload.journalMetrics, cleanJournalMetricsConfig);
  const webOfScience = mergeSecretConfig(previousWebOfScience, payload.webOfScience, cleanWebOfScienceConfig);
  const firecrawl = mergeSecretConfig(previousFirecrawl, payload.firecrawl, cleanFirecrawlConfig);
  const openAlex = mergeSecretConfig(previousOpenAlex, payload.openAlex, cleanOpenAlexConfig);
  const academicApis = cleanAcademicApisConfig({
    ...previousAcademicApis,
    ...(payload.academicApis && typeof payload.academicApis === "object" ? payload.academicApis : {})
  });

  const [llm] = await Promise.all([
    llmPromise,
    writeJsonFile(googleFile, googleScholar),
    writeJsonFile(journalFile, journalMetrics),
    writeJsonFile(webOfScienceFile, webOfScience),
    writeJsonFile(firecrawlFile, firecrawl),
    writeJsonFile(openAlexFile, openAlex),
    writeJsonFile(academicApisFile, academicApis)
  ]);
  return {
    llm: maskSecretConfig(llm),
    googleScholar: maskSecretConfig(googleScholar),
    journalMetrics: maskSecretConfig(journalMetrics),
    webOfScience: {
      ...maskSecretConfig(webOfScience),
      usage: await readWebOfScienceUsage(options.dataDir || DATA_DIR)
    },
    firecrawl: {
      ...maskSecretConfig(firecrawl),
      usage: await readFirecrawlCreditUsage(firecrawl, options.firecrawlFetchImpl)
    },
    openAlex: maskSecretConfig(openAlex),
    academicApis
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

async function readFetchLogPayload(dataDir = DATA_DIR) {
  return readJsonFile(path.join(dataDir, FETCH_LOG_NAME), { logs: [] });
}

async function writeFetchLogPayload(payload, dataDir = DATA_DIR) {
  const logs = Array.isArray(payload?.logs) ? payload.logs : [];
  return writeJsonFile(path.join(dataDir, FETCH_LOG_NAME), {
    ...payload,
    mode: "fetch-log",
    updatedAt: new Date().toISOString(),
    logs
  });
}

async function writeOperationLogEntries(entries, dataDir = DATA_DIR) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, OPERATION_LOG_NAME);
  const cleanEntries = Array.isArray(entries) ? entries.filter(entry => entry && typeof entry === "object") : [];
  const text = cleanEntries.map(entry => JSON.stringify({
    at: compactText(entry.at) || new Date().toISOString(),
    action: entry.action || "modify",
    operation: entry.operation || entry.action || "modify",
    ...entry
  })).join("\n");
  await fs.writeFile(file, text ? `${text}\n` : "", "utf8");
  return file;
}

async function readGoogleRollingCursorsPayload(dataDir = DATA_DIR) {
  return readJsonFile(path.join(dataDir, GOOGLE_ROLLING_CURSOR_NAME), { cursors: {} });
}

async function listPaperCacheFiles(dataDir = DATA_DIR) {
  try {
    const fileNames = await fs.readdir(dataDir);
    return fileNames
      .filter(fileName => dateKeyFromCacheFile(fileName))
      .sort();
  } catch {
    return [];
  }
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

function discoveryTaskIdentity(input = {}) {
  const sources = [...new Set((Array.isArray(input.sources) ? input.sources : [])
    .map(source => compactText(source).toLowerCase())
    .filter(Boolean))].sort();
  return {
    searchMode: input.searchMode === "exact" ? "exact" : "direction",
    queryExpression: compactText(input.queryExpression).toLowerCase(),
    startDate: compactText(input.startDate),
    endDate: compactText(input.endDate),
    sources
  };
}

function buildDiscoveryTaskFingerprint(input = {}) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(discoveryTaskIdentity(input)))
    .digest("hex")
    .slice(0, 24);
}

async function readRecentFetchCursors(dataDir = DATA_DIR) {
  const data = await readJsonFile(path.join(dataDir, RECENT_FETCH_CURSORS_NAME), { tasks: {} });
  return data && data.tasks && typeof data.tasks === "object" ? data : { tasks: {} };
}

// ponytail: serialized only within this process; use an atomic datastore if multi-process refreshes are introduced.
const recentFetchCursorWriteQueues = new Map();

function queueRecentFetchCursorUpdate(dataDir, operation) {
  const key = path.resolve(dataDir, RECENT_FETCH_CURSORS_NAME);
  const update = (recentFetchCursorWriteQueues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(operation);
  recentFetchCursorWriteQueues.set(key, update);
  update.then(() => {
    if (recentFetchCursorWriteQueues.get(key) === update) recentFetchCursorWriteQueues.delete(key);
  }, () => {
    if (recentFetchCursorWriteQueues.get(key) === update) recentFetchCursorWriteQueues.delete(key);
  });
  return update;
}

async function writeRecentFetchCursor(task = {}, dataDir = DATA_DIR) {
  const identity = discoveryTaskIdentity(task);
  const fingerprint = buildDiscoveryTaskFingerprint(task);
  const incomingSourcePages = {};
  Object.entries(task.sourcePages || {}).sort(([left], [right]) => left.localeCompare(right)).forEach(([source, progress]) => {
    const normalizedSource = compactText(source).toLowerCase();
    if (!identity.sources.includes(normalizedSource)) return;
    const nextPage = Number(progress?.nextPage ?? progress);
    if (Number.isFinite(nextPage) && nextPage > 0) {
      incomingSourcePages[normalizedSource] = {
        nextPage: Math.floor(nextPage),
        complete: progress?.complete === true
      };
    }
  });
  return queueRecentFetchCursorUpdate(dataDir, async () => {
    const data = await readRecentFetchCursors(dataDir);
    const previousSourcePages = data.tasks[fingerprint]?.sourcePages || {};
    const sourcePages = Object.fromEntries(Object.entries({ ...previousSourcePages, ...incomingSourcePages })
      .filter(([source]) => identity.sources.includes(source)));
    data.tasks[fingerprint] = {
      query: compactText(task.queryExpression),
      startDate: identity.startDate,
      endDate: identity.endDate,
      sources: identity.sources,
      sourcePages,
      updatedAt: new Date().toISOString()
    };
    await writeJsonFile(path.join(dataDir, RECENT_FETCH_CURSORS_NAME), data);
    return { fingerprint, ...data.tasks[fingerprint] };
  });
}

async function clearRecentFetchCursor(fingerprint, dataDir = DATA_DIR) {
  const cleanFingerprint = compactText(fingerprint);
  return queueRecentFetchCursorUpdate(dataDir, async () => {
    const data = await readRecentFetchCursors(dataDir);
    delete data.tasks[cleanFingerprint];
    await writeJsonFile(path.join(dataDir, RECENT_FETCH_CURSORS_NAME), data);
    return data;
  });
}

function cleanWebOfScienceUsage(usage = {}) {
  const cleanCounts = value => Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .map(([key, count]) => [compactText(key), Math.max(0, Number(count || 0))])
    .filter(([key]) => key));
  return {
    trackingStartedAt: compactText(usage.trackingStartedAt),
    totalCount: Math.max(0, Number(usage.totalCount || 0)),
    months: cleanCounts(usage.months),
    days: cleanCounts(usage.days),
    lastRequestAt: compactText(usage.lastRequestAt),
    lastStatus: compactText(usage.lastStatus)
  };
}

async function readWebOfScienceUsageFile(dataDir = DATA_DIR) {
  return cleanWebOfScienceUsage(await readJsonFile(path.join(dataDir, WEB_OF_SCIENCE_USAGE_NAME), {
    trackingStartedAt: "",
    totalCount: 0,
    months: {},
    days: {},
    lastRequestAt: "",
    lastStatus: ""
  }));
}

async function readWebOfScienceUsage(dataDir = DATA_DIR, now = new Date()) {
  const usage = await readWebOfScienceUsageFile(dataDir);
  const current = now instanceof Date ? now : new Date(now);
  const today = todayString(current);
  const month = today.slice(0, 7);
  const months = usage.months && typeof usage.months === "object" ? usage.months : {};
  const days = usage.days && typeof usage.days === "object" ? usage.days : {};
  return {
    trackingStartedAt: compactText(usage.trackingStartedAt),
    todayCount: Number(days[today] || 0),
    monthCount: Number(months[month] || 0),
    totalCount: Number(usage.totalCount || 0),
    months,
    lastRequestAt: compactText(usage.lastRequestAt),
    lastStatus: compactText(usage.lastStatus)
  };
}

function cleanLlmModelPoolStateEntry(value = {}) {
  const status = ["available", "near_limit", "exhausted", "failing", "disabled"].includes(value.status)
    ? value.status
    : "available";
  return {
    model: compactText(value.model),
    status,
    localUsedTokens: Math.max(0, Math.round(Number(value.localUsedTokens || 0))),
    officialRemainingTokens: value.officialRemainingTokens === null || value.officialRemainingTokens === undefined
      ? null
      : Math.max(0, Math.round(Number(value.officialRemainingTokens || 0))),
    officialQuotaCheckedAt: compactText(value.officialQuotaCheckedAt),
    officialQuotaStatus: compactText(value.officialQuotaStatus || "unavailable"),
    consecutiveFailures: Math.max(0, Math.round(Number(value.consecutiveFailures || 0))),
    lastSuccessAt: compactText(value.lastSuccessAt),
    lastFailureAt: compactText(value.lastFailureAt),
    lastFailureMessage: compactText(value.lastFailureMessage),
    lastSwitchAt: compactText(value.lastSwitchAt),
    lastSwitchReason: compactText(value.lastSwitchReason),
    lastTestAt: compactText(value.lastTestAt),
    lastTestStatus: ["passed", "failed", ""].includes(value.lastTestStatus) ? compactText(value.lastTestStatus) : "",
    lastTestMessage: compactText(value.lastTestMessage)
  };
}

function cleanLlmModelPoolState(value = {}) {
  const inputModels = value && typeof value.models === "object" && !Array.isArray(value.models) ? value.models : {};
  const models = {};
  Object.entries(inputModels).forEach(([key, entry]) => {
    const cleanKey = compactText(key);
    const keyModel = cleanKey.includes("::") ? cleanKey.split("::").pop() : cleanKey;
    const clean = cleanLlmModelPoolStateEntry({ ...entry, model: entry?.model || keyModel });
    if (clean.model) models[cleanKey.includes("::") ? cleanKey : clean.model] = clean;
  });
  const activeModels = {};
  if (value && typeof value.activeModels === "object" && !Array.isArray(value.activeModels)) {
    Object.entries(value.activeModels).forEach(([providerId, model]) => {
      const cleanProviderId = compactText(providerId);
      const cleanModel = compactText(model);
      if (cleanProviderId && cleanModel) activeModels[cleanProviderId] = cleanModel;
    });
  }
  return {
    format: LLM_MODEL_POOL_STATE_FORMAT,
    updatedAt: compactText(value.updatedAt),
    activeModel: compactText(value.activeModel),
    activeModels,
    models
  };
}

async function readLlmModelPoolState(dataDir = DATA_DIR) {
  return cleanLlmModelPoolState(await readJsonFile(path.join(dataDir, LLM_MODEL_POOL_STATE_NAME), {
    format: LLM_MODEL_POOL_STATE_FORMAT,
    models: {}
  }));
}

async function writeLlmModelPoolState(state, dataDir = DATA_DIR) {
  const clean = cleanLlmModelPoolState({ ...state, updatedAt: new Date().toISOString() });
  await writeJsonFile(path.join(dataDir, LLM_MODEL_POOL_STATE_NAME), clean);
  return clean;
}

// ponytail: serialized only within this process; use an atomic datastore if model-pool writers become multi-process.
const llmModelPoolStateUpdateQueues = new Map();
const llmModelPoolConfigUpdateQueues = new Map();

function queueLlmModelPoolStateUpdate(dataDir, operation) {
  const key = path.resolve(dataDir, LLM_MODEL_POOL_STATE_NAME);
  const update = (llmModelPoolStateUpdateQueues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(operation);
  llmModelPoolStateUpdateQueues.set(key, update);
  update.then(() => {
    if (llmModelPoolStateUpdateQueues.get(key) === update) llmModelPoolStateUpdateQueues.delete(key);
  }, () => {
    if (llmModelPoolStateUpdateQueues.get(key) === update) llmModelPoolStateUpdateQueues.delete(key);
  });
  return update;
}

function queueLlmModelPoolConfigUpdate(configFile, operation) {
  const key = path.resolve(configFile);
  const update = (llmModelPoolConfigUpdateQueues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(operation);
  llmModelPoolConfigUpdateQueues.set(key, update);
  update.then(() => {
    if (llmModelPoolConfigUpdateQueues.get(key) === update) llmModelPoolConfigUpdateQueues.delete(key);
  }, () => {
    if (llmModelPoolConfigUpdateQueues.get(key) === update) llmModelPoolConfigUpdateQueues.delete(key);
  });
  return update;
}

function modelPoolStatusForModel(modelConfig, stateEntry = {}, pool = DEFAULT_ALIYUN_MODEL_POOL) {
  if (!modelConfig.enabled) return "disabled";
  const used = Number(stateEntry.localUsedTokens || 0);
  const quota = Number(modelConfig.freeQuotaTokens || 1000000);
  const configuredRatio = Number(pool?.quotaSwitchRatio || DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio);
  const quotaSwitchRatio = Number.isFinite(configuredRatio)
    ? Math.min(configuredRatio, DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio)
    : DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio;
  const threshold = quota * quotaSwitchRatio;
  if (stateEntry.status === "exhausted" || used >= quota) return "exhausted";
  if (stateEntry.status === "failing") return "failing";
  if (used >= threshold) return "near_limit";
  return "available";
}

function llmModelPoolStateKey(providerId, model) {
  const cleanProviderId = compactText(providerId);
  const cleanModel = compactText(model);
  return cleanProviderId ? `${cleanProviderId}::${cleanModel}` : cleanModel;
}

function llmModelPoolStateEntryForModel(state = {}, providerId = "", model = "") {
  const scoped = state.models?.[llmModelPoolStateKey(providerId, model)];
  if (scoped) return scoped;
  return state.models?.[compactText(model)] || {};
}

function llmModelPoolActiveModel(state = {}, providerId = "") {
  const cleanProviderId = compactText(providerId);
  return cleanProviderId ? compactText(state.activeModels?.[cleanProviderId]) : compactText(state.activeModel);
}

function setLlmModelPoolActiveModel(state = {}, providerId = "", model = "") {
  const cleanProviderId = compactText(providerId);
  const cleanModel = compactText(model);
  if (cleanProviderId) {
    state.activeModels = state.activeModels && typeof state.activeModels === "object" ? state.activeModels : {};
    if (cleanModel) state.activeModels[cleanProviderId] = cleanModel;
    else delete state.activeModels[cleanProviderId];
  } else {
    state.activeModel = cleanModel;
  }
}

function setLlmModelPoolStateEntry(state = {}, providerId = "", model = "", entry = {}) {
  state.models = state.models && typeof state.models === "object" ? state.models : {};
  state.models[llmModelPoolStateKey(providerId, model)] = cleanLlmModelPoolStateEntry({ ...entry, model });
}

function deleteLlmModelPoolStateEntry(state = {}, providerId = "", model = "") {
  const cleanProviderId = compactText(providerId);
  const cleanModel = compactText(model);
  if (cleanProviderId) {
    delete state.models?.[llmModelPoolStateKey(cleanProviderId, cleanModel)];
    if (state.activeModels?.[cleanProviderId] === cleanModel) delete state.activeModels[cleanProviderId];
    return;
  }
  if (state.models) {
    delete state.models[cleanModel];
    Object.keys(state.models)
      .filter(key => key.endsWith(`::${cleanModel}`))
      .forEach(key => delete state.models[key]);
  }
  if (state.activeModel === cleanModel) state.activeModel = "";
  if (state.activeModels) {
    Object.entries(state.activeModels).forEach(([key, value]) => {
      if (value === cleanModel) delete state.activeModels[key];
    });
  }
}

function selectLlmPoolModel({ pool, state = {}, attempted = new Set(), providerId = "" }) {
  const cleanPool = cleanLlmModelPool(pool);
  const rows = cleanPool.models
    .filter(model => !attempted.has(model.model))
    .map(model => {
    const entry = llmModelPoolStateEntryForModel(state, providerId, model.model);
    const status = modelPoolStatusForModel(model, entry, cleanPool);
    return { ...model, state: entry, status };
  });
  const available = rows.find(row => row.status === "available");
  if (available) return { ...available, reason: "available" };
  return null;
}

function isRetryableLlmModelFailure(error) {
  const message = String(error?.message || error || "");
  if (/HTTP\s*(401|403)/i.test(message)) return false;
  if (/API 密钥未填写|Endpoint 未填写|模型未填写|invalid endpoint/i.test(message)) return false;
  return /HTTP\s*(429|5\d\d)|timeout|network|quota|rate limit|insufficient|额度|限流/i.test(message);
}

function activeProviderModelPool(config = {}) {
  const provider = Array.isArray(config.providers)
    ? config.providers.find(item => item.id === config.activeProviderId)
    : null;
  if (provider) return provider.provider === "aliyun-modelstudio" ? provider.modelPool || null : null;
  if (config.provider === "aliyun-modelstudio") return config.modelPool || null;
  return null;
}

function activeProviderIdForModelPool(config = {}) {
  const provider = Array.isArray(config.providers)
    ? config.providers.find(item => item.id === config.activeProviderId)
    : null;
  if (provider?.provider === "aliyun-modelstudio") return compactText(provider.id);
  if (config.provider === "aliyun-modelstudio") return compactText(config.activeProviderId || config.id);
  return "";
}

async function readLlmModelPoolStatus(options = {}) {
  const config = await readLlmConfig(options.llmConfigFile);
  const state = await readLlmModelPoolState(options.dataDir || DATA_DIR);
  const provider = aliyunProviderFromConfig(config, options.providerId);
  if (!provider) throw new Error("未找到指定的阿里百炼 LLM 配置");
  const pool = cleanLlmModelPool(provider.modelPool || DEFAULT_ALIYUN_MODEL_POOL);
  const registry = readAliyunTextModelRegistry();
  const savedRows = new Map(pool.models.map(item => [item.model, item]));
  const allModels = registry.map(item => ({ ...item, ...(savedRows.get(item.model) || {}) }));
  return {
    providerId: provider.id,
    activeModel: llmModelPoolActiveModel(state, provider.id) || compactText(state.activeModel) || provider.model || "",
    quotaMode: pool.quotaMode,
    quotaFallback: pool.quotaFallback,
    quotaSwitchRatio: pool.quotaSwitchRatio,
    failureSwitchThreshold: pool.failureSwitchThreshold,
    models: allModels.map(model => {
      const entry = llmModelPoolStateEntryForModel(state, provider.id, model.model);
      const status = modelPoolStatusForModel(model, entry, pool);
      const localUsedTokens = Number(entry.localUsedTokens || 0);
      const freeQuotaTokens = Number(model.freeQuotaTokens || 1000000);
      const estimatedRemainingTokens = Math.max(0, freeQuotaTokens - localUsedTokens);
      const usageRatio = freeQuotaTokens > 0 ? Math.min(1, localUsedTokens / freeQuotaTokens) : 0;
      return {
        ...model,
        ...entry,
        model: model.model,
        status,
        statusLabel: llmModelPoolStatusLabel(status),
        selectable: status === "available",
        greyed: status !== "available",
        failureHint: entry.lastSwitchReason === "repeated-failure" ? "上次因连续失败切换" : "",
        localUsedTokens,
        estimatedRemainingTokens,
        usageRatio,
        remainingRatio: Math.max(0, 1 - usageRatio),
        thresholdTokens: Math.round(freeQuotaTokens * Number(pool.quotaSwitchRatio || DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio))
      };
    })
  };
}

function aliyunProviderFromConfig(config = {}, providerId = "") {
  const cleanProviderId = compactText(providerId);
  if (cleanProviderId) {
    return (config.providers || []).find(item => item.id === cleanProviderId && item.provider === "aliyun-modelstudio") || null;
  }
  return (config.providers || []).find(item => item.id === config.activeProviderId && item.provider === "aliyun-modelstudio")
    || (config.providers || []).find(item => item.provider === "aliyun-modelstudio")
    || null;
}

function assertAliyunTextModel(model) {
  const cleanModel = compactText(model);
  if (!cleanModel) throw new Error("模型名称不能为空");
  if (!readAliyunTextModelRegistry().some(item => item.model === cleanModel)) {
    throw new Error(`模型不在阿里百炼文本模型注册表中: ${cleanModel}`);
  }
  return cleanModel;
}

function patchLlmPoolModel(pool = DEFAULT_ALIYUN_MODEL_POOL, model, patch = {}) {
  const cleanModel = compactText(model);
  const cleanPool = cleanLlmModelPool(pool);
  const rows = new Map(cleanPool.models.map(item => [item.model, item]));
  const current = rows.get(cleanModel) || readAliyunTextModelRegistry().find(item => item.model === cleanModel);
  rows.set(cleanModel, cleanLlmModelPoolEntry({
    ...current,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    freeQuotaTokens: patch.freeQuotaTokens === undefined ? current.freeQuotaTokens : Number(patch.freeQuotaTokens)
  }, rows.size));
  return { ...cleanPool, models: [...rows.values()].filter(Boolean).sort((left, right) => left.priority - right.priority) };
}

async function updateLlmModelPoolModel(model, patch = {}, options = {}) {
  const cleanModel = assertAliyunTextModel(model);
  const configFile = options.llmConfigFile || options.configFile || LLM_CONFIG_FILE;
  const providerId = await queueLlmModelPoolConfigUpdate(configFile, async () => {
    const config = await readLlmConfig(configFile);
    const provider = aliyunProviderFromConfig(config, options.providerId || patch.providerId);
    if (!provider) throw new Error("未找到指定的阿里百炼 LLM 配置");
    provider.modelPool = patchLlmPoolModel(provider.modelPool, cleanModel, patch);
    await writeJsonFile(configFile, cleanLlmConfig(config));
    return provider.id;
  });
  return { ok: true, status: await readLlmModelPoolStatus({ ...options, providerId, llmConfigFile: configFile }) };
}

async function testLlmPoolModel(model, options = {}) {
  const cleanModel = assertAliyunTextModel(model);
  const configFile = options.llmConfigFile || options.configFile || LLM_CONFIG_FILE;
  const dataDir = options.dataDir || DATA_DIR;
  const config = await readLlmConfig(configFile);
  const provider = aliyunProviderFromConfig(config, options.providerId);
  if (!provider) throw new Error("未找到指定的阿里百炼 LLM 配置");
  if (!provider.endpoint) throw new Error("LLM Endpoint 未填写");
  if (!provider.apiKey && provider.apiMode !== "local") throw new Error("LLM API 密钥未填写");
  let insight;
  try {
    insight = await callConfiguredLlm({
      paper: {
        title: "Aliyun model pool connectivity test",
        summary: "This is a short PaperHot connectivity test for one Aliyun text chat model.",
        reason: "模型池单模型测试",
        journal: "paperHOT test",
        doi: ""
      },
      userBackground: provider.userBackground || config.userBackground || DEFAULT_USER_BACKGROUND,
      config: { ...provider, enabled: true, model: cleanModel },
      fetchImpl: options.fetchImpl || fetch
    });
  } catch (error) {
    await queueLlmModelPoolStateUpdate(dataDir, async () => {
      const state = await readLlmModelPoolState(dataDir);
      const previous = llmModelPoolStateEntryForModel(state, provider.id, cleanModel);
      const consecutiveFailures = Number(previous.consecutiveFailures || 0) + (isRetryableLlmModelFailure(error) ? 1 : 0);
      const failedAt = new Date().toISOString();
      setLlmModelPoolStateEntry(state, provider.id, cleanModel, {
        ...previous,
        model: cleanModel,
        status: consecutiveFailures >= Number((provider.modelPool || {}).failureSwitchThreshold || DEFAULT_ALIYUN_MODEL_POOL.failureSwitchThreshold) ? "failing" : previous.status,
        consecutiveFailures,
        lastFailureAt: failedAt,
        lastFailureMessage: error.message,
        lastTestAt: failedAt,
        lastTestStatus: "failed",
        lastTestMessage: error.message
      });
      await writeLlmModelPoolState(state, dataDir);
    });
    await appendOperationLogSafe({
      action: "test",
      operation: "llm-model-pool-test",
      model: cleanModel,
      result: "failed",
      error: error.message
    }, dataDir);
    return { ok: false, model: cleanModel, enabled: false, error: error.message, status: await readLlmModelPoolStatus({ ...options, providerId: provider.id, llmConfigFile: configFile, dataDir }) };
  }
  const usage = insight?.tokenUsage || {};
  await queueLlmModelPoolStateUpdate(dataDir, async () => {
    const state = await readLlmModelPoolState(dataDir);
    const previous = llmModelPoolStateEntryForModel(state, provider.id, cleanModel);
    const passedAt = new Date().toISOString();
    setLlmModelPoolStateEntry(state, provider.id, cleanModel, {
      ...previous,
      model: cleanModel,
      status: "available",
      localUsedTokens: Number(previous.localUsedTokens || 0) + Number(usage.total || 0),
      consecutiveFailures: 0,
      lastSuccessAt: passedAt,
      lastTestAt: passedAt,
      lastTestStatus: "passed",
      lastTestMessage: "测试成功"
    });
    await writeLlmModelPoolState(state, dataDir);
  });
  await updateLlmModelPoolModel(cleanModel, { enabled: true }, { ...options, providerId: provider.id, llmConfigFile: configFile, dataDir });
  await appendOperationLogSafe({
    action: "test",
    operation: "llm-model-pool-test",
    model: cleanModel,
    result: "passed",
    llm: summarizeLlmLog([{
      model: cleanModel,
      prompt: Number(usage.prompt || 0),
      completion: Number(usage.completion || 0),
      total: Number(usage.total || Number(usage.prompt || 0) + Number(usage.completion || 0))
    }])
  }, dataDir);
  return { ok: true, model: cleanModel, enabled: true, tokenUsage: usage, status: await readLlmModelPoolStatus({ ...options, providerId: provider.id, llmConfigFile: configFile, dataDir }) };
}

function llmModelPoolStatusLabel(status) {
  if (status === "near_limit") return "低于 15%";
  if (status === "exhausted") return "已用尽";
  if (status === "failing") return "响应失败";
  if (status === "disabled") return "未启用";
  return "额度充足";
}

async function resetLlmModelPoolState(model, options = {}) {
  const cleanModel = compactText(model);
  if (!cleanModel) throw new Error("模型名称不能为空");
  const dataDir = options.dataDir || DATA_DIR;
  await queueLlmModelPoolStateUpdate(dataDir, async () => {
    const state = await readLlmModelPoolState(dataDir);
    deleteLlmModelPoolStateEntry(state, options.providerId, cleanModel);
    await writeLlmModelPoolState(state, dataDir);
  });
  await appendOperationLogSafe({
    action: "modify",
    operation: "llm-model-pool-reset",
    model: cleanModel
  }, dataDir);
  return { ok: true, status: await readLlmModelPoolStatus({ ...options, dataDir }) };
}

// ponytail: serialized only within this process; use an atomic datastore if multi-process fetches are introduced.
let webOfScienceUsageWriteQueue = Promise.resolve();

async function recordWebOfScienceRequest({ status, at = new Date().toISOString() } = {}, dataDir = DATA_DIR) {
  const update = webOfScienceUsageWriteQueue.then(async () => {
    const requestDate = new Date(at);
    const requestAt = requestDate.toISOString();
    const file = path.join(dataDir, WEB_OF_SCIENCE_USAGE_NAME);
    const usage = await readJsonFile(file, {
      trackingStartedAt: requestAt,
      totalCount: 0,
      months: {},
      days: {},
      lastRequestAt: "",
      lastStatus: ""
    });
    const day = todayString(requestDate);
    const month = day.slice(0, 7);
    usage.months = usage.months && typeof usage.months === "object" ? usage.months : {};
    usage.days = usage.days && typeof usage.days === "object" ? usage.days : {};
    usage.totalCount = Number(usage.totalCount || 0) + 1;
    usage.months[month] = Number(usage.months[month] || 0) + 1;
    usage.days[day] = Number(usage.days[day] || 0) + 1;
    usage.trackingStartedAt ||= requestAt;
    usage.lastRequestAt = requestAt;
    usage.lastStatus = compactText(status);
    await writeJsonFile(file, usage);
    return usage;
  });
  webOfScienceUsageWriteQueue = update.catch(() => {});
  return update;
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

async function readUserProfileFile(file = USER_PROFILE_FILE) {
  return cleanUserProfile(await readJsonFile(file, DEFAULT_USER_PROFILE));
}

async function readUserConfig(file = USER_CONFIG_FILE) {
  return cleanUserConfig(await readJsonFile(file, DEFAULT_USER_CONFIG));
}

async function writeUserConfig(config, file = USER_CONFIG_FILE) {
  const cleanConfig = cleanUserConfig(config);
  await writeJsonFile(file, cleanConfig);
  return cleanConfig;
}

async function writeUserProfile(profile, file = USER_PROFILE_FILE) {
  const cleanProfile = cleanUserProfile(profile);
  await writeJsonFile(file, cleanProfile);
  return cleanProfile;
}

async function readUserState(options = {}) {
  return {
    profile: options.profileFile ? await readUserProfileFile(options.profileFile) : await readUserProfile(),
    config: await readUserConfig(options.configFile)
  };
}

function localDataManifest() {
  return {
    format: LOCAL_DATA_FORMAT,
    version: LOCAL_DATA_VERSION,
    minimumImporterVersion: 1
  };
}

function migrateLocalDataBackup(payload = {}) {
  const version = Number(payload.version || 1);
  if (payload.format && payload.format !== LOCAL_DATA_FORMAT) {
    throw new Error(`不支持的本地数据备份格式：${payload.format}`);
  }
  if (!Number.isInteger(version) || version < 1 || version > LOCAL_DATA_VERSION) {
    throw new Error(`不支持的本地数据备份版本：${payload.version}`);
  }
  return payload;
}

async function exportLocalData(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const userConfigFile = options.userConfigFile || USER_CONFIG_FILE;
  const userProfileFile = options.userProfileFile || USER_PROFILE_FILE;
  const includePapers = options.includePapers !== false;
  const includeProfile = options.includeProfile === true;
  const includeSecrets = options.includeSecrets === true;
  const includeStats = options.includeStats === true;
  const includeLogs = options.includeLogs === true;
  const paperCacheFiles = {};
  if (includeStats) {
    const cacheNames = await listPaperCacheFiles(dataDir);
    await Promise.all(cacheNames.map(async fileName => {
      paperCacheFiles[fileName] = await readJsonFile(path.join(dataDir, fileName), {});
    }));
  }
  const payload = {
    ok: true,
    ...localDataManifest(),
    exportedAt: new Date().toISOString(),
    data: {
      user: {
        config: await readUserConfig(userConfigFile),
        ...(includeProfile ? { profile: await readUserProfileFile(userProfileFile) } : {})
      },
      papers: {
        ...(includePapers ? {
          archive: await readPaperArchive(dataDir),
          favorites: await readFavoritesFile(dataDir),
          notes: await readPaperNotesFile(dataDir)
        } : {}),
        ...(includeLogs ? {
          operationLog: await readOperationLog(dataDir),
          fetchLog: await readFetchLogPayload(dataDir)
        } : {}),
        ...(includeStats ? {
          journalMetricsCache: await readJournalMetricsCache(dataDir),
          googleRollingCursors: await readGoogleRollingCursorsPayload(dataDir),
          webOfScienceUsage: await readWebOfScienceUsageFile(dataDir),
          llmModelPoolState: await readLlmModelPoolState(dataDir),
          paperCacheFiles
        } : {})
      }
    }
  };
  if (includeSecrets) {
    payload.data.integrations = {
      llm: await readLlmConfig(options.llmConfigFile),
      googleScholar: await readGoogleScholarConfig(options.googleScholarConfigFile),
      journalMetrics: await readJournalMetricsConfig(options.journalMetricsConfigFile),
      webOfScience: await readWebOfScienceConfig(options.webOfScienceConfigFile),
      firecrawl: await readFirecrawlConfig(options.firecrawlConfigFile),
      openAlex: await readOpenAlexConfig(options.openAlexConfigFile),
      academicApis: await readAcademicApisConfig(options.academicApisConfigFile)
    };
  }
  return includeSecrets ? payload : sanitizeLocalExportValue(payload);
}

async function buildLocalDataExportFiles(options = {}) {
  const includePapers = options.includePapers !== false;
  const includeProfile = options.includeProfile === true;
  const includeSecrets = options.includeSecrets === true;
  const includeStats = options.includeStats === true;
  const includeLogs = options.includeLogs === true;
  const payload = await exportLocalData(options);
  const data = payload.data || {};
  const files = [
    {
      path: "paperhot-local-data.json",
      content: jsonText({
        ok: true,
        ...localDataManifest(),
        packageType: "zip",
        exportedAt: payload.exportedAt,
        includePapers,
        includeProfile,
        includeSecrets,
        includeStats,
        includeLogs
      })
    },
    { path: "data/user/config.json", content: jsonText(data.user?.config || {}) }
  ];
  if (includePapers) {
    files.push(
      { path: "data/papers/archive.json", content: jsonText(data.papers?.archive || { mode: "archive", papers: [] }) },
      { path: "data/papers/favorites.json", content: jsonText(data.papers?.favorites || { favorites: [] }) },
      { path: "data/papers/paper-notes.json", content: jsonText(data.papers?.notes || { notes: [] }) }
    );
  }
  if (includeLogs) {
    files.push(
      { path: "data/papers/fetch-log.json", content: jsonText(data.papers?.fetchLog || { logs: [] }) },
      { path: "data/papers/operation-log.jsonl", content: (data.papers?.operationLog || []).map(entry => JSON.stringify(entry)).join("\n") + ((data.papers?.operationLog || []).length ? "\n" : "") }
    );
  }
  if (includeStats) {
    files.push(
      { path: "data/papers/journal-metrics-cache.json", content: jsonText(data.papers?.journalMetricsCache || { updatedAt: "", journals: {} }) },
      { path: "data/papers/google-rolling-cursors.json", content: jsonText(data.papers?.googleRollingCursors || { cursors: {} }) },
      { path: "data/papers/web-of-science-usage.json", content: jsonText(cleanWebOfScienceUsage(data.papers?.webOfScienceUsage)) },
      { path: "data/papers/llm-model-pool-state.json", content: jsonText(cleanLlmModelPoolState(data.papers?.llmModelPoolState)) }
    );
    Object.entries(data.papers?.paperCacheFiles || {}).forEach(([fileName, content]) => {
      if (dateKeyFromCacheFile(fileName)) files.push({ path: `data/papers/${fileName}`, content: jsonText(content) });
    });
  }
  if (includeProfile && data.user?.profile) {
    files.push({ path: "data/user/profile.json", content: jsonText(data.user.profile) });
  }
  if (includeSecrets && data.integrations) {
    files.push(
      { path: "config/llm.json", content: jsonText(data.integrations.llm || {}) },
      { path: "config/google-scholar.json", content: jsonText(data.integrations.googleScholar || {}) },
      { path: "config/journal-metrics.json", content: jsonText(data.integrations.journalMetrics || {}) },
      { path: "config/web-of-science.json", content: jsonText(data.integrations.webOfScience || {}) },
      { path: "config/firecrawl.json", content: jsonText(data.integrations.firecrawl || {}) },
      { path: "config/openalex.json", content: jsonText(data.integrations.openAlex || {}) },
      { path: "config/academic-apis.json", content: jsonText(data.integrations.academicApis || {}) }
    );
  }
  return files;
}

async function exportLocalDataZip(options = {}) {
  return buildZip(await buildLocalDataExportFiles(options));
}

async function importLocalData(payload = {}, options = {}) {
  const migratedPayload = migrateLocalDataBackup(payload || {});
  const input = migratedPayload?.data && typeof migratedPayload.data === "object" ? migratedPayload.data : migratedPayload;
  const dataDir = options.dataDir || DATA_DIR;
  const userConfigFile = options.userConfigFile || USER_CONFIG_FILE;
  const userProfileFile = options.userProfileFile || USER_PROFILE_FILE;
  const allowSecrets = options.allowSecrets === true;
  const imported = [];
  const skipped = [];

  if (input?.user?.config) {
    await writeUserConfig(input.user.config, userConfigFile);
    imported.push("userConfig");
  }
  if (input?.user?.profile) {
    await writeUserProfile(input.user.profile, userProfileFile);
    imported.push("userProfile");
  }
  if (input?.papers?.archive) {
    const papers = Array.isArray(input.papers.archive.papers) ? input.papers.archive.papers.map(completePaperRecord) : [];
    await writePaperArchive({
      ...input.papers.archive,
      mode: "archive",
      updatedAt: new Date().toISOString(),
      count: papers.length,
      papers
    }, dataDir);
    imported.push("archive");
  }
  if (input?.papers?.favorites) {
    const favorites = Array.isArray(input.papers.favorites.favorites)
      ? input.papers.favorites.favorites.map(cleanFavoriteRecord).filter(record => record.keys.length)
      : [];
    await writeFavoritesFile({
      ...input.papers.favorites,
      mode: "favorites",
      updatedAt: new Date().toISOString(),
      count: favorites.length,
      favorites
    }, dataDir);
    imported.push("favorites");
  }
  if (input?.papers?.notes) {
    const notes = Array.isArray(input.papers.notes.notes)
      ? input.papers.notes.notes.map(cleanPaperNoteRecord).filter(record => record.keys.length)
      : [];
    await writePaperNotesFile({
      ...input.papers.notes,
      mode: "paper-notes",
      updatedAt: new Date().toISOString(),
      count: notes.length,
      notes
    }, dataDir);
    imported.push("notes");
  }
  if (input?.papers?.operationLog) {
    await writeOperationLogEntries(input.papers.operationLog, dataDir);
    imported.push("operationLog");
  }
  if (input?.papers?.fetchLog) {
    await writeFetchLogPayload(input.papers.fetchLog, dataDir);
    imported.push("fetchLog");
  }
  if (input?.papers?.journalMetricsCache) {
    await writeJournalMetricsCache(input.papers.journalMetricsCache, dataDir);
    imported.push("journalMetricsCache");
  }
  if (input?.papers?.googleRollingCursors) {
    await writeGoogleRollingCursors(input.papers.googleRollingCursors, dataDir);
    imported.push("googleRollingCursors");
  }
  if (input?.papers?.webOfScienceUsage) {
    await writeJsonFile(path.join(dataDir, WEB_OF_SCIENCE_USAGE_NAME), cleanWebOfScienceUsage(input.papers.webOfScienceUsage));
    imported.push("webOfScienceUsage");
  }
  if (input?.papers?.llmModelPoolState) {
    await queueLlmModelPoolStateUpdate(dataDir, () => writeLlmModelPoolState(input.papers.llmModelPoolState, dataDir));
    imported.push("llmModelPoolState");
  }
  if (input?.papers?.paperCacheFiles && typeof input.papers.paperCacheFiles === "object") {
    const cacheEntries = Object.entries(input.papers.paperCacheFiles)
      .filter(([fileName, payload]) => dateKeyFromCacheFile(fileName) && payload && typeof payload === "object");
    if (cacheEntries.length) {
      await fs.mkdir(dataDir, { recursive: true });
      await Promise.all(cacheEntries.map(([fileName, payload]) => writeJsonFile(path.join(dataDir, fileName), payload)));
      imported.push("paperCacheFiles");
    }
  }
  if (input?.integrations) {
    if (allowSecrets) {
      await writeIntegrationConfigs(input.integrations, options);
      imported.push("integrations");
    } else {
      skipped.push("integrations");
    }
  }

  if (imported.length) {
    await appendOperationLogSafe({
      action: "import",
      operation: "local-data-import",
      imported
    }, dataDir);
  }

  return { ok: true, imported, skipped };
}

async function importLocalDataZip(input, options = {}) {
  const entries = parseZipEntries(input);
  if (entries["paperhot-local-data.json"]) {
    const packagePayload = parseZipJsonEntry(entries, "paperhot-local-data.json");
    migrateLocalDataBackup(packagePayload);
    if (packagePayload?.data) return importLocalData(packagePayload, options);
  }
  const payload = {
    user: {},
    papers: {}
  };
  const userConfig = parseZipJsonEntry(entries, "data/user/config.json");
  const userProfile = parseZipJsonEntry(entries, "data/user/profile.json");
  const archive = parseZipJsonEntry(entries, "data/papers/archive.json");
  const favorites = parseZipJsonEntry(entries, "data/papers/favorites.json");
  const notes = parseZipJsonEntry(entries, "data/papers/paper-notes.json");
  const fetchLog = parseZipJsonEntry(entries, "data/papers/fetch-log.json");
  const operationLog = parseZipJsonlEntry(entries, "data/papers/operation-log.jsonl");
  const journalMetricsCache = parseZipJsonEntry(entries, "data/papers/journal-metrics-cache.json");
  const googleRollingCursors = parseZipJsonEntry(entries, "data/papers/google-rolling-cursors.json");
  const webOfScienceUsage = parseZipJsonEntry(entries, "data/papers/web-of-science-usage.json");
  const llmModelPoolState = parseZipJsonEntry(entries, "data/papers/llm-model-pool-state.json");
  const llm = parseZipJsonEntry(entries, "config/llm.json");
  const googleScholar = parseZipJsonEntry(entries, "config/google-scholar.json");
  const journalMetrics = parseZipJsonEntry(entries, "config/journal-metrics.json");
  const webOfScience = parseZipJsonEntry(entries, "config/web-of-science.json");
  const firecrawl = parseZipJsonEntry(entries, "config/firecrawl.json");
  const openAlex = parseZipJsonEntry(entries, "config/openalex.json");
  const academicApis = parseZipJsonEntry(entries, "config/academic-apis.json");
  const paperCacheFiles = {};
  Object.keys(entries).forEach(entryName => {
    const match = entryName.match(/^data\/papers\/(\d{4}-\d{2}-\d{2}(?:-recent)?\.json)$/);
    if (!match) return;
    paperCacheFiles[match[1]] = JSON.parse(entries[entryName].toString("utf8"));
  });

  if (userConfig) payload.user.config = userConfig;
  if (userProfile) payload.user.profile = userProfile;
  if (archive) payload.papers.archive = archive;
  if (favorites) payload.papers.favorites = favorites;
  if (notes) payload.papers.notes = notes;
  if (fetchLog) payload.papers.fetchLog = fetchLog;
  if (operationLog) payload.papers.operationLog = operationLog;
  if (journalMetricsCache) payload.papers.journalMetricsCache = journalMetricsCache;
  if (googleRollingCursors) payload.papers.googleRollingCursors = googleRollingCursors;
  if (webOfScienceUsage) payload.papers.webOfScienceUsage = webOfScienceUsage;
  if (llmModelPoolState) payload.papers.llmModelPoolState = llmModelPoolState;
  if (Object.keys(paperCacheFiles).length) payload.papers.paperCacheFiles = paperCacheFiles;
  if (llm || googleScholar || journalMetrics || webOfScience || firecrawl || openAlex || academicApis) {
    payload.integrations = {};
    if (llm) payload.integrations.llm = llm;
    if (googleScholar) payload.integrations.googleScholar = googleScholar;
    if (journalMetrics) payload.integrations.journalMetrics = journalMetrics;
    if (webOfScience) payload.integrations.webOfScience = webOfScience;
    if (firecrawl) payload.integrations.firecrawl = firecrawl;
    if (openAlex) payload.integrations.openAlex = openAlex;
    if (academicApis) payload.integrations.academicApis = academicApis;
  }

  return importLocalData(payload, options);
}

function filterPapersByKeywords(papers, keywords) {
  const clean = cleanKeywords(keywords);
  if (!clean.length) return papers;
  return papers.filter(paper => {
    if (paper.retrievalSource === "webofscience") return true;
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
    if (paper.retrievalSource === "webofscience") return true;
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
  return completePaperRecord({
    id: `arxiv-${idPart || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    retrievalSource: "arxiv",
    sourceId: idPart,
    publicationStage: "preprint",
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
  });
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
  return completePaperRecord({
    id: `biorxiv-${doi || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    retrievalSource: "biorxiv",
    sourceId: doi,
    publicationStage: "preprint",
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
  });
}

function parseEnabledSources(sourceNames) {
  const names = (Array.isArray(sourceNames) ? sourceNames : []).map(name => String(name || "").toLowerCase());
  const sources = [];
  if (names.some(name => name.includes("arxiv"))) sources.push("arxiv");
  if (names.some(name => name.includes("biorxiv") || name.includes("bioarxiv"))) sources.push("biorxiv");
  if (names.some(name => name.includes("semantic scholar") || name.includes("semanticscholar"))) sources.push("semanticscholar");
  if (names.some(name => name.includes("openalex") || name.includes("open alex"))) sources.push("openalex");
  if (names.some(name => name.includes("google scholar") || name.includes("googlescholar") || name.includes("谷歌学术"))) sources.push("googlescholar");
  if (names.some(name => (name.includes("google") || name.includes("谷歌")) && !name.includes("scholar") && !name.includes("学术"))) sources.push("googlesearch");
  if (names.some(name => name.includes("web of science") || name.includes("webofscience") || name.includes("wos"))) sources.push("webofscience");
  return Array.from(new Set(sources));
}

function arxivQueryTerm(keyword) {
  const expanded = ACRONYM_EXPANSIONS[compactText(keyword).toLowerCase()] || compactText(keyword);
  return `all:"${expanded.replace(/"/g, "")}"`;
}

function buildArxivQuery(keywords, searchLogic) {
  if (searchLogic && typeof searchLogic === "object") {
    const connected = new Set((searchLogic.andEdges || []).flat());
    const clauses = searchLogicGroups(searchLogic)
      .map(group => `(${group.map(arxivQueryTerm).join(" AND ")})`);
    for (const keyword of searchLogic.activeKeywords || []) {
      if (!connected.has(keyword)) clauses.push(arxivQueryTerm(keyword));
    }
    if (clauses.length) return clauses.join(" OR ");
  }
  const clean = cleanKeywords(keywords)
    .map(keyword => ACRONYM_EXPANSIONS[keyword.toLowerCase()] || keyword)
    .slice(0, 8);
  const terms = clean.map(keyword => {
    const escaped = keyword.replace(/"/g, "");
    return /\s/.test(escaped) ? `all:"${escaped}"` : `all:${escaped}`;
  });
  return terms.length ? terms.join(" OR ") : "all:microscopy";
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
  const fetchImpl = options.fetchImpl || fetch;
  const pageSize = clampPositiveInteger(options.pageSize || options.maxResults, 50, 1, 2000);
  const maxPages = clampPositiveInteger(options.maxPages, 5, 1, 100);
  const firstPage = clampPositiveInteger(options.startPage, 1, 1, 1000000);
  const entries = [];
  for (let page = firstPage; page < firstPage + maxPages; page += 1) {
    const params = new URLSearchParams({
      search_query: buildArxivQuery(keywords, options.searchLogic),
      start: String((page - 1) * pageSize),
      max_results: String(pageSize),
      sortBy: "submittedDate",
      sortOrder: "descending"
    });
    if (options.arxivId) {
      params.delete("search_query");
      params.set("id_list", compactText(options.arxivId));
    }
    const response = await fetchImpl(`${ARXIV_ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": "paperHOT/0.1 (local research prototype)" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText || ""}`.trim());
    const pageEntries = parseArxivEntries(await response.text());
    entries.push(...pageEntries);
    const oldPage = Boolean(options.startDate)
      && pageEntries.length === pageSize
      && pageEntries.every(entry => dateString(entry.published || entry.updated) < options.startDate);
    const complete = pageEntries.length < pageSize || oldPage || Boolean(options.arxivId);
    await options.onPageComplete?.({ page, nextPage: page + 1, returned: pageEntries.length, complete });
    if (complete) break;
  }
  return entries.map(entry => normalizeArxivEntry(entry, keywords));
}

async function fetchBioRxivPapers(date, keywords = DEFAULT_KEYWORDS, options = {}) {
  const startDate = options.startDate || date;
  const endDate = options.endDate || date;
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${BIORXIV_ENDPOINT}/${startDate}/${endDate}/0/json`, {
    headers: { "User-Agent": "paperHOT/0.1 (local research prototype)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText || ""}`.trim());
  const data = await response.json();
  const items = Array.isArray(data.collection) ? data.collection : [];
  const papers = items.map(item => normalizeBioRxivItem(item, keywords));
  if (options.searchMode === "exact") return papers;
  return options.searchLogic
    ? papers.filter(paper => paperMatchesSearchLogic(paper, options.searchLogic))
    : filterPapersByKeywords(papers, keywords);
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
  return completePaperRecord({
    id: `semanticscholar-${compactText(item.paperId || title)}`,
    retrievalSource: "semanticscholar",
    sourceId: compactText(item.paperId),
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
  });
}

function normalizeOpenAlexWork(item, keywords = DEFAULT_KEYWORDS) {
  const title = compactText(item?.title || item?.display_name);
  const summary = restoreOpenAlexAbstract(item?.abstract_inverted_index);
  const authors = Array.isArray(item?.authorships)
    ? item.authorships.map(entry => compactText(entry?.author?.display_name)).filter(Boolean)
    : [];
  const primaryLocation = item?.primary_location || {};
  const bestOpenLocation = item?.best_oa_location || {};
  const journal = compactText(primaryLocation?.source?.display_name || "OpenAlex");
  const published = compactText(item?.publication_date || (item?.publication_year ? String(item.publication_year) : ""));
  const doi = normalizeDoi(item?.doi || item?.ids?.doi);
  const tags = [
    ...(Array.isArray(item?.topics) ? item.topics.map(topic => topic?.display_name) : []),
    ...(Array.isArray(item?.keywords) ? item.keywords.map(keyword => keyword?.display_name) : [])
  ].map(compactText).filter(Boolean);
  const text = `${title} ${summary} ${journal} ${tags.join(" ")}`;
  const classified = classifyPaper(text);
  const openAlexId = compactText(item?.id);
  const publicationStage = compactText(item?.type).toLowerCase() === "preprint"
    || compactText(primaryLocation?.version).toLowerCase() === "submittedversion"
    ? "preprint"
    : "formal";
  const citationCount = normalizeCitationCount(item?.cited_by_count);
  return completePaperRecord({
    id: `openalex-${openAlexId.split("/").pop() || hashText(title)}`,
    retrievalSource: "openalex",
    sourceId: openAlexId,
    publicationStage,
    citationCount,
    citationSource: citationCount === null ? "" : "OpenAlex",
    doi,
    journal,
    citation: formatCitation({ authors, year: paperYear(published), title, journal, doi }),
    time: timeString(published),
    sourceType: "论文数据库",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: `OpenAlex · ${journal}`,
    title,
    summary,
    tags: tags.slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url: compactText(primaryLocation?.landing_page_url || item?.doi || openAlexId),
    pdfUrl: compactText(bestOpenLocation?.pdf_url || primaryLocation?.pdf_url),
    authors,
    published
  });
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

async function fetchSerpApiPages(url, { request, headers, fetchImpl, sourceLabel, maxPages = 50, start = 0, num = 10, onProgress, onPageComplete, skipBlockedPages = false }) {
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
  const skipCurrentPage = async message => {
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
    const page = Math.floor(lastStart / pageSize) + 1;
    await onPageComplete?.({ page, nextPage: page + 1, returned: 0, complete: false });
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
      if ((response.status === 403 || response.status === 429) && await skipCurrentPage(message)) continue;
      throw new Error(message);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      if (isRobotChallengeText(text)) {
        const message = `${sourceLabel} 机器人访问/反爬挑战：请使用 SerpApi 等合规 JSON API`;
        if (await skipCurrentPage(message)) continue;
        throw new Error(message);
      }
      throw new Error(`${sourceLabel} 信源返回的不是 JSON；请使用 SerpApi / 合规代理端点`);
    }
    if (isRobotChallengePayload(payload)) {
      const message = `${sourceLabel} 机器人访问/反爬挑战：API 返回了验证或限流提示`;
      if (await skipCurrentPage(message)) continue;
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
    const page = Math.floor(lastStart / pageSize) + 1;
    const nextStart = nextSerpApiStart(currentUrl, lastStart, pageSize);
    await onPageComplete?.({
      page,
      nextPage: Math.floor(nextStart / pageSize) + 1,
      complete: !currentUrl
    });
  }
  return {
    pages,
    skippedPages,
    nextStart: nextSerpApiStart(currentUrl, lastStart, pageSize)
  };
}

function normalizeWebOfScienceAuthors(value) {
  if (Array.isArray(value)) {
    return value
      .map(author => compactText(author?.displayName || author?.name || author?.fullName || author))
      .filter(Boolean);
  }
  return normalizeScholarAuthors(value);
}

function webOfSciencePublishedDate(record, responseMap = DEFAULT_WEB_OF_SCIENCE_CONFIG.responseMap) {
  const explicitDate = compactText(record?.published || record?.publicationDate || record?.date);
  if (/^(19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?$/.test(explicitDate)) return explicitDate;
  const year = compactText(getNestedValue(record, responseMap.year) || record?.source?.publishYear || record?.year);
  const rawMonth = compactText(record?.source?.publishMonth || record?.month);
  const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(rawMonth.slice(0, 3).toLowerCase());
  const month = monthIndex >= 0 ? String(monthIndex + 1) : rawMonth;
  const day = compactText(record?.source?.publishDay || record?.day);
  if (/^(19|20)\d{2}$/.test(year) && /^\d{1,2}$/.test(month) && /^\d{1,2}$/.test(day)) {
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^(19|20)\d{2}$/.test(year) && /^\d{1,2}$/.test(month)) return `${year}-${month.padStart(2, "0")}`;
  return /^(19|20)\d{2}$/.test(year) ? year : "";
}

function webOfScienceCitationCount(record, responseMap = DEFAULT_WEB_OF_SCIENCE_CONFIG.responseMap) {
  const citations = getNestedValue(record, responseMap.citationCount) || record?.citations;
  if (!Array.isArray(citations)) return null;
  const citation = citations.find(item => /^(wos|web of science)$/i.test(compactText(item?.db || item?.database)));
  return normalizeCitationCount(citation?.count);
}

function normalizeWebOfScienceRecord(record, keywords = DEFAULT_KEYWORDS, responseMap = DEFAULT_WEB_OF_SCIENCE_CONFIG.responseMap) {
  const title = compactText(getNestedValue(record, responseMap.title) || record?.title);
  const summary = compactText(getNestedValue(record, responseMap.summary) || record?.abstract || record?.summary);
  const journal = compactText(getNestedValue(record, responseMap.journal) || record?.source?.sourceTitle || record?.journal || "Web of Science");
  const doi = normalizeDoi(getNestedValue(record, responseMap.doi) || record?.doi || record?.identifiers?.doi);
  const url = compactText(getNestedValue(record, responseMap.url) || record?.url || record?.links?.record || "");
  const authors = normalizeWebOfScienceAuthors(getNestedValue(record, responseMap.authors) || record?.names?.authors || record?.authors);
  const published = webOfSciencePublishedDate(record, responseMap);
  const keywordTags = [
    ...(Array.isArray(record?.keywords?.authorKeywords) ? record.keywords.authorKeywords : []),
    ...(Array.isArray(record?.keywords) ? record.keywords : [])
  ].map(compactText).filter(Boolean);
  const text = `${title} ${summary} ${journal} ${keywordTags.join(" ")}`;
  const classified = classifyPaper(text);
  const uid = compactText(record?.uid || record?.id || record?.UT || "");
  const citationCount = webOfScienceCitationCount(record, responseMap);
  return completePaperRecord({
    id: `webofscience-${doi || uid.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || hashText(`${title}|${journal}`)}`,
    retrievalSource: "webofscience",
    sourceId: uid,
    citationCount,
    citationSource: citationCount === null ? "" : "Web of Science",
    doi,
    journal,
    citation: formatCitation({ authors, year: paperYear(published), title, journal, doi }),
    time: timeString(published),
    sourceType: "论文数据库",
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    categories: classified.categories,
    categoryLabels: classified.categoryLabels,
    source: `Web of Science · ${journal}`,
    title,
    summary,
    tags: ["Web of Science", journal, ...keywordTags, ...authors.slice(0, 2)].filter(Boolean).slice(0, 5),
    score: scorePaper(text, keywords),
    reason: makeReason(text, keywords),
    tokenUsage: defaultTokenUsage(),
    journalMetrics: defaultJournalMetrics(),
    url,
    authors,
    published
  });
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

function googleScholarCitationCount(item) {
  return normalizeCitationCount(item?.inline_links?.cited_by?.total);
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
  const url = getNestedValue(item, responseMap.url) || item.link || item.url || "";
  const doi = preferredPaperDoi({ doi: getNestedValue(item, responseMap.doi) || item.doi, url });
  const authors = normalizeScholarAuthors(getNestedValue(item, responseMap.authors) || item.authors || item.publication_info?.authors);
  const authorList = authors.length ? authors : parsedPublication.authors;
  const text = `${title} ${summary} ${journal}`;
  const classified = classifyPaper(text);
  const citationCount = googleScholarCitationCount(item);
  return completePaperRecord({
    id: `googlescholar-${doi || Buffer.from(title).toString("base64url").slice(0, 16)}`,
    retrievalSource: "googlescholar",
    sourceId: compactText(item?.result_id || item?.id || item?.cluster_id),
    citationCount,
    citationSource: citationCount === null ? "" : "Google Scholar",
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
    url,
    authors: authorList,
    published
  });
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
  return completePaperRecord({
    id: `googlesearch-${doi || hashText(`${url}|${title}`)}`,
    retrievalSource: "googlesearch",
    sourceId: compactText(item?.result_id || item?.id),
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
  });
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
  return values.slice(0, 3)
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
    abstract: cleanAbstractText(item?.abstract),
    published: mostPrecisePublishedDate([
      crossrefDate(item?.["published-online"]),
      crossrefDate(item?.["published-print"]),
      crossrefDate(item?.published),
      crossrefDate(item?.issued)
    ]),
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
  let url = String(value || "");
  try { url = decodeURIComponent(url); } catch {}
  const nature = url.match(/nature\.com\/articles\/([^/?#]+)/i);
  if (nature) return normalizeDoi(`10.1038/${nature[1]}`);
  const doi = url.match(/(?:doi\.org\/|\/doi\/(?:abs\/|full\/)?)(10\.\d{4,9}\/[^?#\s]+)\/?$/i);
  if (doi) return normalizeDoi(doi[1].replace(/\/+$/, ""));
  const pathDoi = url.match(/\/(10\.\d{4,9}\/[^?#\s]+)\/?$/i);
  if (pathDoi) return normalizeDoi(pathDoi[1].replace(/\/+$/, ""));
  return "";
}

function preferredPaperDoi(paper = {}) {
  const storedDoi = normalizeDoi(paper?.doi);
  const urlDoi = inferDoiFromUrl(paper?.url);
  return /\.s\d+$/i.test(storedDoi) && urlDoi ? urlDoi : (storedDoi || urlDoi);
}

async function crossrefRequestIdentity(url, options = {}) {
  const academicApis = options.academicApis
    ? cleanAcademicApisConfig(options.academicApis)
    : await readAcademicApisConfig(options.academicApisConfigFile);
  const requestUrl = url instanceof URL ? url : new URL(url);
  if (academicApis.contactEmail) requestUrl.searchParams.set("mailto", academicApis.contactEmail);
  return {
    url: requestUrl,
    headers: {
      "User-Agent": academicApis.contactEmail
        ? `paperHOT/0.1 (mailto:${academicApis.contactEmail})`
        : "paperHOT/0.1"
    }
  };
}

async function fetchCrossrefWorkByDoi(doi, options = {}) {
  const cleanDoi = normalizeDoi(doi);
  if (!cleanDoi) return null;
  const fetchImpl = options.fetchImpl || fetch;
  const identity = await crossrefRequestIdentity(`${CROSSREF_WORKS_ENDPOINT}/${encodeURIComponent(cleanDoi)}`, options);
  const response = await fetchImpl(identity.url, {
    headers: identity.headers,
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Crossref DOI 元数据补全失败：HTTP ${response.status}`);
  const payload = await response.json();
  return payload?.message ? crossrefMetadataFromItem(payload.message) : null;
}

async function fetchCrossrefWorkByTitle(paper, options = {}) {
  const doi = preferredPaperDoi(paper);
  if (doi) return fetchCrossrefWorkByDoi(doi, options);
  const title = compactText(paper?.title);
  if (!title) return null;
  const url = new URL(CROSSREF_WORKS_ENDPOINT);
  url.searchParams.set("query.bibliographic", title);
  url.searchParams.set("rows", String(options.rows || 3));
  url.searchParams.set("select", "DOI,title,container-title,author,published,published-print,published-online,issued");
  const fetchImpl = options.fetchImpl || fetch;
  const identity = await crossrefRequestIdentity(url, options);
  const response = await fetchImpl(identity.url, {
    headers: identity.headers,
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
  const published = mostPrecisePublishedDate([paper.published, metadata.published]);
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
    publishedPrecision: datePrecision(published),
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
  return mapWithConcurrency(papers, 2, async paper => {
    const preferredDoi = preferredPaperDoi(paper);
    const doiChanged = preferredDoi !== normalizeDoi(paper?.doi);
    const record = completePaperRecord({ ...paper, doi: preferredDoi });
    const shouldRefreshKnownDoi = record.retrievalSource === "webofscience" && datePrecision(record.published) !== "day";
    if (record.doi && !shouldRefreshKnownDoi && !/\.\.\.|…/.test(record.title) && !doiChanged) return record;
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
  });
}

function normalizeExternalPublishedDate(value) {
  const clean = compactText(value);
  if (/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$/.test(clean)) return clean;
  const iso = clean.match(/\b((?:19|20)\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function extractHtmlPublishedDate(html) {
  const text = String(html || "");
  const metaDate = htmlMetaContent(text, [
    "citation_publication_date",
    "citation_online_date",
    "article:published_time",
    "prism.publicationDate",
    "dc.date",
    "date"
  ]);
  const jsonLdDate = text.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)?.[1] || "";
  return normalizeExternalPublishedDate(metaDate || jsonLdDate);
}

async function enrichPapersWithPublisherDates(papers, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const errors = Array.isArray(options.errors) ? options.errors : null;
  return mapWithConcurrency(papers, 2, async paper => {
    const record = completePaperRecord(paper);
    if (record.retrievalSource !== "webofscience" || !record.doi || datePrecision(record.published) === "day") return record;
    try {
      const response = await fetchImpl(`https://doi.org/${record.doi}`, {
        headers: { "User-Agent": "paperHOT/0.1 (mailto:local@example.invalid)", Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`出版社日期补全失败：HTTP ${response.status}`);
      const published = mostPrecisePublishedDate([record.published, extractHtmlPublishedDate(await response.text())]);
      return completePaperRecord({ ...record, published, publishedPrecision: datePrecision(published) });
    } catch (error) {
      if (errors) errors.push({ source: "publisher", message: error.message, paper: summarizePaperForOperationLog(record) });
      return record;
    }
  });
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
  if (!config.enabled || !config.endpoint || !config.model) return null;
  if (config.apiMode === "local") throw new Error("本地 CLI 模型暂不支持网页连通性测试");

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
    signal: AbortSignal.timeout(60000)
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

async function callConfiguredLlmWithSelectedPoolModel({
  paper,
  userBackground,
  config,
  fetchImpl,
  dataDir,
  pool,
  providerId = "",
  selected,
  attempted
}) {
  const selectedConfig = { ...config, model: selected.model };

  try {
    const insight = await callConfiguredLlm({ paper, userBackground, config: selectedConfig, fetchImpl });
    const usage = insight?.tokenUsage || {};
    await queueLlmModelPoolStateUpdate(dataDir, async () => {
      const state = await readLlmModelPoolState(dataDir);
      const current = llmModelPoolStateEntryForModel(state, providerId, selected.model);
      const entry = cleanLlmModelPoolStateEntry({
        ...current,
        model: selected.model,
        status: "available",
        localUsedTokens: Number(current.localUsedTokens || 0) + Number(usage.total || 0),
        consecutiveFailures: 0,
        lastSuccessAt: new Date().toISOString()
      });
      if (entry.localUsedTokens >= selected.freeQuotaTokens * pool.quotaSwitchRatio) entry.status = "near_limit";
      setLlmModelPoolActiveModel(state, providerId, selected.model);
      setLlmModelPoolStateEntry(state, providerId, selected.model, entry);
      await writeLlmModelPoolState(state, dataDir);
    });
    return insight;
  } catch (error) {
    if (!isRetryableLlmModelFailure(error)) throw error;
    const next = await queueLlmModelPoolStateUpdate(dataDir, async () => {
      const state = await readLlmModelPoolState(dataDir);
      const current = llmModelPoolStateEntryForModel(state, providerId, selected.model);
      const failureAt = new Date().toISOString();
      const entry = cleanLlmModelPoolStateEntry({
        ...current,
        model: selected.model,
        consecutiveFailures: Number(current.consecutiveFailures || 0) + 1,
        lastFailureAt: failureAt,
        lastFailureMessage: error.message
      });
      const failureThreshold = Number(pool.failureSwitchThreshold || DEFAULT_ALIYUN_MODEL_POOL.failureSwitchThreshold);
      setLlmModelPoolStateEntry(state, providerId, selected.model, entry);
      if (entry.consecutiveFailures < failureThreshold) {
        await writeLlmModelPoolState(state, dataDir);
        return null;
      }

      entry.status = "failing";
      attempted.add(selected.model);
      setLlmModelPoolStateEntry(state, providerId, selected.model, entry);
      const nextModel = selectLlmPoolModel({ pool, state, attempted, providerId });
      if (nextModel && nextModel.model !== selected.model) {
        const previousModel = compactText(llmModelPoolActiveModel(state, providerId) || selected.model);
        entry.lastSwitchAt = failureAt;
        entry.lastSwitchReason = "repeated-failure";
        setLlmModelPoolStateEntry(state, providerId, selected.model, entry);
        setLlmModelPoolActiveModel(state, providerId, nextModel.model);
        await writeLlmModelPoolState(state, dataDir);
        if (previousModel && previousModel !== nextModel.model) {
          const previousPoolModel = cleanLlmModelPool(pool).models.find(model => model.model === previousModel);
          const previousState = llmModelPoolStateEntryForModel(state, providerId, previousModel);
          await appendOperationLogSafe({
            action: "modify",
            operation: "llm-model-switch",
            fromModel: previousModel,
            toModel: nextModel.model,
            reason: "repeated-failure",
            localUsedTokens: Number(previousState.localUsedTokens || 0),
            freeQuotaTokens: previousPoolModel?.freeQuotaTokens || nextModel.freeQuotaTokens,
            officialQuotaStatus: previousState.officialQuotaStatus || "unavailable"
          }, dataDir);
        }
        return nextModel;
      }
      await writeLlmModelPoolState(state, dataDir);
      return null;
    });
    if (!next) throw error;
    return callConfiguredLlmWithSelectedPoolModel({
      paper,
      userBackground,
      config,
      fetchImpl,
      dataDir,
      pool,
      providerId,
      selected: next,
      attempted
    });
  }
}

async function callConfiguredLlmWithPool({ paper, userBackground, config, fetchImpl, dataDir = DATA_DIR }) {
  const pool = activeProviderModelPool(config);
  if (!pool) return callConfiguredLlm({ paper, userBackground, config, fetchImpl });
  const cleanPool = cleanLlmModelPool(pool);
  const providerId = activeProviderIdForModelPool(config);
  const attempted = new Set();
  const selected = await queueLlmModelPoolStateUpdate(dataDir, async () => {
    const state = await readLlmModelPoolState(dataDir);
    const selectedModel = selectLlmPoolModel({ pool: cleanPool, state, attempted, providerId });
    if (!selectedModel) throw new Error("LLM 模型池中没有可用模型，请重置状态或启用其他模型");
    const previousModel = compactText(llmModelPoolActiveModel(state, providerId) || config.model);
    if (llmModelPoolActiveModel(state, providerId) !== selectedModel.model) {
      setLlmModelPoolActiveModel(state, providerId, selectedModel.model);
      await writeLlmModelPoolState(state, dataDir);
    }
    if (previousModel && previousModel !== selectedModel.model) {
      const previousPoolModel = cleanPool.models.find(model => model.model === previousModel);
      const previousState = llmModelPoolStateEntryForModel(state, providerId, previousModel);
      const previousThreshold = Number(previousPoolModel?.freeQuotaTokens || 1000000) * Number(cleanPool.quotaSwitchRatio || DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio);
      const switchReason = previousState.status === "near_limit" || Number(previousState.localUsedTokens || 0) >= previousThreshold
        ? "quota-threshold"
        : "manual";
      await appendOperationLogSafe({
        action: "modify",
        operation: "llm-model-switch",
        fromModel: previousModel,
        toModel: selectedModel.model,
        reason: switchReason,
        localUsedTokens: Number(previousState.localUsedTokens || 0),
        freeQuotaTokens: previousPoolModel?.freeQuotaTokens || selectedModel.freeQuotaTokens,
        officialQuotaStatus: previousState.officialQuotaStatus || "unavailable"
      }, dataDir);
    }
    return selectedModel;
  });
  return callConfiguredLlmWithSelectedPoolModel({
    paper,
    userBackground,
    config,
    fetchImpl,
    dataDir,
    pool: cleanPool,
    providerId,
    selected,
    attempted
  });
}

async function testLlmConfig(payload = {}, options = {}) {
  const previous = await readLlmConfig(options.configFile);
  const config = mergeLlmConfig(previous, payload.llm || payload);
  if (!config.enabled) throw new Error("LLM 未启用，请先打开右侧开关");
  if (!config.endpoint) throw new Error("LLM Endpoint 未填写");
  if (!config.model) throw new Error("LLM 模型未填写");
  if (!config.apiKey && config.apiMode !== "local") throw new Error("LLM API 密钥未填写");
  const insight = await callConfiguredLlmWithPool({
    paper: {
      title: "Structured illumination microscopy connectivity test",
      summary: "This is a short connection test for structured illumination microscopy paper summarization.",
      reason: "连接测试",
      journal: "paperHOT test",
      doi: ""
    },
    userBackground: config.userBackground || DEFAULT_USER_BACKGROUND,
    config,
    fetchImpl: options.fetchImpl || fetch,
    dataDir: options.dataDir || DATA_DIR
  });
  const usage = insight?.tokenUsage || defaultTokenUsage();
  await appendOperationLogSafe({
    action: "test",
    operation: "llm-config-test",
    provider: config.provider,
    model: config.model,
    llm: summarizeLlmLog([{
      model: usage.model || config.model || "未记录模型",
      prompt: Number(usage.prompt || 0),
      completion: Number(usage.completion || 0),
      total: Number(usage.total || Number(usage.prompt || 0) + Number(usage.completion || 0))
    }])
  }, options.dataDir || DATA_DIR);
  return {
    ok: true,
    provider: config.provider,
    model: config.model,
    endpoint: llmChatCompletionsUrl(config.endpoint),
    abstractZh: compactText(insight?.abstractZh || insight?.summary || ""),
    llmSummary: compactText(insight?.llmSummary || ""),
    reason: compactText(insight?.reason || ""),
    tokenUsage: usage
  };
}

async function testFirecrawlConfig(payload = {}, options = {}) {
  const previous = await readFirecrawlConfig(options.configFile);
  const config = mergeSecretConfig(previous, payload.firecrawl || payload, cleanFirecrawlConfig);
  if (!config.endpoint) throw new Error("Firecrawl Endpoint 未填写");
  if (!config.apiKey) throw new Error("Firecrawl API Key 未填写，请重新粘贴有效 Key");
  const usage = await readFirecrawlCreditUsage(config, options.fetchImpl || fetch);
  if (usage.status !== "ok") {
    if (usage.httpStatus === 401) throw new Error("Firecrawl API Key 无效或已失效（HTTP 401）");
    if (usage.httpStatus === 429) throw new Error("Firecrawl 请求过于频繁（HTTP 429），请稍后重试");
    throw new Error(`Firecrawl 连接失败${usage.httpStatus ? `（HTTP ${usage.httpStatus}）` : ""}`);
  }
  return { ok: true, usage };
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
  return mapWithConcurrency(papers, 2, async paper => {
    if (options.requireAbstractConsensus && !paperHasConfirmedAbstract(paper)) return paper;
    try {
      const insight = fetcher
        ? await fetcher({ paper, userBackground })
        : await callConfiguredLlmWithPool({ paper, userBackground, config, fetchImpl, dataDir: options.dataDir || DATA_DIR });
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
  });
}
async function fetchGoogleScholarPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const config = options.config || await readGoogleScholarConfig(options.configFile);
  if (!config.enabled || !config.endpoint) {
    throw new Error("Google Scholar 信源未配置：请填写 config/google-scholar.json 后再启用");
  }

  const request = config.request || {};
  const url = new URL(config.endpoint);
  url.searchParams.set(request.queryName || "q", options.queryExpression || buildSemanticScholarQuery(keywords));
  url.searchParams.set("num", String(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num));
  if (options.searchMode !== "exact" && /^\d{4}/.test(options.startDate || "")) {
    url.searchParams.set("as_ylo", options.startDate.slice(0, 4));
  }
  if (options.searchMode !== "exact" && /^\d{4}/.test(options.endDate || "")) {
    url.searchParams.set("as_yhi", options.endDate.slice(0, 4));
  }
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
  const discoveryCursorMode = options.searchMode === "exact" || typeof options.onPageComplete === "function";
  const cursorKey = googleRollingCursorKey({ sourceLabel: "Google Scholar", keywords, config, num });
  const manualStart = googleManualStart(options);
  const start = discoveryCursorMode
    ? (clampPositiveInteger(options.startPage, 1, 1, 1000000) - 1) * num
    : (manualStart === null ? await readGoogleRollingStart({ dataDir: options.dataDir || DATA_DIR, config, key: cursorKey }) : manualStart);
  const result = await fetchSerpApiPages(url, {
    request,
    headers,
    fetchImpl,
    sourceLabel: "Google Scholar",
    maxPages,
    start,
    num,
    onProgress: options.onProgress,
    onPageComplete: options.onPageComplete,
    skipBlockedPages: !discoveryCursorMode && config.rollingFetch === true
  });
  if (!discoveryCursorMode) {
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
  }
  const pages = result.pages;
  const items = pages.flatMap(payload => {
    const pageItems = getNestedValue(payload, config.responseMap.items);
    return Array.isArray(pageItems) ? pageItems : [];
  });
  if (!items.length) return [];
  const papers = items.map(item => normalizeGoogleScholarPaper(item, keywords, config.responseMap));
  return options.searchMode === "exact" ? papers : filterPapersByKeywords(papers, keywords);
}

async function fetchGoogleSearchPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const config = options.config || await readGoogleScholarConfig(options.configFile);
  if (!config.enabled || !config.endpoint) {
    throw new Error("Google 搜索信源未配置：请填写 config/google-scholar.json 的 SerpApi 配置后再启用");
  }

  const request = config.request || {};
  const url = new URL(config.endpoint);
  url.searchParams.set("engine", "google");
  url.searchParams.set(request.queryName || "q", options.queryExpression || buildSemanticScholarQuery(keywords));
  url.searchParams.set("num", String(config.num || DEFAULT_GOOGLE_SCHOLAR_CONFIG.num));
  if (options.searchMode !== "exact" && /^\d{4}-\d{2}-\d{2}$/.test(options.startDate || "") && /^\d{4}-\d{2}-\d{2}$/.test(options.endDate || "")) {
    const [startYear, startMonth, startDay] = options.startDate.split("-");
    const [endYear, endMonth, endDay] = options.endDate.split("-");
    url.searchParams.set("tbs", `cdr:1,cd_min:${startMonth}/${startDay}/${startYear},cd_max:${endMonth}/${endDay}/${endYear}`);
  }
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
  const discoveryCursorMode = options.searchMode === "exact" || typeof options.onPageComplete === "function";
  const cursorKey = googleRollingCursorKey({ sourceLabel: "Google 搜索", keywords, config, num });
  const manualStart = googleManualStart(options);
  const start = discoveryCursorMode
    ? (clampPositiveInteger(options.startPage, 1, 1, 1000000) - 1) * num
    : (manualStart === null ? await readGoogleRollingStart({ dataDir: options.dataDir || DATA_DIR, config, key: cursorKey }) : manualStart);
  const result = await fetchSerpApiPages(url, {
    request,
    headers,
    fetchImpl,
    sourceLabel: "Google 搜索",
    maxPages,
    start,
    num,
    onProgress: options.onProgress,
    onPageComplete: options.onPageComplete,
    skipBlockedPages: !discoveryCursorMode && config.rollingFetch === true
  });
  if (!discoveryCursorMode) {
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
  }
  const pages = result.pages;
  const items = pages.flatMap(payload => {
    const pageItems = getNestedValue(payload, responseMap.items);
    return Array.isArray(pageItems) ? pageItems : [];
  });
  if (!items.length) return [];
  const papers = items.map(item => normalizeGoogleSearchPaper(item, keywords, responseMap));
  return options.searchMode === "exact" ? papers : filterPapersByKeywords(papers, keywords);
}

function webOfScienceQueryTerm(keyword) {
  return `"${compactText(keyword).replace(/"/g, "")}"`;
}

function buildWebOfScienceQuery(keywords = DEFAULT_KEYWORDS, template = DEFAULT_WEB_OF_SCIENCE_CONFIG.queryTemplate, searchLogic) {
  const clean = cleanKeywords(keywords);
  let clauses = clean.map(webOfScienceQueryTerm);
  if (searchLogic && typeof searchLogic === "object") {
    const connected = new Set((searchLogic.andEdges || []).flat());
    clauses = searchLogicGroups(searchLogic)
      .map(group => `(${group.map(webOfScienceQueryTerm).join(" AND ")})`);
    for (const keyword of searchLogic.activeKeywords || []) {
      if (!connected.has(keyword)) clauses.push(webOfScienceQueryTerm(keyword));
    }
  }
  const query = clauses.join(" OR ") || webOfScienceQueryTerm("computational microscopy reconstruction");
  return String(template || "{query}").replace("{query}", query);
}

function emitWebOfSciencePageProgress(onProgress, { page, pageSize, maxPages }) {
  if (typeof onProgress !== "function") return;
  const itemStart = ((page - 1) * pageSize) + 1;
  const itemEnd = page * pageSize;
  onProgress({
    stage: "source-page",
    percent: Math.min(18, 8 + Math.round((page / Math.max(1, maxPages)) * 10)),
    message: `Web of Science 第 ${page} 页正在抓取`,
    detail: `正在抓第 ${page} 页，第 ${itemStart}-${itemEnd} 篇`,
    sourcePage: {
      sourceLabel: "Web of Science",
      page,
      maxPages,
      start: itemStart,
      num: pageSize,
      itemStart,
      itemEnd
    }
  });
}

async function fetchWebOfSciencePapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const config = options.config || await readWebOfScienceConfig(options.configFile);
  if (!config.enabled) {
    throw new Error("Web of Science API 已关闭：请在领域配置中启用 Web of Science API");
  }
  if (!config.endpoint || !config.apiKey) {
    throw new Error("Web of Science 信源未配置：请填写 config/web-of-science.json 后再启用");
  }

  const request = config.request || {};
  const fetchImpl = options.fetchImpl || fetch;
  const headers = { Accept: "application/json" };
  if (request.useApiKeyHeader !== false && request.apiKeyHeader && config.apiKey) {
    headers[request.apiKeyHeader] = `${request.apiKeyPrefix || ""}${config.apiKey}`;
  }
  const query = compactText(options.rawQuery)
    || buildWebOfScienceQuery(keywords, config.queryTemplate, options.searchLogic);
  const maxPages = clampPositiveInteger(options.maxPages || config.maxPages, DEFAULT_WEB_OF_SCIENCE_CONFIG.maxPages, 1, WEB_OF_SCIENCE_MAX_PAGES_LIMIT);
  const pageSize = clampPositiveInteger(options.pageSize || config.pageSize, DEFAULT_WEB_OF_SCIENCE_CONFIG.pageSize, 1, WEB_OF_SCIENCE_PAGE_SIZE_LIMIT);
  const firstPage = clampPositiveInteger(options.startPage, 1, 1, 1000000);
  const dataDir = options.dataDir || DATA_DIR;
  const pages = [];

  for (let page = firstPage; page < firstPage + maxPages; page += 1) {
    const url = new URL(config.endpoint);
    url.searchParams.set(request.queryName || "q", query);
    url.searchParams.set(request.databaseQueryName || "db", config.databaseId || DEFAULT_WEB_OF_SCIENCE_CONFIG.databaseId);
    url.searchParams.set(request.pageQueryName || "page", String(page));
    url.searchParams.set(request.limitQueryName || "limit", String(pageSize));
    if (options.searchMode !== "exact" && options.startDate && options.endDate) {
      url.searchParams.set("modifiedTimeSpan", `${options.startDate}+${options.endDate}`);
      url.searchParams.set("sortField", "LD+D");
    }
    if (request.apiKeyQueryName && config.apiKey) url.searchParams.set(request.apiKeyQueryName, config.apiKey);
    emitWebOfSciencePageProgress(options.onProgress, { page, pageSize, maxPages });
    let response;
    try {
      response = await fetchImpl(url, {
        method: request.method || "GET",
        headers,
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Web of Science 信源失败：HTTP ${response.status}`);
    } catch (error) {
      await recordWebOfScienceRequest({ status: "failed" }, dataDir);
      throw error;
    }
    await recordWebOfScienceRequest({ status: "ok" }, dataDir);
    const payload = typeof response.json === "function" ? await response.json() : JSON.parse(await response.text());
    pages.push(payload);
    const items = getNestedValue(payload, config.responseMap.items);
    const returned = Array.isArray(items) ? items.length : 0;
    const complete = returned < pageSize;
    await options.onPageComplete?.({ page, nextPage: page + 1, returned, complete });
    if (complete) break;
  }

  const items = pages.flatMap(payload => {
    const pageItems = getNestedValue(payload, config.responseMap.items);
    return Array.isArray(pageItems) ? pageItems : [];
  });
  if (!items.length) return [];
  const papers = items.map(item => normalizeWebOfScienceRecord(item, keywords, config.responseMap));
  return options.searchMode === "exact" ? papers : filterPapersByKeywords(papers, keywords);
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

async function fetchOpenAlexPapers(keywords = DEFAULT_KEYWORDS, options = {}) {
  const { config, fetchImpl, headers } = await openAlexRequestOptions(options);
  if (!config.enabled || !config.endpoint || !config.apiKey) {
    throw new Error("OpenAlex 信源未配置：请在领域配置中填写 API Key 后再启用");
  }
  const firstPage = clampPositiveInteger(options.startPage, 1, 1, 1000000);
  const maxPages = clampPositiveInteger(options.maxPages || config.maxPages, DEFAULT_OPENALEX_CONFIG.maxPages, 1, OPENALEX_MAX_PAGES_LIMIT);
  const perPage = clampPositiveInteger(options.perPage || config.perPage, DEFAULT_OPENALEX_CONFIG.perPage, 1, OPENALEX_PER_PAGE_LIMIT);
  const papers = [];
  for (let page = firstPage; page < firstPage + maxPages; page += 1) {
    const url = new URL(options.doi ? openAlexWorkUrl(config.endpoint, options.doi) : config.endpoint);
    url.searchParams.set("api_key", config.apiKey);
    if (!options.doi) {
      url.searchParams.set("search", compactText(options.queryExpression) || buildSearchExpression(options.searchLogic) || buildSemanticScholarQuery(keywords));
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      if (options.searchMode !== "exact" && options.startDate && options.endDate) {
        url.searchParams.set("filter", `from_publication_date:${options.startDate},to_publication_date:${options.endDate}`);
      }
    }
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`OpenAlex 信源失败：HTTP ${response.status}`);
    const payload = await response.json();
    const items = options.doi ? [payload] : (Array.isArray(payload?.results) ? payload.results : []);
    papers.push(...items.map(item => normalizeOpenAlexWork(item, keywords)));
    const complete = options.doi || items.length < perPage;
    await options.onPageComplete?.({ page, nextPage: page + 1, returned: items.length, complete });
    if (complete) break;
  }
  return options.searchMode === "exact" ? papers : filterPapersByKeywords(papers, keywords);
}

function applyOpenAlexMetadata(paper, item) {
  if (!item) return completePaperRecord(paper);
  const metadata = normalizeOpenAlexWork(item, []);
  const tags = Array.from(new Set([...(paper.tags || []), ...(metadata.tags || [])])).slice(0, 5);
  const useOpenAlexTitle = !compactText(paper.title) || titleLooksTruncated(paper.title);
  const genericJournal = /^(?:openalex|论文数据库|google 搜索|google scholar|web of science)$/i.test(compactText(paper.journal));
  return completePaperRecord({
    ...paper,
    title: useOpenAlexTitle ? metadata.title : paper.title,
    doi: paper.doi || metadata.doi,
    authors: paper.authors?.length ? paper.authors : metadata.authors,
    journal: !paper.journal || genericJournal ? metadata.journal : paper.journal,
    published: mostPrecisePublishedDate([paper.published, metadata.published]),
    publishedPrecision: datePrecision(mostPrecisePublishedDate([paper.published, metadata.published])),
    summary: isCompleteAbstract(paper.summary) ? paper.summary : (metadata.summary || paper.summary),
    citationCount: paper.citationCount ?? metadata.citationCount,
    citationSource: paper.citationCount === null || paper.citationCount === undefined ? metadata.citationSource : paper.citationSource,
    url: paper.url || metadata.url,
    pdfUrl: paper.pdfUrl || metadata.pdfUrl,
    tags
  });
}

async function enrichPapersWithOpenAlex(papers, options = {}) {
  const config = options.config || await readOpenAlexConfig(options.configFile || options.openAlexConfigFile);
  if (!config.enabled || !config.apiKey) return papers.map(completePaperRecord);
  return mapWithConcurrency(papers, 4, async paper => {
    if (!normalizeDoi(paper?.doi)) return completePaperRecord(paper);
    try {
      return applyOpenAlexMetadata(paper, await fetchOpenAlexWorkByDoi(paper, { ...options, config }));
    } catch (error) {
      options.errors?.push({ source: "openalex", message: error.message, title: paper.title });
      return completePaperRecord(paper);
    }
  });
}

const SOURCE_PRIORITY = { webofscience: 4, googlescholar: 3, openalex: 2, arxiv: 2, biorxiv: 2 };

function hasSameStableIdentity(left, right) {
  const leftDoi = normalizeDoi(left?.doi);
  const rightDoi = normalizeDoi(right?.doi);
  if (leftDoi && rightDoi && leftDoi === rightDoi) return true;
  const leftSource = compactText(left?.retrievalSource).toLowerCase();
  const rightSource = compactText(right?.retrievalSource).toLowerCase();
  const leftSourceId = compactText(left?.sourceId).toLowerCase();
  const rightSourceId = compactText(right?.sourceId).toLowerCase();
  return Boolean(
    leftSource
    && leftSource === rightSource
    && leftSourceId
    && leftSourceId === rightSourceId
  );
}

function normalizedTitleKey(title) {
  return compactText(title).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function samePaperVersion(left, right) {
  if (hasSameStableIdentity(left, right)) return true;
  const leftStage = compactText(left?.publicationStage || "formal").toLowerCase();
  const rightStage = compactText(right?.publicationStage || "formal").toLowerCase();
  if (leftStage !== rightStage) return false;
  const leftTitle = normalizedTitleKey(left?.title);
  return Boolean(
    leftTitle
    && leftTitle === normalizedTitleKey(right?.title)
    && hasMeaningfulAuthorOverlap(left?.authors, right?.authors)
  );
}

function isFormalPreprintPair(left, right) {
  return left.publicationStage !== right.publicationStage
    && [left.publicationStage, right.publicationStage].includes("preprint");
}

function authorIdentities(authors) {
  return (Array.isArray(authors) ? authors : []).map(author => {
    const tokens = compactText(author).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    if (!tokens.length) return null;
    return {
      fullName: tokens.join(""),
      familyName: tokens.length > 1 ? tokens.at(-1) : "",
      givenInitial: tokens.length > 1 ? tokens[0][0] : ""
    };
  }).filter(Boolean);
}

function hasMeaningfulAuthorOverlap(leftAuthors, rightAuthors) {
  return authorIdentities(leftAuthors).some(left => authorIdentities(rightAuthors).some(right => (
    left.fullName === right.fullName
    || Boolean(
      left.familyName
      && left.familyName === right.familyName
      && left.givenInitial
      && left.givenInitial === right.givenInitial
    )
  )));
}

function shouldLinkRelatedVersions(left, right) {
  if (!isFormalPreprintPair(left, right)) return false;
  if (hasSameStableIdentity(left, right)) return true;
  const leftTitle = compactText(left?.title).toLowerCase();
  if (!leftTitle || leftTitle !== compactText(right?.title).toLowerCase()) return false;
  return hasMeaningfulAuthorOverlap(left?.authors, right?.authors);
}

function mergeMissingPaperFields(preferred, fallback) {
  const merged = { ...preferred };
  Object.entries(fallback).forEach(([key, value]) => {
    const current = merged[key];
    if (current === undefined || current === null || current === "" || (Array.isArray(current) && !current.length)) {
      merged[key] = value;
    }
  });
  return completePaperRecord(merged);
}

function linkRelatedVersions(left, right) {
  left.relatedVersions = Array.from(new Set([...(left.relatedVersions || []), right.id].filter(Boolean)));
  right.relatedVersions = Array.from(new Set([...(right.relatedVersions || []), left.id].filter(Boolean)));
}

function dedupePapers(papers) {
  const deduped = [];
  papers.map(completePaperRecord).forEach(paper => {
    const duplicateIndex = deduped.findIndex(existing => (
      existing.publicationStage === paper.publicationStage && samePaperVersion(existing, paper)
    ));
    if (duplicateIndex < 0) {
      deduped.push(paper);
      return;
    }
    const existing = deduped[duplicateIndex];
    const paperHasPriority = (SOURCE_PRIORITY[paper.retrievalSource] || 0) > (SOURCE_PRIORITY[existing.retrievalSource] || 0);
    deduped[duplicateIndex] = paperHasPriority
      ? mergeMissingPaperFields(paper, existing)
      : mergeMissingPaperFields(existing, paper);
  });

  // ponytail: batches are small; index exact identities if quadratic version linking becomes measurable.
  deduped.forEach((paper, index) => {
    deduped.slice(index + 1).forEach(other => {
      if (shouldLinkRelatedVersions(paper, other)) linkRelatedVersions(paper, other);
    });
  });
  return deduped;
}

function refinePaperPool(papers, keywords) {
  return filterPapersByDomainAnchors(filterPapersByKeywords(dedupePapers(papers), keywords), keywords);
}

function filterPapersByDate(papers, date) {
  return papers.filter(paper => dateString(paper.published) === date);
}

function filterPapersByDateRange(papers, startDate, endDate, options = {}) {
  return papers.filter(paper => {
    const range = publicationDateRange(paper.published);
    // Google web results often omit dates; keep them so Crossref/LLM can still surface Nature/Optica pages.
    if (!range && paper.sourceType === "网页搜索" && options.keepUndatedWeb !== false) return true;
    if (!range) return false;
    return (!startDate || range.end >= startDate) && (!endDate || range.start <= endDate);
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
  const recoveredPapers = await recoverGeneratedSummaryPapers(crossrefPapers, {
    ...options,
    errors
  });
  const llmPapers = await enrichPapersWithLlmInsights(recoveredPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    requireAbstractConsensus: true,
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
    papers: rescoredPapers.slice(0, 20).map(summarizePaperForOperationLog),
    llm: summarizeLlmLog(llmLog)
  }, dataDir);
  const llm = summarizeLlmLog(llmLog);
  return {
    ok: true,
    retried: true,
    index: Number(index),
    attemptedCount: retryPapers.length,
    updatedCount: rescoredPapers.length,
    remainingErrors: errors,
    llm,
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
    .map(favorite => archive.papers.find(paper => favoriteMatchesPaper(favorite, paper))
      || (favorite.paper && Object.keys(favorite.paper).length ? favorite.paper : null))
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
      tokenUsage: hasNewLlmInsight
        ? { ...(previous.tokenUsage || {}), ...(paper.tokenUsage || {}) }
        : (previous.tokenUsage || paper.tokenUsage || defaultTokenUsage()),
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
      tokenUsage: hasNewLlmInsight
        ? { ...(previous.tokenUsage || {}), ...(paper.tokenUsage || {}) }
        : (previous.tokenUsage || paper.tokenUsage || defaultTokenUsage()),
      journalMetrics: hasResolvedJournalMetrics(paper.journalMetrics)
        ? { ...(previous.journalMetrics || {}), ...(paper.journalMetrics || {}) }
        : (previous.journalMetrics || paper.journalMetrics || defaultJournalMetrics())
    };
  });

  return sortPapersForDisplay(papers);
}

function paperHasConfirmedAbstract(paper) {
  return paper?.abstractStatus === "confirmed"
    && Array.isArray(paper?.abstractConsensusSources)
    && paper.abstractConsensusSources.length >= 1
    && isCompleteAbstract(paper?.summary);
}

function paperNeedsLlmInsight(paper) {
  if (!paperHasConfirmedAbstract(paper)) return false;
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
  const enrichedPapers = await enrichPapersWithLlmInsights(pendingPapers, { ...options, requireAbstractConsensus: true });
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

// ponytail: serialized only within this process; use an atomic datastore if archive writers become multi-process.
const paperArchiveWriteQueues = new Map();

function queuePaperArchiveUpdate(dataDir, operation) {
  const key = path.resolve(dataDir, PAPER_ARCHIVE_NAME);
  const update = (paperArchiveWriteQueues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(operation);
  paperArchiveWriteQueues.set(key, update);
  update.then(() => {
    if (paperArchiveWriteQueues.get(key) === update) paperArchiveWriteQueues.delete(key);
  }, () => {
    if (paperArchiveWriteQueues.get(key) === update) paperArchiveWriteQueues.delete(key);
  });
  return update;
}

function replacePaperInArchive(target, replacement, dataDir = DATA_DIR) {
  return queuePaperArchiveUpdate(dataDir, async () => {
    const archive = await readPaperArchive(dataDir);
    const index = archive.papers.findIndex(paper => archivePaperMatchesTarget(paper, target));
    if (index < 0) return archive;
    const papers = archive.papers.slice();
    papers[index] = replacement;
    const nextArchive = {
      ...archive,
      mode: "archive",
      updatedAt: new Date().toISOString(),
      count: papers.length,
      papers
    };
    nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
    return nextArchive;
  });
}

async function mergePapersIntoArchive(papers, options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const mergedPapers = options.dedupe === true
    ? mergePaperLists(archive.papers, papers)
    : mergePaperListsAppendOnly(archive.papers, papers);
  // ponytail: local batches are small; index version identities if archive merge profiling shows this scan matters.
  const addedPapers = papers.filter(paper => !archive.papers.some(existing => (
    compactText(existing?.publicationStage || "formal") === compactText(paper?.publicationStage || "formal")
    && samePaperVersion(existing, paper)
  )));
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
  return { ...nextArchive, addedPapers };
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

async function clearUnstarredPaperArchive(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const notes = await readPaperNotesFile(dataDir);
  const papers = archive.papers.filter(paper => notes.notes.some(note => (
    note.starred === true && paperNoteMatchesPaper(note, paper)
  )));
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers
  };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  const result = {
    ok: true,
    beforeCount: archive.papers.length,
    afterCount: papers.length,
    removedCount: archive.papers.length - papers.length,
    preservedStarredCount: papers.length,
    archive: nextArchive,
    papers
  };
  await appendOperationLogSafe({
    action: "delete",
    operation: "archive-clear-unstarred",
    beforeCount: result.beforeCount,
    afterCount: result.afterCount,
    removedCount: result.removedCount,
    preservedStarredCount: result.preservedStarredCount
  }, dataDir);
  return result;
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
    abstractSources: options.abstractSources,
    webOfScience: options.webOfScience,
    dataDir,
    errors
  });
  const [llmPaper] = await enrichPapersWithLlmInsights([paperWithAbstract], {
    ...(options.llm || {}),
    fetcher: options.fetchers?.llm,
    requireAbstractConsensus: true,
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
  const paperDoi = normalizeDoi(paper?.doi);
  const targetDoi = normalizeDoi(target?.doi);
  if (paperDoi && targetDoi) return paperDoi === targetDoi;

  const paperId = compactText(paper?.id).toLowerCase();
  const targetId = compactText(target?.id).toLowerCase();
  if (paperId && targetId && paperId === targetId) return true;

  const paperSource = compactText(paper?.retrievalSource).toLowerCase();
  const targetSource = compactText(target?.retrievalSource).toLowerCase();
  const paperSourceId = compactText(paper?.sourceId).toLowerCase();
  const targetSourceId = compactText(target?.sourceId).toLowerCase();
  if (paperSource && paperSource === targetSource && paperSourceId && paperSourceId === targetSourceId) return true;
  if (paperId || targetId || paperSourceId || targetSourceId) return false;

  const paperStage = compactText(paper?.publicationStage || "formal").toLowerCase();
  const targetStage = compactText(target?.publicationStage || "formal").toLowerCase();
  return paperStage === targetStage
    && Boolean(normalizedTitleKey(paper?.title))
    && normalizedTitleKey(paper?.title) === normalizedTitleKey(target?.title)
    && hasMeaningfulAuthorOverlap(paper?.authors, target?.authors);
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
    requireAbstractConsensus: true,
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
  let paperForLlm = original;
  let activeArchive = archive;
  let abstractUpdated = false;
  let replacementAbstract = "";
  let replacementSource = "";

  if (Object.prototype.hasOwnProperty.call(target, "manualAbstract")) {
    replacementAbstract = cleanAbstractText(target.manualAbstract);
    if (!replacementAbstract || looksLikeTruncatedText(replacementAbstract) || isRobotChallengeText(replacementAbstract)) {
      return {
        ok: true,
        updated: false,
        aiUpdated: false,
        existed: true,
        paper: original,
        archive,
        errors: [{ source: "abstract", message: "手动摘要为空、仍被截断或是机器人验证页面" }],
        llm: summarizeLlmLog([])
      };
    }
    replacementSource = "manual";
  } else if (target.abstractMode === "firecrawl") {
    try {
      const rawCandidate = await fetchFirecrawlAbstractForPaper(original, options.firecrawl || {});
      const candidate = normalizeAbstractCandidate("firecrawl", rawCandidate, original);
      if (candidate) {
        replacementAbstract = candidate.cleanAbstract;
        replacementSource = "firecrawl";
      }
    } catch (error) {
      return {
        ok: true,
        updated: false,
        aiUpdated: false,
        existed: true,
        paper: original,
        archive,
        errors: [{ source: "abstract", message: error.message }],
        llm: summarizeLlmLog([])
      };
    }
    if (!replacementAbstract) {
      return {
        ok: true,
        updated: false,
        aiUpdated: false,
        existed: true,
        paper: original,
        archive,
        errors: [{ source: "abstract", message: "Firecrawl 未获取到通过身份与完整性校验的摘要" }],
        llm: summarizeLlmLog([])
      };
    }
  }

  if (replacementAbstract) {
    paperForLlm = {
      ...original,
      summary: replacementAbstract,
      abstractZh: "",
      llmSummary: "",
      reason: "",
      abstractStatus: "confirmed",
      abstractConsensusSources: [replacementSource],
      tokenUsage: defaultTokenUsage()
    };
    activeArchive = await replacePaperInArchive(original, paperForLlm, dataDir);
    abstractUpdated = true;
    await appendOperationLogSafe({
      action: "modify",
      operation: "archive-abstract-update",
      source: replacementSource,
      paper: summarizePaperForOperationLog(paperForLlm)
    }, dataDir);
  }
  const llmOptions = {
    ...options,
    fetcher: options.fetcher || target.fetcher,
    fetchers: options.fetchers || target.fetchers
  };
  const { enriched, errors, llmLog } = await enrichArchivePapersWithLlm([paperForLlm], llmOptions);
  const llm = summarizeLlmLog(llmLog);
  if (!llm.calls) {
    return {
      ok: true,
      updated: abstractUpdated,
      aiUpdated: false,
      existed: true,
      paper: paperForLlm,
      archive: activeArchive,
      errors,
      llm
    };
  }
  const nextPaper = {
    ...rescorePaperAfterEnrichment(enriched[0] || paperForLlm, options.keywords || []),
    fetchedAt: original.fetchedAt || new Date().toISOString(),
    llmUpdatedAt: new Date().toISOString()
  };
  const nextArchive = await replacePaperInArchive(original, nextPaper, dataDir);
  await appendOperationLogSafe({
    action: "modify",
    operation: "archive-llm-refresh-one",
    updatedCount: 1,
    paper: summarizePaperForOperationLog(nextPaper),
    llm: summarizeLlmLog(llmLog)
  }, dataDir);
  return {
    ok: true,
    updated: true,
    aiUpdated: true,
    existed: true,
    paper: nextPaper,
    archive: nextArchive,
    errors,
    llm
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
  let updatedCount = 0;
  pending.forEach((entry, offset) => {
    const recovered = enriched[offset] || entry.paper;
    const hasLlmInsight = paperHasLlmInsight(recovered);
    const doiChanged = normalizeDoi(recovered.doi) !== normalizeDoi(entry.paper.doi);
    if (!hasLlmInsight && !doiChanged) return;
    papers[entry.index] = hasLlmInsight
      ? {
          ...rescorePaperAfterEnrichment(recovered, options.keywords || []),
          fetchedAt: entry.paper.fetchedAt || new Date().toISOString(),
          llmUpdatedAt: new Date().toISOString()
        }
      : { ...entry.paper, doi: recovered.doi };
    updatedCount += 1;
  });
  const nextArchive = {
    ...archive,
    mode: "archive",
    updatedAt: new Date().toISOString(),
    count: papers.length,
    papers
  };
  if (updatedCount) {
    nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
    await appendOperationLogSafe({
      action: "modify",
      operation: "archive-llm-refresh-missing",
      updatedCount,
      skippedCount: archive.papers.length - pending.length,
      paperCount: papers.length,
      papers: pending
        .filter(entry => papers[entry.index] !== archive.papers[entry.index])
        .slice(0, 20)
        .map(entry => summarizePaperForOperationLog(papers[entry.index])),
      llm: summarizeLlmLog(llmLog)
    }, dataDir);
  }
  const llm = summarizeLlmLog(llmLog);
  return {
    ok: true,
    updatedCount,
    failedCount: pending.length - updatedCount,
    skippedCount: archive.papers.length - pending.length,
    archive: updatedCount ? nextArchive : archive,
    papers,
    errors,
    llm
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

function addTokenLogUsage(bucket, usage = {}) {
  const prompt = Number(usage.prompt || 0);
  const completion = Number(usage.completion || 0);
  const total = Number(usage.total || usage.totalTokens || prompt + completion);
  bucket.prompt += prompt;
  bucket.completion += completion;
  bucket.total += total;
  bucket.papers += Number(usage.calls || (total > 0 ? 1 : 0));
}

function summarizeLlmLog(llmLog = []) {
  const byModel = new Map();
  let totalTokens = 0;
  llmLog.forEach(entry => {
    const model = entry.model || "未记录模型";
    const prompt = Number(entry.prompt || 0);
    const completion = Number(entry.completion || 0);
    const total = Number(entry.total || prompt + completion);
    if (total <= 0) return;
    const current = byModel.get(model) || { model, calls: 0, prompt: 0, completion: 0, total: 0 };
    current.calls += 1;
    current.prompt += prompt;
    current.completion += completion;
    current.total += total;
    byModel.set(model, current);
    totalTokens += total;
  });
  return {
    models: Array.from(byModel.values()),
    calls: llmLog.length,
    totalTokens
  };
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
  const loggedDates = new Set();
  const loggedPaperKeys = new Set();

  const recordLogUsage = (entry, index, source = "log") => {
    const date = dateString(entry?.at || entry?.fetchedAt || entry?.createdAt);
    if (!date || date < start30 || date > today) return;
    const models = Array.isArray(entry?.llm?.models) ? entry.llm.models : [];
    models.forEach((usage, modelIndex) => {
      const total = Number(usage.total || usage.totalTokens || Number(usage.prompt || 0) + Number(usage.completion || 0));
      if (total <= 0) return;
      loggedDates.add(date);
      const key = `${source}:${index}:${modelIndex}`;
      if (countedKeys.has(key)) return;
      countedKeys.add(key);
      const dayBucket = dailyMap.get(date) || { date, ...emptyTokenBucket() };
      addTokenLogUsage(dayBucket, usage);
      addTokenLogUsage(last30DaysBucket, usage);
      if (date >= start7) addTokenLogUsage(last7DaysBucket, usage);
      if (date === today) addTokenLogUsage(todayBucket, usage);
      const model = usage.model || "未记录模型";
      const modelBucket = modelMap.get(model) || { model, ...emptyTokenBucket() };
      addTokenLogUsage(modelBucket, usage);
      modelMap.set(model, modelBucket);
      dailyMap.set(date, dayBucket);
    });
    if (source === "operation-log" && models.some(usage => Number(usage.total || usage.totalTokens || Number(usage.prompt || 0) + Number(usage.completion || 0)) > 0)) {
      paperFlexibleLookupKeys(entry?.paper || {}).forEach(key => loggedPaperKeys.add(key));
      (Array.isArray(entry?.papers) ? entry.papers : []).forEach(paper => {
        paperFlexibleLookupKeys(paper).forEach(key => loggedPaperKeys.add(key));
      });
    }
  };

  const recordPaperUsage = (paper, date, fallbackKey, options = {}) => {
    if (!date || date < start30 || date > today) return;
    if (!options.allowLoggedDate && loggedDates.has(date)) return;
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

  const recordArchivePaperUsage = (paper, index) => {
    const usage = paper.tokenUsage || {};
    const hasLlmUpdateFallback = Boolean(paper?.llmUpdatedAt)
      && Number(usage.total || Number(usage.prompt || 0) + Number(usage.completion || 0)) > 0
      && !paperFlexibleLookupKeys(paper).some(key => loggedPaperKeys.has(key));
    if (hasLlmUpdateFallback) {
      recordPaperUsage(paper, dateString(paper.llmUpdatedAt), `${PAPER_ARCHIVE_NAME}:llmUpdatedAt:${index}`, { allowLoggedDate: true });
      return;
    }
    recordPaperUsage(paper, paperTokenStatsDate(paper), `${PAPER_ARCHIVE_NAME}:${index}`);
  };

  try {
    const files = await fs.readdir(dataDir);
    try {
      const fetchLogPayload = JSON.parse(await fs.readFile(path.join(dataDir, FETCH_LOG_NAME), "utf8"));
      const entries = Array.isArray(fetchLogPayload.entries) ? fetchLogPayload.entries : [];
      entries.forEach((entry, index) => recordLogUsage(entry, index, "fetch-log"));
    } catch {
      // Older installs may not have fetch logs yet; fall back to paper tokenUsage below.
    }

    try {
      const operationLogEntries = await readOperationLog(dataDir);
      operationLogEntries.forEach((entry, index) => recordLogUsage(entry, index, "operation-log"));
    } catch {
      // Operation log is optional for fresh installs.
    }

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
      archivePapers.forEach(recordArchivePaperUsage);
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
  const llmModelPool = await readLlmModelPoolStatus({ dataDir });

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    today: todayBucket,
    last7Days: last7DaysBucket,
    last30Days: last30DaysBucket,
    byModel,
    daily,
    llmModelPool
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

function buildDiscoveryTaskContext(options = {}) {
  const date = options.date || todayString();
  const mode = options.mode || "today";
  const endDate = options.endDate || date;
  // “最近”模式默认抓取 2026-05-01 至今；“近 7 天”模式抓取今天往前 6 天。
  const startDate = options.startDate || (mode === "recent" ? RECENT_RANGE_START : (mode === "last7" ? shiftDate(date, -6) : date));
  const searchLogicKeywords = cleanKeywords(options.searchLogic?.activeKeywords);
  const keywords = cleanKeywords(options.keywords).length
    ? cleanKeywords(options.keywords)
    : (searchLogicKeywords.length ? searchLogicKeywords : DEFAULT_KEYWORDS);
  const searchMode = options.searchMode === "exact" ? "exact" : "direction";
  const searchLogic = options.searchLogic && typeof options.searchLogic === "object"
    ? options.searchLogic
    : { activeKeywords: keywords, andEdges: [] };
  const queryExpression = compactText(options.queryExpression)
    || buildSearchExpression(searchLogic)
    || keywords.join(" OR ");
  const exactInput = searchMode === "exact"
    ? detectExactPaperInput(options.exactInput || queryExpression)
    : null;
  const requestedSources = parseEnabledSources(options.sources || []);
  let sources = requestedSources.length ? requestedSources : ["arxiv", "biorxiv", "semanticscholar"];
  if (exactInput) {
    const allowedSources = {
      doi: ["webofscience", "googlescholar", "googlesearch", "openalex"],
      "wos-ut": ["webofscience"],
      arxiv: ["arxiv"],
      url: ["googlescholar", "googlesearch", "openalex"],
      title: ["googlescholar", "googlesearch", "openalex"]
    }[exactInput.type] || [];
    sources = sources.filter(source => allowedSources.includes(source));
  }
  const dataDir = options.dataDir || DATA_DIR;
  const task = {
    searchMode,
    queryExpression,
    startDate: mode === "today" ? date : startDate,
    endDate,
    sources,
    sourcePages: {}
  };
  task.fingerprint = buildDiscoveryTaskFingerprint(task);
  const resumeMode = ["resume", "restart", "new"].includes(options.resumeMode) ? options.resumeMode : "new";
  return {
    date,
    mode,
    endDate,
    startDate,
    keywords,
    searchMode,
    searchLogic,
    queryExpression,
    exactInput,
    sources,
    dataDir,
    task,
    resumeMode
  };
}

function buildDiscoveryTaskDescriptor(options = {}) {
  const { task } = buildDiscoveryTaskContext(options);
  return {
    taskFingerprint: task.fingerprint,
    resumable: false,
    sourcePages: {},
    sourceResults: [],
    errors: []
  };
}

async function readDiscoveryTaskState(options = {}) {
  const { task, dataDir } = buildDiscoveryTaskContext(options);
  const data = await queueRecentFetchCursorUpdate(dataDir, () => readRecentFetchCursors(dataDir));
  const sourcePages = { ...(data.tasks[task.fingerprint]?.sourcePages || {}) };
  return {
    taskFingerprint: task.fingerprint,
    resumable: Object.values(sourcePages).some(page => page?.complete !== true),
    sourcePages,
    sourceResults: [],
    errors: []
  };
}

// ponytail: serialized only within this process; use a distributed lock if refresh workers become multi-process.
const discoveryFetchQueues = new Map();

function queueDiscoveryFetch(context, operation) {
  const key = `${path.resolve(context.dataDir, RECENT_FETCH_CURSORS_NAME)}::${context.task.fingerprint}`;
  const run = (discoveryFetchQueues.get(key) || Promise.resolve())
    .catch(() => {})
    .then(operation);
  discoveryFetchQueues.set(key, run);
  run.then(() => {
    if (discoveryFetchQueues.get(key) === run) discoveryFetchQueues.delete(key);
  }, () => {
    if (discoveryFetchQueues.get(key) === run) discoveryFetchQueues.delete(key);
  });
  return run;
}

function discoveryTaskProgressState(task, apiCalls = [], errors = []) {
  return {
    taskFingerprint: task.fingerprint,
    resumable: Object.values(task.sourcePages).some(page => page?.complete !== true),
    sourcePages: { ...task.sourcePages },
    sourceResults: apiCalls
      .filter(call => call.kind === "source")
      .map(call => ({ source: call.api, status: call.status, returned: call.returned, message: call.message || "" })),
    errors: [...errors]
  };
}

async function fetchPaperPayload(options = {}) {
  const context = buildDiscoveryTaskContext(options);
  return queueDiscoveryFetch(context, () => fetchPaperPayloadQueued(options, context));
}

async function fetchPaperPayloadQueued(options, context) {
  const {
    date,
    mode,
    endDate,
    startDate,
    keywords,
    searchMode,
    searchLogic,
    queryExpression,
    exactInput,
    sources,
    dataDir,
    resumeMode
  } = context;
  const task = { ...context.task, sourcePages: {} };
  const savedTask = resumeMode === "resume"
    ? (await queueRecentFetchCursorUpdate(dataDir, () => readRecentFetchCursors(dataDir))).tasks[task.fingerprint]
    : null;
  if (options.refresh && resumeMode !== "resume") await clearRecentFetchCursor(task.fingerprint, dataDir);
  task.sourcePages = { ...(savedTask?.sourcePages || {}) };
  emitFetchProgress(options, {
    stage: "queued",
    percent: 4,
    message: resumeMode === "resume" ? "已读取同一任务断点" : "已准备从第一页抓取",
    ...discoveryTaskProgressState(task)
  });
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
        abstractSources: options.abstractSources,
        webOfScience: options.webOfScience,
        dataDir,
        errors: []
      });
      const nextArchive = await mergePapersIntoArchive(papers, { dataDir, date, mode, keywords: cachedPayload.keywords || [], sources: cachedPayload.sources || [] });
      return {
        ...cachedPayload,
        task,
        taskFingerprint: task.fingerprint,
        resumable: Object.values(task.sourcePages).some(page => page?.complete !== true),
        sourcePages: task.sourcePages,
        sourceResults: [],
        newPapers: [],
        exactCandidates: [],
        errors: [],
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
  const sourcesWithPageProgress = new Set();
  const progressForSource = source => event => {
    if (event?.stage === "source-page") recordSourcePageProgress(sourcePages, source, event);
    emitFetchProgress(options, event);
  };
  const pageCompleteForSource = source => async progress => {
    const nextPage = Number(progress?.nextPage);
    if (!Number.isFinite(nextPage) || nextPage < 1) return;
    sourcesWithPageProgress.add(source);
    task.sourcePages[source] = {
      nextPage: Math.floor(nextPage),
      complete: progress?.complete === true
    };
    await writeRecentFetchCursor(task, dataDir);
    emitFetchProgress(options, discoveryTaskProgressState(task, apiCalls, errors));
  };
  emitFetchProgress(options, {
    stage: "sources",
    percent: 8,
    message: "正在请求数据源",
    counts: { raw: 0, deduped: 0, keywordMatched: 0, domainMatched: 0, dateMatched: 0, ranked: 0, fetched: 0 },
    sources: []
  });
  const groups = await Promise.all(sources.map(async source => {
    if (task.sourcePages[source]?.complete === true) {
      apiCalls.push({ api: source, label: API_LABELS[source] || source, kind: "source", status: "complete", returned: 0 });
      return [];
    }
    try {
      const startPage = Number(task.sourcePages[source]?.nextPage || 1);
      task.sourcePages[source] = { nextPage: startPage, complete: false };
      await writeRecentFetchCursor(task, dataDir);
      emitFetchProgress(options, discoveryTaskProgressState(task, apiCalls, errors));
      let result;
      const sourceOptions = {
        dataDir,
        queryExpression,
        searchLogic,
        searchMode,
        startPage,
        onPageComplete: pageCompleteForSource(source),
        onProgress: progressForSource(source)
      };
      if (searchMode === "direction") {
        sourceOptions.startDate = task.startDate;
        sourceOptions.endDate = endDate;
      }
      if (exactInput?.type === "title" && ["googlescholar", "googlesearch"].includes(source)) {
        sourceOptions.queryExpression = `"${exactInput.value.replace(/"/g, "")}"`;
      } else if (exactInput?.type === "url" && ["googlescholar", "googlesearch"].includes(source)) {
        sourceOptions.queryExpression = `"${exactInput.value}"`;
      } else if (source === "webofscience" && exactInput?.type === "wos-ut") {
        sourceOptions.rawQuery = `UT=(${exactInput.value})`;
      } else if (source === "webofscience" && exactInput?.type === "doi") {
        sourceOptions.rawQuery = `DO=(${exactInput.value})`;
      } else if (source === "arxiv" && exactInput?.type === "arxiv") {
        sourceOptions.arxivId = exactInput.value;
      }
      if (source === "arxiv") result = options.fetchers?.arxiv
        ? await options.fetchers.arxiv(sourceOptions)
        : await fetchArxivPapers(keywords, { maxResults: mode === "recent" ? 200 : 50, ...sourceOptions });
      else if (source === "biorxiv") result = options.fetchers?.biorxiv
        ? await options.fetchers.biorxiv(sourceOptions)
        : await fetchBioRxivPapers(date, keywords, sourceOptions);
      else if (source === "semanticscholar") result = options.fetchers?.semanticscholar
        ? await options.fetchers.semanticscholar(sourceOptions)
        : await fetchSemanticScholarPapers(keywords, { ...sourceOptions, limit: 100 });
      else if (source === "openalex") result = options.fetchers?.openalex
        ? await options.fetchers.openalex(sourceOptions)
        : await fetchOpenAlexPapers(keywords, {
            ...(options.openAlex || {}),
            ...sourceOptions,
            ...(exactInput?.type === "doi" ? { doi: exactInput.value } : {})
          });
      else if (source === "googlescholar") result = options.fetchers?.googlescholar
        ? await options.fetchers.googlescholar(sourceOptions)
        : await fetchGoogleScholarPapers(keywords, { ...(options.googleScholar || {}), ...sourceOptions });
      else if (source === "googlesearch") result = options.fetchers?.googlesearch
        ? await options.fetchers.googlesearch(sourceOptions)
        : await fetchGoogleSearchPapers(keywords, { ...(options.googleScholar || {}), ...sourceOptions });
      else if (source === "webofscience") result = options.fetchers?.webofscience
        ? await options.fetchers.webofscience(sourceOptions)
        : await fetchWebOfSciencePapers(keywords, { ...(options.webOfScience || {}), ...sourceOptions });
      else result = [];
      if (!sourcesWithPageProgress.has(source)) {
        task.sourcePages[source] = {
          nextPage: Number(task.sourcePages[source]?.nextPage || 1),
          complete: true
        };
        await writeRecentFetchCursor(task, dataDir);
      }
      apiCalls.push({ api: source, label: API_LABELS[source] || source, kind: "source", status: "ok", returned: result.length });
      emitFetchProgress(options, {
        stage: "sources",
        percent: 18,
        message: `${API_LABELS[source] || source} 返回 ${result.length} 篇`,
        counts: { raw: apiCalls.reduce((sum, call) => sum + Number(call.returned || 0), 0) },
        sources: apiCalls.filter(call => call.kind === "source"),
        ...discoveryTaskProgressState(task, apiCalls, errors)
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
        ...discoveryTaskProgressState(task, apiCalls, errors)
      });
      return [];
    }
  }));
  if (exactInput?.type === "doi") {
    try {
      const metadata = await fetchCrossrefWorkByDoi(exactInput.value, options.crossref || {});
      if (metadata?.doi) {
        const title = compactText(metadata.title) || exactInput.value;
        const journal = compactText(metadata.journal) || "Crossref";
        groups.push([completePaperRecord({
          id: `crossref-${metadata.doi}`,
          retrievalSource: "crossref",
          sourceId: metadata.doi,
          doi: metadata.doi,
          journal,
          citation: formatCitation({ authors: metadata.authors, year: paperYear(metadata.published), title, journal, doi: metadata.doi }),
          source: `Crossref · ${journal}`,
          sourceType: "论文数据库",
          title,
          summary: "",
          tags: [],
          score: scorePaper(title, keywords),
          reason: makeReason(title, keywords),
          tokenUsage: defaultTokenUsage(),
          journalMetrics: defaultJournalMetrics(),
          url: `https://doi.org/${metadata.doi}`,
          authors: metadata.authors,
          published: metadata.published
        })]);
        apiCalls.push({ api: "crossref", label: API_LABELS.crossref, kind: "source", status: "ok", returned: 1 });
      }
    } catch (error) {
      errors.push({ source: "crossref", message: error.message });
      apiCalls.push({ api: "crossref", label: API_LABELS.crossref, kind: "source", status: "failed", returned: 0, message: error.message });
    }
  }
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
  const closeTitleCandidates = exactInput?.type === "title"
    ? dedupedPapers.filter(paper => titleSimilarity(exactInput.value, paper.title) >= 0.65)
    : [];
  const exactCandidates = closeTitleCandidates.length > 1 ? closeTitleCandidates : [];
  if (exactCandidates.length) {
    const sourceResults = apiCalls
      .filter(call => call.kind === "source")
      .map(call => ({ source: call.api, status: call.status, returned: call.returned, message: call.message || "" }));
    const payload = {
      date,
      startDate: mode === "today" ? date : startDate,
      endDate,
      mode,
      fetchedAt: new Date().toISOString(),
      keywords,
      sources,
      task,
      taskFingerprint: task.fingerprint,
      resumable: Object.values(task.sourcePages).some(page => page?.complete !== true),
      sourcePages: task.sourcePages,
      sourceResults,
      newPapers: [],
      exactCandidates,
      errors,
      fetchedCount: 0,
      count: 0,
      papers: []
    };
    emitFetchProgress(options, {
      stage: "done",
      percent: 100,
      message: `找到 ${exactCandidates.length} 个相近标题，等待确认`,
      counts: { raw: rawPapers.length, deduped: dedupedPapers.length, fetched: 0 },
      sources: apiCalls.filter(call => call.kind === "source"),
      ...discoveryTaskProgressState(task, apiCalls, errors)
    });
    if (sources.every(source => task.sourcePages[source]?.complete === true)) {
      await clearRecentFetchCursor(task.fingerprint, dataDir);
    }
    return payload;
  }
  const searchablePapers = exactInput?.type === "title" && closeTitleCandidates.length === 1
    ? closeTitleCandidates
    : dedupedPapers;
  emitFetchProgress(options, {
    stage: "keyword",
    percent: 40,
    message: `去重后 ${dedupedPapers.length} 篇，正在匹配关键词`,
    counts: { raw: rawPapers.length, deduped: dedupedPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const keywordPapers = searchMode === "exact"
    ? searchablePapers
    : searchablePapers.filter(paper => paperMatchesSearchLogic(paper, searchLogic));
  emitFetchProgress(options, {
    stage: "domain",
    percent: 52,
    message: `关键词命中 ${keywordPapers.length} 篇，正在领域过滤`,
    counts: { raw: rawPapers.length, deduped: dedupedPapers.length, keywordMatched: keywordPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const refinedPapers = searchMode === "exact"
    ? keywordPapers
    : filterPapersByDomainAnchors(keywordPapers, keywords);
  emitFetchProgress(options, {
    stage: "date",
    percent: 64,
    message: `领域过滤后 ${refinedPapers.length} 篇，正在筛选日期`,
    counts: { raw: rawPapers.length, deduped: dedupedPapers.length, keywordMatched: keywordPapers.length, domainMatched: refinedPapers.length },
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const scopedPapers = searchMode === "exact"
    ? refinedPapers
    : (mode === "today" ? filterPapersByDate(refinedPapers, date) : filterPapersByDateRange(refinedPapers, startDate, endDate));
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
  const openAlexPapers = await enrichPapersWithOpenAlex(crossrefPapers, {
    ...(options.openAlex || {}),
    errors
  });
  const publisherDatedPapers = await enrichPapersWithPublisherDates(openAlexPapers, {
    fetchImpl: options.fetchers?.html,
    errors
  });
  const datedCrossrefPapers = searchMode === "exact"
    ? publisherDatedPapers
    : (mode === "today"
      ? filterPapersByDate(publisherDatedPapers, date)
      : filterPapersByDateRange(publisherDatedPapers, startDate, endDate, { keepUndatedWeb: false }));
  pipelineCounts.dateConfirmed = datedCrossrefPapers.length;
  candidateSnapshots.afterDateEnrichment = buildPaperCandidateSnapshot(publisherDatedPapers);
  candidateSnapshots.finalDateMatched = buildPaperCandidateSnapshot(datedCrossrefPapers);
  emitFetchProgress(options, {
    stage: "llm",
    percent: 84,
    message: `元数据补全并确认日期后 ${datedCrossrefPapers.length} 篇，正在生成摘要翻译和推荐理由`,
    counts: pipelineCounts,
    sources: apiCalls.filter(call => call.kind === "source"),
    errors
  });
  const llmPapers = await enrichMissingLlmInsights(datedCrossrefPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    abstractFetcher: options.fetchers?.abstract,
    abstractFetchImpl: options.fetchers?.abstractFetch,
    abstractSources: options.abstractSources,
    webOfScience: options.webOfScience,
    dataDir,
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
  const fetchedPapers = sortPapersForDisplay((await enrichPapersWithJournalMetrics(llmPapers, {
    dataDir,
    ...(options.journalMetrics || {})
  }))
    .map(paper => rescorePaperAfterEnrichment({ ...paper, fetchedAt: new Date().toISOString() }, keywords)));
  const archive = await mergePapersIntoArchive(fetchedPapers, { dataDir, date, mode, keywords, sources });
  const archivedPapers = searchMode === "exact"
    ? fetchedPapers
    : (mode === "today"
      ? filterPapersByDate(archive.papers, date)
      : filterPapersByStrictDateRange(archive.papers, startDate, endDate));
  const enrichedArchivePapers = (await enrichMissingLlmInsights(archivedPapers, {
    ...(options.llm || {}),
    userBackground: options.userBackground,
    fetcher: options.fetchers?.llm,
    abstractFetcher: options.fetchers?.abstract,
    abstractFetchImpl: options.fetchers?.abstractFetch,
    abstractSources: options.abstractSources,
    webOfScience: options.webOfScience,
    dataDir,
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
    abstractSources: options.abstractSources,
    webOfScience: options.webOfScience,
    dataDir,
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
    task,
    taskFingerprint: task.fingerprint,
    resumable: Object.values(task.sourcePages).some(page => page?.complete !== true),
    sourcePages: task.sourcePages,
    sourceResults: apiCalls
      .filter(call => call.kind === "source")
      .map(call => ({ source: call.api, status: call.status, returned: call.returned, message: call.message || "" })),
    newPapers: archive.addedPapers,
    exactCandidates,
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
    ...discoveryTaskProgressState(task, apiCalls, errors)
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
      newFetchedCount: archive.addedPapers.length,
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
  if (sources.every(source => task.sourcePages[source]?.complete === true)) {
    await clearRecentFetchCursor(task.fingerprint, dataDir);
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
  clearUnstarredPaperArchive,
  removeCandidatePaperFromArchive,
  dedupePapers,
  dedupePaperArchive,
  detectExactPaperInput,
  buildTokenStats,
  buildArxivQuery,
  buildDiscoveryTaskFingerprint,
  buildDiscoveryTaskDescriptor,
  buildDiscoveryTaskContext,
  buildSearchExpression,
  abstractMatchText,
  classifyPaper,
  cleanSearchLogic,
  cleanKeywords,
  enrichPapersWithCrossref,
  enrichPapersWithPublisherDates,
  enrichPapersWithJournalMetrics,
  enrichPapersWithLlmInsights,
  enrichTruncatedGoogleTitles,
  exportLocalData,
  exportLocalDataZip,
  fetchArxivPapers,
  fetchCrossrefWorkByDoi,
  fetchCrossrefWorkByTitle,
  fetchFirecrawlAbstractForPaper,
  fetchBioRxivPapers,
  fetchGoogleScholarPapers,
  fetchGoogleSearchPapers,
  fetchJournalMetrics,
  fetchLast7DaysPapers,
  fetchOpenAlexPapers,
  fetchPaperPayload,
  fetchRecentPapers,
  fetchSemanticScholarPapers,
  fetchTodayPapers,
  fetchWebOfSciencePapers,
  recoverGeneratedSummaryPapers,
  googleScholarCitationCount,
  inferPaperShortTitle,
  importLocalData,
  importLocalDataZip,
  parseZipEntries,
  testLlmConfig,
  testFirecrawlConfig,
  filterPapersByDate,
  filterPapersByDateRange,
  filterPapersByKeywords,
  normalizeArxivEntry,
  normalizeBioRxivItem,
  normalizeOpenAlexWork,
  normalizeSemanticScholarPaper,
  normalizeWebOfScienceRecord,
  parseArxivEntries,
  parseEnabledSources,
  paperMatchesSearchLogic,
  readFetchLog,
  readFirecrawlConfig,
  readFavoritesPayload,
  readGoogleRollingCursorStatus,
  readDiscoveryTaskState,
  readRecentFetchCursors,
  readWebOfScienceUsage,
  readPaperNotesPayload,
  readOperationLog,
  readArchivePayload,
  appendFetchLog,
  appendOperationLog,
  readIntegrationConfigs,
  readIntegrationSecrets,
  readAcademicApisConfig,
  readJournalMetricsConfig,
  readJournalMetricsCache,
  readLlmConfig,
  readAliyunTextModelRegistry,
  cleanAliyunTextModelRegistryEntry,
  cleanLlmModelPool,
  modelPoolStatusForModel,
  selectLlmPoolModel,
  isRetryableLlmModelFailure,
  callConfiguredLlmWithPool,
  readLlmModelPoolStatus,
  updateLlmModelPoolModel,
  testLlmPoolModel,
  resetLlmModelPoolState,
  readLlmModelPoolState,
  writeLlmModelPoolState,
  readOpenAlexConfig,
  readUserState,
  readWebOfScienceConfig,
  refinePaperPool,
  rescorePaperAfterEnrichment,
  selectMatchingAbstractCandidate,
  restoreOpenAlexAbstract,
  refreshJournalMetricsForArchive,
  refreshArchiveLlmInsights,
  refreshArchivePaperLlmInsight,
  retryFailedFetchLogEnrichment,
  resetGoogleRollingCursors,
  recordWebOfScienceRequest,
  scorePaper,
  todayString,
  updateFavoritePaper,
  updatePaperNote,
  writeIntegrationConfigs,
  writeRecentFetchCursor,
  writeUserConfig,
  writeUserProfile,
  clearRecentFetchCursor,
  webOfScienceCitationCount
};






