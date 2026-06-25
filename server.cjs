const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  addCandidatePaperToArchive,
  buildTokenStats,
  dedupePaperArchive,
  fetchLast7DaysPapers,
  fetchRecentPapers,
  fetchTodayPapers,
  readArchivePayload,
  readFavoritesPayload,
  readPaperNotesPayload,
  readFetchLog,
  readGoogleRollingCursorStatus,
  readOperationLog,
  readIntegrationConfigs,
  readIntegrationSecrets,
  readUserState,
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
  return {
    refresh: true,
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    sources: Array.isArray(body.sources) ? body.sources : [],
    startDate: body.startDate,
    endDate: body.endDate,
    googleScholar: {
      googleStartItem: body.googleStartItem
    },
    onProgress: progressHandler
  };
}

function runRefreshPayload(body, progressHandler) {
  const mode = body.mode === "recent" ? "recent" : (body.mode === "last7" ? "last7" : "today");
  const options = buildRefreshOptions(body, progressHandler);
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

async function handleApi(req, res, pathname) {
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

  if (req.method === "POST" && pathname === "/api/papers/refresh/start") {
    cleanupFetchJobs();
    const body = await collectRequestBody(req);
    const id = makeFetchJobId();
    const job = {
      id,
      status: "running",
      startedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      progress: {
        stage: "queued",
        percent: 2,
        message: "抓取任务已创建",
        counts: {},
        sources: [],
        errors: []
      },
      result: null,
      error: ""
    };
    fetchJobs.set(id, job);
    runRefreshPayload(body, progress => {
      const current = fetchJobs.get(id);
      if (!current) return;
      current.progress = progress;
      current.updatedAt = Date.now();
    }).then(payload => {
      const current = fetchJobs.get(id);
      if (!current) return;
      current.status = "done";
      current.result = payload;
      current.progress = {
        ...(current.progress || {}),
        stage: "done",
        percent: 100,
        message: `完成：最终入库/展示 ${payload.count || 0} 篇`
      };
      current.updatedAt = Date.now();
    }).catch(error => {
      const current = fetchJobs.get(id);
      if (!current) return;
      current.status = "error";
      current.error = error.message;
      current.progress = {
        ...(current.progress || {}),
        stage: "error",
        percent: 100,
        message: `抓取失败：${error.message}`
      };
      current.updatedAt = Date.now();
    });
    sendJson(res, 202, { ok: true, id, status: job.status, progress: job.progress });
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
    sendJson(res, 200, {
      ok: true,
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      progress: job.progress,
      result: job.result,
      error: job.error
    });
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

    const handledApi = await handleApi(req, res, url.pathname);
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
