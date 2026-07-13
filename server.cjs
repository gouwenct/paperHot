const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  addCandidatePaperToArchive,
  buildDiscoveryTaskContext,
  buildDiscoveryTaskDescriptor,
  buildTokenStats,
  dedupePaperArchive,
  exportLocalDataZip,
  fetchLast7DaysPapers,
  fetchRecentPapers,
  fetchTodayPapers,
  readArchivePayload,
  readDiscoveryTaskState,
  readFavoritesPayload,
  readPaperNotesPayload,
  readFetchLog,
  readGoogleRollingCursorStatus,
  readOperationLog,
  readIntegrationConfigs,
  readIntegrationSecrets,
  readUserState,
  importLocalData,
  importLocalDataZip,
  removeCandidatePaperFromArchive,
  refreshArchiveLlmInsights,
  refreshArchivePaperLlmInsight,
  refreshJournalMetricsForArchive,
  retryFailedFetchLogEnrichment,
  resetGoogleRollingCursors,
  testLlmConfig,
  updateFavoritePaper,
  updatePaperNote,
  writeIntegrationConfigs,
  writeUserConfig
} = require("./paperhot_backend.cjs");

const HOST = "127.0.0.1";
const portArgIndex = process.argv.indexOf("--port");
const argPort = portArgIndex >= 0 ? process.argv[portArgIndex + 1] : "";
const PORT = Number(argPort || process.env.PAPERHOT_PORT || 50751);
const HTML_FILE = path.join(__dirname, "public", "index.html");
const LOGO_FILE = path.join(__dirname, "public", "paperhot-logo.png");
const fetchJobs = new Map();
const FETCH_JOB_TTL_MS = 30 * 60 * 1000;

function makeFetchJobId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function cleanupFetchJobs() {
  const cutoff = Date.now() - FETCH_JOB_TTL_MS;
  for (const [id, job] of fetchJobs.entries()) {
    if (job.updatedAt < cutoff) fetchJobs.delete(id);
  }
}

function buildRefreshOptions(body, progressHandler) {
  const isPlainRecord = value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };
  const record = isPlainRecord(body) ? body : {};
  const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined;
  const cleanStringList = (value, caseInsensitive = false) => {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).flatMap(item => {
      if (typeof item !== "string") return [];
      const clean = item.trim();
      const key = caseInsensitive ? clean.toLowerCase() : clean;
      if (!clean || seen.has(key)) return [];
      seen.add(key);
      return [clean];
    });
  };
  const cleanDate = value => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      ? value
      : undefined;
  };
  const rawLogic = isPlainRecord(own(record, "searchLogic")) ? own(record, "searchLogic") : {};
  const activeKeywords = cleanStringList(own(rawLogic, "activeKeywords"));
  const seenEdges = new Set();
  const andEdges = (Array.isArray(own(rawLogic, "andEdges")) ? own(rawLogic, "andEdges") : []).flatMap(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(item => typeof item !== "string")) return [];
    const cleanPair = pair.map(item => item.trim());
    if (cleanPair.some(item => !item)) return [];
    const key = cleanPair.map(item => item.toLowerCase()).sort().join("::");
    if (seenEdges.has(key)) return [];
    seenEdges.add(key);
    return [cleanPair];
  });
  const searchMode = own(record, "searchMode");
  const resumeMode = own(record, "resumeMode");
  const queryExpression = own(record, "queryExpression");
  return {
    refresh: true,
    searchMode: ["direction", "exact"].includes(searchMode) ? searchMode : "direction",
    queryExpression: typeof queryExpression === "string" ? queryExpression.trim() : "",
    searchLogic: { activeKeywords, andEdges },
    sources: cleanStringList(own(record, "sources"), true),
    startDate: cleanDate(own(record, "startDate")),
    endDate: cleanDate(own(record, "endDate")),
    resumeMode: ["resume", "restart", "new"].includes(resumeMode) ? resumeMode : "new",
    onProgress: typeof progressHandler === "function" ? progressHandler : undefined
  };
}

function refreshRequestMode(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(body, "mode")) return "today";
  return body.mode === "recent" ? "recent" : (body.mode === "last7" ? "last7" : "today");
}

