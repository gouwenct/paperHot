# Archive Clear And Existing Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清除全部论文中的未标星条目，同时保留个人状态，并让今日论文显示本轮全部命中且弱化抓取前已入库论文。

**Architecture:** 后端新增一个归档维护函数和单一路由，读取现有 notes 身份键后一次筛选并写回归档；收藏读取对归档缺失项回退现有收藏快照。前端复用现有归档操作区、身份键和 `saved-muted` 样式，不新增状态文件或依赖。

**Tech Stack:** Node.js 20+、原生 HTTP、原生文件系统、单文件 HTML/CSS/JavaScript、`node:test`。

## Global Constraints

- 固定服务地址为 `http://127.0.0.1:50751`。
- 不修改备份格式 `paperhot-local-data` v1。
- 不删除 `favorites.json`、`paper-notes.json`、抓取日志、近期断点或今日临时会话。
- 不新增依赖、软删除字段或逐篇删除请求。
- 当前工作区已有同一功能链的未提交改动；不 stash、reset、checkout 或自动 commit。

---

### Task 1: 后端清理归档并保留收藏读取

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: `readPaperArchive(dataDir)`、`readPaperNotesFile(dataDir)`、`paperNoteMatchesPaper(note, paper)`、`writePaperArchive(payload, dataDir)`、`appendOperationLogSafe(entry, dataDir)`。
- Produces: `clearUnstarredPaperArchive(options = {}) -> { ok, beforeCount, afterCount, removedCount, preservedStarredCount, archive, papers }`。

- [ ] **Step 1: 写失败测试**

在临时目录写入三篇归档、一个标星 note、一个收藏记录。断言清理后只保留标星论文，收藏与 notes 文件文本不变，操作日志包含 `archive-clear-unstarred`；再断言 `readFavoritesPayload()` 对已被清出归档的收藏论文返回收藏快照。

- [ ] **Step 2: 运行 RED**

Run: `node --test --test-isolation=none --test-name-pattern="clear unstarred archive" test\paperhot_backend.test.cjs`

Expected: FAIL，因为 `clearUnstarredPaperArchive` 尚未导出。

- [ ] **Step 3: 最小实现**

实现一次读取、一次筛选、一次写回：

```js
async function clearUnstarredPaperArchive(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  const archive = await readPaperArchive(dataDir);
  const notes = await readPaperNotesFile(dataDir);
  const papers = archive.papers.filter(paper => notes.notes.some(note => (
    note.starred === true && paperNoteMatchesPaper(note, paper)
  )));
  const nextArchive = { ...archive, mode: "archive", updatedAt: new Date().toISOString(), count: papers.length, papers };
  nextArchive.archiveFile = await writePaperArchive(nextArchive, dataDir);
  await appendOperationLogSafe({ action: "delete", operation: "archive-clear-unstarred", beforeCount: archive.papers.length, afterCount: papers.length, removedCount: archive.papers.length - papers.length, preservedStarredCount: papers.length }, dataDir);
  return { ok: true, beforeCount: archive.papers.length, afterCount: papers.length, removedCount: archive.papers.length - papers.length, preservedStarredCount: papers.length, archive: nextArchive, papers };
}
```

在 `readFavoritesPayload()` 中把归档查找改为 `archive match || favorite.paper`，并导出新函数。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="clear unstarred archive|favorites are stored" test\paperhot_backend.test.cjs`

Expected: PASS。

### Task 2: 路由与全部论文清理按钮

**Files:**
- Modify: `server.cjs`
- Modify: `public/index.html`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: `clearUnstarredPaperArchive()` 和现有 `archiveActionButtons()`、`recentPapers`、`recentDataMeta`。
- Produces: `POST /api/archive/clear-unstarred` 与前端 `clearUnstarredArchive()`。

- [ ] **Step 1: 写失败测试**

断言服务端存在单一路由，全部论文操作区存在 `data-clear-unstarred-archive`，前端使用一次 POST 请求、`window.confirm` 明确删除/保留后果，取消时不请求，成功后替换 `recentPapers`，失败时保留列表。

- [ ] **Step 2: 运行 RED**

Run: `node --test --test-isolation=none --test-name-pattern="clear unstarred archive" test\paperhot_frontend.test.cjs`

Expected: FAIL，因为按钮和处理函数尚不存在。

- [ ] **Step 3: 最小实现**

在 server 导入新函数并增加：

```js
if (req.method === "POST" && pathname === "/api/archive/clear-unstarred") {
  sendJson(res, 200, await clearUnstarredPaperArchive());
  return true;
}
```

在现有归档操作区增加“清空未标星”，前端确认后发出一次请求；成功时使用响应 `papers` 更新列表和计数，失败仅更新状态文本。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="clear unstarred archive" test\paperhot_frontend.test.cjs`

Expected: PASS。

### Task 3: 今日论文显示已入库命中

**Files:**
- Modify: `public/index.html`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: `payload.papers`、`payload.newPapers`、`paperLookupKeys(paper)` 和现有 `.saved-muted`。
- Produces: 临时布尔字段 `archivedBeforeFetch`，只存在于今日抓取结果/session。

- [ ] **Step 1: 写失败测试**

修改 `todayResultPapers` 回归：输入两篇 `papers` 与一篇 `newPapers`，期望两篇都返回，旧论文带 `archivedBeforeFetch: true`，新论文为 false；exact 多候选不标记。断言 `paperCard(..., "today")` 对该字段应用 `saved-muted`。

- [ ] **Step 2: 运行 RED**

Run: `node --test --test-isolation=none --test-name-pattern="today results use fixed|paper cards show" test\paperhot_frontend.test.cjs`

Expected: FAIL，因为方向检索仍只返回 `newPapers`。

- [ ] **Step 3: 最小实现**

让 `todayResultPapers()` 对 `payload.papers` 使用现有身份键判断是否属于 `newPapers`，返回全部命中并附加临时字段；`paperCard()` 在 today scope 下复用 `saved-muted`。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="today results use fixed|paper cards show" test\paperhot_frontend.test.cjs`

Expected: PASS。

### Task 4: 文档、完整验证与固定端口验收

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Verify: `BACKUP_FORMAT.md` remains unchanged

- [ ] **Step 1: 更新运行文档与日志**

README 说明清空只作用于归档、个人收藏/阅读状态保留，以及今日旧论文半透明；CHANGELOG 分别记录新增功能、功能优化、配置与数据、测试与验证。

- [ ] **Step 2: 完整自动验证**

Run: `npm test`

Expected: backend 与 frontend 全部 PASS。

Run: `node --check paperhot_backend.cjs; node --check server.cjs; git diff --check`

Expected: exit 0。

- [ ] **Step 3: 重启并浏览器验收**

停止旧 `50751` 进程并运行 `node server.cjs --port 50751`。使用隔离浏览器和 mock/临时数据验证确认提示、清理结果、收藏回退、今日新旧卡片透明度、无控制台错误；不得调用真实外部论文 API。

- [ ] **Step 4: Git 安全检查**

Run: `git status --short`

Expected: 仅列出源码、测试、README、CHANGELOG、设计和计划文档；不包含真实 `config/*.json`、`data/papers/*.json` 或 API Key。
