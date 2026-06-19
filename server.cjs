const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  buildTokenStats,
  fetchRecentPapers,
  fetchTodayPapers,
  readUserState,
  writeUserConfig
} = require("./paperhot_backend.cjs");

const HOST = "127.0.0.1";
const portArgIndex = process.argv.indexOf("--port");
const argPort = portArgIndex >= 0 ? process.argv[portArgIndex + 1] : "";
const PORT = Number(argPort || process.env.PAPERHOT_PORT || 50751);
const HTML_FILE = path.join(
  __dirname,
  ".superpowers",
  "brainstorm",
  "codex-20260619195104",
  "content",
  "paperhot-config-interactive-cn.html"
);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
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

  if (req.method === "POST" && pathname === "/api/papers/refresh") {
    const body = await collectRequestBody(req);
    const mode = body.mode === "recent" ? "recent" : "today";
    const payload = mode === "recent" ? await fetchRecentPapers({
      refresh: true,
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      sources: Array.isArray(body.sources) ? body.sources : []
    }) : await fetchTodayPapers({
      refresh: true,
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      sources: Array.isArray(body.sources) ? body.sources : []
    });
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