function buildFrozenRefreshOptions(body, progressHandler, effectiveDate) {
  const options = {
    ...buildRefreshOptions(body, progressHandler),
    mode: refreshRequestMode(body),
    ...(effectiveDate ? { date: effectiveDate } : {})
  };
  const context = buildDiscoveryTaskContext(options);
  return {
    ...options,
    date: context.date,
    startDate: context.task.startDate,
    endDate: context.task.endDate
  };
}

function readRefreshTaskState(body) {
  const taskOptions = buildFrozenRefreshOptions(body);
  return readDiscoveryTaskState(taskOptions).then(state => ({
    ok: true,
    ...buildDiscoveryTaskDescriptor(taskOptions),
    ...state
  }));
}

function createFetchJob(id, state = {}, startedAt = new Date().toISOString(), updatedAt = Date.now()) {
  const sourcePages = { ...(state.sourcePages || {}) };
  const errors = Array.isArray(state.errors) ? [...state.errors] : [];
  return {
    id,
    status: "running",
    startedAt,
    updatedAt,
    progress: {
      stage: "queued",
      percent: 2,
      message: "抓取任务已创建",
      counts: {},
      sources: [],
      sourcePages,
      errors
    },
    taskFingerprint: typeof state.taskFingerprint === "string" ? state.taskFingerprint : "",
    resumable: state.resumable === true,
    sourcePages,
    sourceResults: Array.isArray(state.sourceResults) ? [...state.sourceResults] : [],
    errors,
    result: null,
    error: ""
  };
}

function mergeJobList(current, incoming, keyFor) {
  const merged = new Map();
  [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((item, index) => {
    merged.set(keyFor(item, index), item);
  });
  return [...merged.values()];
}

function replaceFetchJobCanonicalState(job, state = {}) {
  if (
    typeof state.taskFingerprint !== "string"
    || typeof state.resumable !== "boolean"
    || !state.sourcePages
    || typeof state.sourcePages !== "object"
    || Array.isArray(state.sourcePages)
    || !Array.isArray(state.sourceResults)
    || !Array.isArray(state.errors)
  ) return false;
  job.taskFingerprint = state.taskFingerprint;
  job.resumable = state.resumable;
  job.sourcePages = { ...state.sourcePages };
  job.sourceResults = [...state.sourceResults];
  job.errors = [...state.errors];
  return true;
}

function mergeFetchJobProgress(job, progress = {}, updatedAt = Date.now()) {
  if (job.status !== "running") return job;
  const event = progress && typeof progress === "object" ? progress : {};
  const current = job.progress || {};
  const currentPercent = Number.isFinite(Number(current.percent)) ? Number(current.percent) : 0;
  const hasIncomingPercent = event.percent !== undefined && event.percent !== null && Number.isFinite(Number(event.percent));
  const incomingPercent = hasIncomingPercent ? Number(event.percent) : currentPercent;
  const movesForward = hasIncomingPercent && incomingPercent >= currentPercent;
  replaceFetchJobCanonicalState(job, event);
  const counts = { ...(current.counts || {}) };
  Object.entries(event.counts && typeof event.counts === "object" ? event.counts : {}).forEach(([key, value]) => {
    const number = Number(value);
    if (Number.isFinite(number)) counts[key] = Math.max(Number(counts[key]) || 0, number);
  });
  const sources = mergeJobList(current.sources, event.sources, item => item?.api || item?.source || item?.label || JSON.stringify(item));
  job.progress = {
    ...current,
    ...(movesForward && typeof event.stage === "string" ? { stage: event.stage } : {}),
    percent: Math.max(currentPercent, incomingPercent),
    ...(movesForward && typeof event.message === "string" ? { message: event.message } : {}),
    counts,
    sources,
    sourcePages: job.sourcePages,
    errors: job.errors,
    ...(event.sourcePage ? { sourcePage: event.sourcePage } : {}),
    ...(typeof event.at === "string" && (!current.at || event.at > current.at) ? { at: event.at } : {})
  };
  job.updatedAt = updatedAt;
  return job;
}

function completeFetchJob(job, payload, updatedAt = Date.now()) {
  job.result = payload;
  replaceFetchJobCanonicalState(job, payload);
  mergeFetchJobProgress(job, {
    stage: "done",
    percent: 100,
    message: `完成：最终入库/展示 ${payload.count || 0} 篇`,
    sourcePages: job.sourcePages,
    sourceResults: job.sourceResults,
    errors: job.errors,
    taskFingerprint: job.taskFingerprint,
    resumable: job.resumable
  }, updatedAt);
  job.status = "done";
  return job;
}

function failFetchJob(job, error, state = {}, updatedAt = Date.now()) {
  job.error = error.message;
  replaceFetchJobCanonicalState(job, {
    ...state,
    sourceResults: mergeJobList(job.sourceResults, state.sourceResults, item => item?.source || JSON.stringify(item)),
    errors: mergeJobList(job.errors, state.errors, item => `${item?.source || ""}\n${item?.message || ""}`)
  });
  job.errors = mergeJobList(job.errors, [
    { source: "server", message: error.message }
  ], item => `${item?.source || ""}\n${item?.message || ""}`);
  mergeFetchJobProgress(job, {
    stage: "error",
    percent: 100,
    message: `抓取失败：${error.message}`,
    sourcePages: job.sourcePages,
    sourceResults: job.sourceResults,
    errors: job.errors,
    taskFingerprint: job.taskFingerprint,
    resumable: job.resumable
  }, updatedAt);
  job.status = "error";
  return job;
}

function fetchJobResponse(job) {
  return {
    ok: true,
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    progress: job.progress,
    taskFingerprint: job.taskFingerprint,
    resumable: job.resumable,
    sourcePages: job.sourcePages,
    sourceResults: job.sourceResults,
    errors: job.errors,
    result: job.result,
    error: job.error
  };
}

function runRefreshPayload(body, progressHandler, frozenOptions) {
  const options = frozenOptions
    ? { ...frozenOptions, onProgress: typeof progressHandler === "function" ? progressHandler : undefined }
    : buildFrozenRefreshOptions(body, progressHandler);
  const mode = options.mode;
  if (mode === "recent") return fetchRecentPapers(options);
  if (mode === "last7") return fetchLast7DaysPapers(options);
  return fetchTodayPapers(options);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendBuffer(res, status, buffer, contentType, filename) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": buffer.length
  });
  res.end(buffer);
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error("请求体不是有效 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function collectRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (req.method === "GET" && pathname === "/api/token/stats") {
    const payload = await buildTokenStats();
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/fetch/log") {
    const entries = await readFetchLog();
    sendJson(res, 200, { ok: true, entries });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/fetch/log/retry") {
    const body = await collectRequestBody(req);
    const payload = await retryFailedFetchLogEnrichment(body.index);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/google-rolling/status") {
    const body = await collectRequestBody(req);
    const payload = await readGoogleRollingCursorStatus(body || {});
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/google-rolling/reset") {
    const body = await collectRequestBody(req);
    const payload = await resetGoogleRollingCursors(body || {});
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/operation-log") {
    const entries = await readOperationLog();
    sendJson(res, 200, { ok: true, entries });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/user/state") {
    const payload = await readUserState();
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/user/config") {
    const body = await collectRequestBody(req);
    const config = await writeUserConfig(body);
    sendJson(res, 200, { ok: true, config });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/local-data/export") {
    const includePapers = url.searchParams.get("includePapers") !== "0";
    const includeProfile = url.searchParams.get("includeProfile") === "1";
    const includeSecrets = url.searchParams.get("includeSecrets") === "1";
    const includeStats = url.searchParams.get("includeStats") === "1";
    const includeLogs = url.searchParams.get("includeLogs") === "1";
    const buffer = await exportLocalDataZip({ includePapers, includeProfile, includeSecrets, includeStats, includeLogs });
    const date = new Date().toISOString().slice(0, 10);
    sendBuffer(res, 200, buffer, "application/zip", `paper-hot-local-data${includeSecrets ? "-with-secrets" : ""}-${date}.zip`);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/local-data/import") {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    const importOptions = {
      allowSecrets: url.searchParams.get("allowSecrets") === "1"
    };
    const payload = contentType.includes("application/zip") || contentType.includes("application/octet-stream")
      ? await importLocalDataZip(await collectRawRequestBody(req), importOptions)
      : await importLocalData(await collectRequestBody(req), importOptions);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/integrations/config") {
    const integrations = await readIntegrationConfigs();
    sendJson(res, 200, { ok: true, integrations });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/integrations/secrets") {
    const secrets = await readIntegrationSecrets();
    sendJson(res, 200, { ok: true, secrets });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/integrations/config") {
    const body = await collectRequestBody(req);
    const integrations = await writeIntegrationConfigs(body);
    sendJson(res, 200, { ok: true, integrations });
    return true;
  }
  if (req.method === "POST" && pathname === "/api/integrations/llm/test") {
    const body = await collectRequestBody(req);
    try {
      const result = await testLlmConfig(body);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/api/papers/today") {
    const payload = await fetchTodayPapers({ refresh: false });
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/papers/recent") {
    const payload = await fetchRecentPapers({ refresh: false });
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/archive") {
    const payload = await readArchivePayload();
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/favorites") {
    const payload = await readFavoritesPayload();
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/paper-notes") {
    const payload = await readPaperNotesPayload();
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/papers/refresh") {
    const body = await collectRequestBody(req);
    const payload = await runRefreshPayload(body);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/archive/candidate") {
    const body = await collectRequestBody(req);
    const payload = await addCandidatePaperToArchive(body.paper || body);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/favorites") {
    const body = await collectRequestBody(req);
    const payload = await updateFavoritePaper(body);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/paper-notes") {
    const body = await collectRequestBody(req);
    const payload = await updatePaperNote(body);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "DELETE" && pathname === "/api/archive/candidate") {
    const body = await collectRequestBody(req);
    const payload = await removeCandidatePaperFromArchive(body.paper || body);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/archive/dedupe") {
    const payload = await dedupePaperArchive();
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/archive/llm") {
    const body = await collectRequestBody(req);
    const payload = await refreshArchiveLlmInsights(body || {});
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/archive/llm/paper") {
    const body = await collectRequestBody(req);
    const payload = await refreshArchivePaperLlmInsight(body.paper || body);
    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && pathname === "/api/papers/refresh/state") {
    const body = await collectRequestBody(req);
    sendJson(res, 200, await readRefreshTaskState(body));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/papers/refresh/start") {
    cleanupFetchJobs();
    const body = await collectRequestBody(req);
    const id = makeFetchJobId();
    const taskOptions = buildFrozenRefreshOptions(body);
    const initialState = buildDiscoveryTaskDescriptor(taskOptions);
    const job = createFetchJob(id, initialState);
    fetchJobs.set(id, job);
    runRefreshPayload(body, progress => {
      const current = fetchJobs.get(id);
      if (!current) return;
      mergeFetchJobProgress(current, progress);
    }, taskOptions).then(payload => {
      const current = fetchJobs.get(id);
      if (!current) return;
      completeFetchJob(current, payload);
    }).catch(async error => {
      const current = fetchJobs.get(id);
      if (!current) return;
      let durableState = {};
      try {
        durableState = await readDiscoveryTaskState(taskOptions);
      } catch {
        // Preserve the live canonical state if the cursor itself cannot be read.
      }
      failFetchJob(current, error, durableState);
    });
    sendJson(res, 202, fetchJobResponse(job));
    return true;
  }

  if (req.method === "GET" && pathname === "/api/papers/refresh/status") {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const id = url.searchParams.get("id");
    const job = fetchJobs.get(id);
    if (!job) {
      sendJson(res, 404, { ok: false, error: "抓取任务不存在或已过期" });
      return true;
    }
    sendJson(res, 200, fetchJobResponse(job));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/journals/refresh") {
    const payload = await refreshJournalMetricsForArchive();
    sendJson(res, 200, payload);
    return true;
  }

  return false;
}

async function serveHtml(res) {
  const html = await fs.readFile(HTML_FILE, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(html)
  });
  res.end(html);
}

async function serveLogo(res) {
  const logo = await fs.readFile(LOGO_FILE);
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "no-store",
    "Content-Length": logo.length
  });
  res.end(logo);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      });
      res.end();
      return;
    }
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/paperhot-logo.png") {
      await serveLogo(res);
      return;
    }

    const handledApi = await handleApi(req, res, url);
    if (handledApi) return;

    if (req.method === "GET" || req.method === "HEAD") {
      await serveHtml(res);
      return;
    }

    sendJson(res, 405, { error: "Method Not Allowed" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`paperHOT backend: http://${HOST}:${PORT}/`);
});
