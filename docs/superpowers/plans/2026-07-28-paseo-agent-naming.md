# Paseo Global Agent Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让同一 Paseo daemon 管理的 Codex、Claude、Grok agent 在第一轮完成后获得稳定的简体中文 Paseo 名称，并在 provider 支持正式重命名接口时单向同步原生标题。

**Architecture:** Paseo 标题是唯一权威来源。实现拆为纯命名策略、持久化状态、生命周期 transport、协调器和 provider adapter；优先使用正式 daemon hook/plugin，当前版本若没有稳定事件契约则使用公开 Paseo CLI 周期性对账，不读取内部 agent JSON。Codex 通过经过验证的 `thread/name/set` 同步；Claude/Grok 无稳定 API 时保持 Paseo-only。

**Tech Stack:** Node.js 20+ 标准库（`node:test`、`node:fs/promises`、`node:child_process`）；Paseo CLI 0.2.3+；Codex app-server JSONL。无新增 npm 依赖。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-07-28-paseo-agent-naming-design.md`。
- 实际脚本和状态只放在 `C:\Users\PC\.paseo\agent-naming\`，不放入 PaperHot 运行目录、数据 ZIP 或 Git 提交。
- 主会话使用“动作｜对象”，子代理使用“角色｜交付物”，workspace 使用“项目名｜工作流”；所有名称含 ` #N` 后缀不超过 24 个字符。
- agent 完成第一轮后只自动语义命名一次；workspace 在第一个顶层 agent 完成第一轮后只自动命名一次。
- 只有 Paseo 中用户主动编辑的名称进入手工锁；provider 原生窗口改名不反向同步。
- 主会话重名范围是同一 workspace；子代理重名范围是同一 parent；workspace 重名范围是全部活跃 workspace。
- Paseo → provider 单向同步；任何 provider 失败都不回滚 Paseo。
- 不监听或修改 `~/.paseo/agents/*.json`，不模拟 `/rename`，不做 UI 自动化，不修改 provider 内部 session 文件。
- 不保存 prompt/response 正文、API Key、token、MCP Authorization header。
- 不重启 Paseo daemon，除非用户在执行阶段明确确认；重启会中断当前所有 agent。
- 当前 CLI 没有公开 workspace rename 命令；workspace 自动命名必须等正式 daemon/MCP 可调用契约确认，不得用内部文件绕过。
- 每个非平凡分支先写失败测试，再实现最小代码，再运行聚焦测试和完整测试。

---

### Task 1: 固化 Paseo/provider 能力矩阵并设置实施门禁

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\capabilities.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\capabilities.test.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\capabilities.json`

**Interfaces:**
- Produces:
  - `runPaseoCli(args: string[]) -> Promise<{ code: number, stdout: string }>`
  - `probeCapabilities(options = {}) -> Promise<CapabilityMatrix>`
- `CapabilityMatrix` 精确字段：
  - `paseoVersion: string`
  - `agentListCli: boolean`
  - `agentInspectCli: boolean`
  - `agentUpdateCli: boolean`
  - `workspaceUpdateCli: boolean`
  - `lifecycleHook: "supported" | "unsupported" | "unconfirmed"`
  - `websocketEvents: "supported" | "unsupported" | "unconfirmed"`
  - `providers.codex.nativeRename: "supported" | "unsupported" | "unconfirmed"`
  - `providers.claude.nativeRename: "supported" | "unsupported" | "unconfirmed"`
  - `providers.grok.nativeRename: "supported" | "unsupported" | "unconfirmed"`

- [ ] **Step 1: 创建目录并写失败测试**

执行前先确认父目录 `C:\Users\PC\.paseo` 存在。创建 `agent-naming\test` 后写入：

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { probeCapabilities } = require("../capabilities.cjs");

test("probeCapabilities only marks documented commands as supported", async () => {
  const outputs = new Map([
    ["paseo --version", { code: 0, stdout: "0.2.3\n" }],
    ["paseo agent ls --help", { code: 0, stdout: "--global\n--json\n" }],
    ["paseo agent inspect --help", { code: 0, stdout: "--json\n" }],
    ["paseo agent update --help", { code: 0, stdout: "--name <name>\n" }],
    ["paseo workspace --help", { code: 0, stdout: "create\nls\narchive\n" }],
    ["paseo hooks --help", { code: 0, stdout: "Record agent hook activity\n" }]
  ]);
  const matrix = await probeCapabilities({
    run: async command => outputs.get(command) || { code: 1, stdout: "" }
  });
  assert.equal(matrix.paseoVersion, "0.2.3");
  assert.equal(matrix.agentListCli, true);
  assert.equal(matrix.agentInspectCli, true);
  assert.equal(matrix.agentUpdateCli, true);
  assert.equal(matrix.workspaceUpdateCli, false);
  assert.equal(matrix.lifecycleHook, "unconfirmed");
  assert.equal(matrix.websocketEvents, "unconfirmed");
  assert.equal(matrix.providers.codex.nativeRename, "unconfirmed");
  assert.equal(matrix.providers.claude.nativeRename, "unconfirmed");
  assert.equal(matrix.providers.grok.nativeRename, "unconfirmed");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\capabilities.test.cjs"
```

Expected: FAIL，原因是 `capabilities.cjs` 不存在或 `probeCapabilities` 未导出。

- [ ] **Step 3: 实现最小能力探测**

`capabilities.cjs`：

```js
const { execFile } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const paseoCli = path.join(os.homedir(), ".local", "bin", "paseo.cmd");

async function runPaseoCli(args) {
  try {
    const { stdout } = await execFileAsync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "call", paseoCli, ...args],
      { windowsHide: true, encoding: "utf8" }
    );
    return { code: 0, stdout };
  } catch (error) {
    return { code: Number(error.code) || 1, stdout: error.stdout || "" };
  }
}

async function defaultRun(command) {
  return runPaseoCli(command.replace(/^paseo\s*/, "").split(" ").filter(Boolean));
}

async function probeCapabilities(options = {}) {
  const run = options.run || defaultRun;
  const [version, listHelp, inspectHelp, updateHelp, workspaceHelp, hooksHelp] = await Promise.all([
    run("paseo --version"),
    run("paseo agent ls --help"),
    run("paseo agent inspect --help"),
    run("paseo agent update --help"),
    run("paseo workspace --help"),
    run("paseo hooks --help")
  ]);
  return {
    paseoVersion: String(version.stdout || "").trim(),
    agentListCli: listHelp.code === 0 && /--global/.test(listHelp.stdout) && /--json/.test(listHelp.stdout),
    agentInspectCli: inspectHelp.code === 0 && /--json/.test(inspectHelp.stdout),
    agentUpdateCli: updateHelp.code === 0 && /--name/.test(updateHelp.stdout),
    workspaceUpdateCli: workspaceHelp.code === 0 && /\b(?:rename|update)\b/.test(workspaceHelp.stdout),
    lifecycleHook: hooksHelp.code === 0 && /subscribe|lifecycle|agent-created|agent-renamed/i.test(hooksHelp.stdout)
      ? "supported"
      : "unconfirmed",
    websocketEvents: "unconfirmed",
    providers: {
      codex: { nativeRename: "unconfirmed" },
      claude: { nativeRename: "unconfirmed" },
      grok: { nativeRename: "unconfirmed" }
    }
  };
}

module.exports = { probeCapabilities, runPaseoCli };
```

- [ ] **Step 4: 运行测试并生成真实能力文件**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\capabilities.test.cjs"
node -e "const fs=require('node:fs'); const {probeCapabilities}=require('C:/Users/PC/.paseo/agent-naming/capabilities.cjs'); probeCapabilities().then(x=>fs.writeFileSync('C:/Users/PC/.paseo/agent-naming/capabilities.json', JSON.stringify(x,null,2)+'\n'))"
```

Expected: 测试 PASS；真实矩阵至少显示 agent list/inspect/update 为 `true`，workspace update 为 `false`，未确认能力保持 `unconfirmed`。

- [ ] **Step 5: 人工契约门禁**

检查 Paseo 官方版本文档或受支持 API。如果发现正式 daemon hook/plugin 或稳定 WebSocket 契约，停止执行本计划的 Task 4，先更新设计和 transport 计划以使用正式接口；不要把应用内部 bundle 中的字符串当作公共契约。

- [ ] **Step 6: 提交策略**

`C:\Users\PC\.paseo\agent-naming\` 是用户级配置，不提交到 PaperHot Git。仅在任务报告中记录测试命令和能力结果，不记录 token 或 Authorization header。

---

### Task 2: 实现纯命名策略与局部重名分配

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\naming-policy.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\naming-policy.test.cjs`

**Interfaces:**
- Produces:
  - `normalizeCandidate(candidate, kind, suffix = "") -> string`
  - `isObviouslyGeneratedTitle(title) -> boolean`
  - `duplicateScopeKey(entity) -> string`
  - `allocateUniqueTitle(candidate, entity, activeEntities) -> string`
- `kind`: `"agent" | "subagent" | "workspace"`
- `entity`: `{ id, workspaceId, parentAgentId, title, kind }`

- [ ] **Step 1: 写失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeCandidate,
  isObviouslyGeneratedTitle,
  duplicateScopeKey,
  allocateUniqueTitle
} = require("../naming-policy.cjs");

test("normalizes confirmed title formats and preserves suffix inside 24 chars", () => {
  assert.equal(normalizeCandidate("  配置 | Paseo 自动命名  ", "agent"), "配置｜Paseo 自动命名");
  assert.equal(normalizeCandidate("审查｜非常非常非常非常长的登录流程交付物", "subagent", " #2").length <= 24, true);
  assert.match(normalizeCandidate("审查｜非常非常非常非常长的登录流程交付物", "subagent", " #2"), / #2$/);
});

test("detects client-generated or meaningless titles", () => {
  for (const value of ["hi", "/resume", "继续", "请帮我看一下这个项目下的三个子文件：仿真、传统重建和 RIM 项目。"])
    assert.equal(isObviouslyGeneratedTitle(value), true, value);
  assert.equal(isObviouslyGeneratedTitle("配置｜多端会话命名"), false);
});

test("uses local duplicate scopes", () => {
  assert.equal(duplicateScopeKey({ kind: "agent", workspaceId: "w1", parentAgentId: null }), "agent:w1");
  assert.equal(duplicateScopeKey({ kind: "subagent", workspaceId: "w1", parentAgentId: "p1" }), "subagent:p1");
  assert.equal(duplicateScopeKey({ kind: "workspace" }), "workspace:active");
});

test("adds the smallest available local suffix without cross-project pollution", () => {
  const entity = { id: "a3", kind: "agent", workspaceId: "w1", parentAgentId: null };
  const active = [
    { id: "a1", kind: "agent", workspaceId: "w1", parentAgentId: null, title: "修复｜登录流程" },
    { id: "a2", kind: "agent", workspaceId: "w2", parentAgentId: null, title: "修复｜登录流程" }
  ];
  assert.equal(allocateUniqueTitle("修复｜登录流程", entity, active), "修复｜登录流程 #2");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\naming-policy.test.cjs"
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小策略**

`naming-policy.cjs`：

```js
const MAX_TITLE_LENGTH = 24;
const MEANINGLESS = /^(?:hi|hello|继续|继续任务|\/resume)$/i;

function compact(value) {
  return String(value || "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

function normalizeCandidate(candidate, kind, suffix = "") {
  const clean = compact(candidate).replace(/\s*[|｜]\s*/g, "｜");
  const [head, ...tail] = clean.split("｜");
  const fallback = kind === "workspace" ? "工作区｜待识别工作流"
    : kind === "subagent" ? "探索｜待识别交付物"
      : "规划｜待识别目标";
  const base = head && tail.length ? `${head}｜${tail.join("｜")}` : fallback;
  const room = Math.max(0, MAX_TITLE_LENGTH - suffix.length);
  if (base.length <= room) return `${base}${suffix}`;
  const separator = base.indexOf("｜");
  const prefix = separator >= 0 ? base.slice(0, separator + 1) : "";
  const object = separator >= 0 ? base.slice(separator + 1) : base;
  return `${prefix}${object.slice(0, Math.max(0, room - prefix.length))}${suffix}`;
}

function isObviouslyGeneratedTitle(title) {
  const clean = compact(title);
  return !clean || MEANINGLESS.test(clean) || (!clean.includes("｜") && clean.length > 24);
}

function duplicateScopeKey(entity) {
  if (entity.kind === "workspace") return "workspace:active";
  if (entity.kind === "subagent" || entity.parentAgentId) return `subagent:${entity.parentAgentId || "missing"}`;
  return `agent:${entity.workspaceId || "missing"}`;
}

function allocateUniqueTitle(candidate, entity, activeEntities) {
  const scope = duplicateScopeKey(entity);
  const used = new Set((activeEntities || [])
    .filter(item => item.id !== entity.id && duplicateScopeKey(item) === scope)
    .map(item => compact(item.title)));
  const base = normalizeCandidate(candidate, entity.kind);
  if (!used.has(base)) return base;
  for (let number = 2; number < 10000; number += 1) {
    const suffix = ` #${number}`;
    const value = normalizeCandidate(candidate, entity.kind, suffix);
    if (!used.has(value)) return value;
  }
  throw new Error("无法分配唯一会话名称");
}

module.exports = {
  MAX_TITLE_LENGTH,
  allocateUniqueTitle,
  duplicateScopeKey,
  isObviouslyGeneratedTitle,
  normalizeCandidate
};
```

- [ ] **Step 4: 运行测试**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\naming-policy.test.cjs"
```

Expected: 全部 PASS。

---

### Task 3: 实现状态库、手工锁和幂等 outbox

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\state-store.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\state-store.test.cjs`
- Runtime: `C:\Users\PC\.paseo\agent-naming\state.json`

**Interfaces:**
- Produces:
  - `readState(filePath) -> Promise<State>`
  - `writeState(filePath, state) -> Promise<void>`
  - `observeTitle(record, observedTitle, now) -> record`
  - `markAutoApplied(record, title, now) -> record`
  - `enqueueProviderSync(record, sink) -> record`
- 写入使用临时文件后 `rename`，避免进程中断产生半个 JSON。

- [ ] **Step 1: 写失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  readState,
  writeState,
  observeTitle,
  markAutoApplied,
  enqueueProviderSync
} = require("../state-store.cjs");

test("external Paseo title change locks an already managed agent", () => {
  const managed = markAutoApplied({ agentId: "a1", titleRevision: 0 }, "配置｜自动命名", 100);
  const changed = observeTitle(managed, "配置｜手工名称", 200);
  assert.equal(changed.manualLocked, true);
  assert.equal(changed.phase, "manual_locked");
});

test("self echo does not become a manual lock", () => {
  const managed = markAutoApplied({ agentId: "a1", titleRevision: 0 }, "配置｜自动命名", 100);
  const echoed = observeTitle(managed, "配置｜自动命名", 110);
  assert.equal(echoed.manualLocked, false);
  assert.equal(echoed.phase, "auto_frozen");
});

test("provider outbox keeps only latest revision per sink", () => {
  let record = markAutoApplied({ agentId: "a1", titleRevision: 0 }, "配置｜A", 100);
  record = enqueueProviderSync(record, "codex");
  record = markAutoApplied(record, "配置｜B", 200);
  record = enqueueProviderSync(record, "codex");
  assert.deepEqual(record.outbox, [{ sink: "codex", titleRevision: 2, title: "配置｜B", attempts: 0 }]);
});

test("state writes atomically and round-trips", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-naming-"));
  const file = path.join(dir, "state.json");
  await writeState(file, { version: 1, agents: { a1: { title: "配置｜A" } } });
  assert.deepEqual(await readState(file), { version: 1, agents: { a1: { title: "配置｜A" } } });
  await fs.rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test "C:\Users\PC\.paseo\agent-naming\test\state-store.test.cjs"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现状态库**

实现时固定以下规则：

```js
const EMPTY_STATE = { version: 1, agents: {}, workspaces: {} };

function markAutoApplied(record, title, now) {
  return {
    ...record,
    title,
    titleRevision: Number(record.titleRevision || 0) + 1,
    phase: "auto_frozen",
    manualLocked: false,
    lastAppliedTitle: title,
    lastAppliedAt: now,
    outbox: Array.isArray(record.outbox) ? record.outbox : []
  };
}

function observeTitle(record, observedTitle, now) {
  if (!record.lastAppliedTitle || observedTitle === record.lastAppliedTitle)
    return { ...record, title: observedTitle };
  return {
    ...record,
    title: observedTitle,
    phase: "manual_locked",
    manualLocked: true,
    manualLockedAt: now,
    outbox: []
  };
}

function enqueueProviderSync(record, sink) {
  const outbox = (record.outbox || []).filter(item => item.sink !== sink);
  outbox.push({
    sink,
    titleRevision: record.titleRevision,
    title: record.title,
    attempts: 0
  });
  return { ...record, outbox };
}
```

`readState` 对 `ENOENT` 返回新的 `EMPTY_STATE` 副本；其他 JSON 错误明确抛出，不悄悄覆盖损坏状态。`writeState` 写 `<file>.tmp` 后使用 `fs.rename` 原子替换。

- [ ] **Step 4: 运行聚焦测试**

Run: `node --test "C:\Users\PC\.paseo\agent-naming\test\state-store.test.cjs"`

Expected: 全部 PASS。

---

### Task 4: 实现 Paseo 公开 CLI transport 与只读对账

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\paseo-cli.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\paseo-cli.test.cjs`

**Interfaces:**
- Consumes: `runPaseoCli(args)` from Task 1.
- Produces:
  - `listAgents(options = {}) -> Promise<AgentSummary[]>`
  - `inspectAgent(agentId, options = {}) -> Promise<AgentDetail>`
  - `updateAgentName(agentId, name, options = {}) -> Promise<void>`
- `AgentSummary`: `{ id, title, provider, status, cwd, workspaceId, parentAgentId, archived }`

- [ ] **Step 1: 写失败测试**

使用注入的 `runPaseo(args)` 测试，不调用真实 daemon：

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { listAgents, updateAgentName } = require("../paseo-cli.cjs");

test("listAgents maps public global JSON without reading internal state files", async () => {
  const agents = await listAgents({
    runPaseo: async args => {
      assert.deepEqual(args, ["agent", "ls", "--global", "--json"]);
      return JSON.stringify([{ id: "a1", name: "hi", provider: "claude/claude-opus-5", status: "idle", cwd: "C:\\repo" }]);
    }
  });
  assert.deepEqual(agents, [{
    id: "a1", title: "hi", provider: "claude", status: "idle", cwd: "C:\\repo",
    workspaceId: "", parentAgentId: null, archived: false
  }]);
});

test("updateAgentName uses the supported daemon-backed CLI", async () => {
  let received;
  await updateAgentName("a1", "配置｜自动命名", {
    runPaseo: async args => { received = args; return "{}"; }
  });
  assert.deepEqual(received, ["agent", "update", "a1", "--name", "配置｜自动命名", "--json"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test "C:\Users\PC\.paseo\agent-naming\test\paseo-cli.test.cjs"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 CLI transport**

复用 Task 1 的 `runPaseoCli(args)`；Windows 上通过已安装的 `~/.local/bin/paseo.cmd` trampoline 调用，不自行拼接含标题的 shell 字符串。provider 取 `/` 前的前缀。公开 `ls` JSON 当前不提供 workspaceId/parentAgentId 时保持空值，并由正式 daemon 事件或后续受支持 API 补齐；不能从内部 JSON 文件补读。

```js
const { runPaseoCli } = require("./capabilities.cjs");

async function defaultRunPaseo(args) {
  const result = await runPaseoCli(args);
  if (result.code !== 0) throw new Error(`paseo CLI 失败: ${result.code}`);
  return result.stdout;
}

async function listAgents(options = {}) {
  const runPaseo = options.runPaseo || defaultRunPaseo;
  const rows = JSON.parse(await runPaseo(["agent", "ls", "--global", "--json"]));
  return rows.map(row => ({
    id: String(row.id || ""),
    title: String(row.name || row.title || ""),
    provider: String(row.provider || "").split("/")[0],
    status: String(row.status || ""),
    cwd: String(row.cwd || ""),
    workspaceId: String(row.workspaceId || ""),
    parentAgentId: row.parentAgentId || null,
    archived: Boolean(row.archived)
  })).filter(row => row.id);
}
```

- [ ] **Step 4: 运行测试和真实只读 smoke test**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\paseo-cli.test.cjs"
paseo agent ls --global --json | ConvertFrom-Json | Select-Object -First 1 | ConvertTo-Json
```

Expected: 测试 PASS；真实命令返回 agent 摘要。此步骤不更新任何名称。

- [ ] **Step 5: transport 能力判断**

若公开 CLI/事件无法提供 `workspaceId` 和 `parentAgentId`，则不得启用自动重名后缀写入，因为无法满足确认的局部作用域。协调器只能进入 `audit` 模式并记录 `capability-blocked: hierarchy-metadata`；等待正式 daemon 事件/API 提供层级字段。

---

### Task 5: 实现协调器、首轮完成门禁和手工锁

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\coordinator.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\coordinator.test.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\config.json`

**Interfaces:**
- Produces:
  - `reconcileOnce(dependencies) -> Promise<ReconcileReport>`
  - `ReconcileReport`: `{ observed, renamed, locked, skipped, blocked, providerQueued }`
- Consumes Task 2、3、4 接口。

- [ ] **Step 1: 写失败测试**

覆盖以下行为：

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileOnce } = require("../coordinator.cjs");

test("renames once after first running-to-idle transition then freezes", async () => {
  const writes = [];
  const state = { version: 1, agents: {
    a1: { agentId: "a1", phase: "waiting_first_turn", previousStatus: "running", titleRevision: 0 }
  }, workspaces: {} };
  const report = await reconcileOnce({
    now: 200,
    state,
    agents: [{ id: "a1", kind: "agent", title: "请帮我分析登录流程", provider: "codex", status: "idle", workspaceId: "w1", parentAgentId: null }],
    candidateFor: () => "审查｜登录流程",
    updateAgentName: async (id, title) => writes.push([id, title])
  });
  assert.deepEqual(writes, [["a1", "审查｜登录流程"]]);
  assert.equal(report.renamed, 1);
  assert.equal(state.agents.a1.phase, "auto_frozen");
});

test("does not overwrite a Paseo manual title", async () => {
  const writes = [];
  const state = { version: 1, agents: {
    a1: { agentId: "a1", phase: "auto_frozen", title: "审查｜登录流程", lastAppliedTitle: "审查｜登录流程", titleRevision: 1 }
  }, workspaces: {} };
  const report = await reconcileOnce({
    now: 300,
    state,
    agents: [{ id: "a1", kind: "agent", title: "验证｜用户手工标题", provider: "codex", status: "idle", workspaceId: "w1", parentAgentId: null }],
    candidateFor: () => "审查｜登录流程",
    updateAgentName: async (id, title) => writes.push([id, title])
  });
  assert.deepEqual(writes, []);
  assert.equal(report.locked, 1);
  assert.equal(state.agents.a1.phase, "manual_locked");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test "C:\Users\PC\.paseo\agent-naming\test\coordinator.test.cjs"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现协调器最小流程**

每轮顺序固定为：

1. 读取 agent 列表和状态。
2. 先执行 `observeTitle`，识别手工锁。
3. 更新 `previousStatus`。
4. 只有 `previousStatus === "running" && status === "idle"` 才认为第一轮完成。
5. `manual_locked` 和 `auto_frozen` 不再生成候选。
6. 调用 `candidateFor(agent)`，经 Task 2 规范化、局部去重后写 Paseo。
7. `markAutoApplied` 并按 provider capability 加入 outbox。
8. 原子保存状态。

`config.json` 初始内容：

```json
{
  "enabled": false,
  "mode": "audit",
  "pollIntervalMs": 5000,
  "maxTitleLength": 24,
  "candidateSource": "agent-first-turn",
  "providerSync": {
    "codex": false,
    "claude": false,
    "grok": false
  }
}
```

默认 `enabled:false` 且 `mode:audit`，防止安装后立即批量修改旧会话。

- [ ] **Step 4: 候选来源的兼容实现**

当前没有确认 daemon 提供首轮语义摘要事件，因此第一阶段使用已存在的 `daemon.appendSystemPrompt` 让 agent 在第一轮结束前生成符合规则的 Paseo 标题。协调器把观察到的合规短标题作为候选并冻结；对于仍是 `hi`、`/resume`、完整提示词的 agent 标记 `blocked:candidate-missing`，不通过简单截断伪造语义名称。

执行阶段应把 `C:\Users\PC\.paseo\config.json` 的 `daemon.appendSystemPrompt` 收敛为：

```text
Paseo 会话命名规则：完成对用户第一条有效请求的首次回答前，根据实际目标为当前 Paseo agent 生成一次名称。主会话使用“动作｜对象”，子代理使用“角色｜交付物”，总长度不超过 24 个字符；不要使用完整提示词、/resume、日期、模型名或供应商名。只在名称仍为客户端自动标题时更新；用户已经在 Paseo 手工命名时不得覆盖。生成成功后不随后续轮次反复改名。
```

修改前必须读取并合并现有 `config.json`，保留 provider、CORS、relay 和其他 daemon 配置。修改配置后不要自行重启 daemon；先向用户说明所有运行中 agent 会被中断并等待明确确认。

- [ ] **Step 5: 运行测试**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\coordinator.test.cjs"
node --test "C:\Users\PC\.paseo\agent-naming\test\*.test.cjs"
```

Expected: 全部 PASS。

---

### Task 6: 验证并实现 Codex `thread/name/set` adapter

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\providers\codex.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\codex.test.cjs`

**Interfaces:**
- Produces:
  - `setCodexThreadName({ threadId, name, spawnImpl }) -> Promise<void>`
  - `processCodexOutbox(record, context) -> Promise<record>`

- [ ] **Step 1: 写 app-server JSONL 顺序测试**

测试使用 fake child process，必须验证顺序：

```text
initialize
initialized
thread/name/set
```

并断言 rename 请求为：

```json
{
  "method": "thread/name/set",
  "id": 2,
  "params": {
    "threadId": "thread-1",
    "name": "配置｜多端会话命名"
  }
}
```

还要覆盖：initialize 失败、rename 返回 error、stdin 提前关闭、相同 revision 不重复调用。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test "C:\Users\PC\.paseo\agent-naming\test\codex.test.cjs"`

Expected: FAIL，adapter 不存在。

- [ ] **Step 3: 实现 JSONL client**

使用 `child_process.spawn("codex", ["app-server", "--stdio"])`，按行解析 stdout JSON。只有收到 initialize 成功响应后发送 `initialized` 通知和 `thread/name/set` 请求；收到 id 2 成功响应后正常关闭 stdin。设置 10 秒总超时，超时终止子进程并保留 outbox。

禁止把 Codex 配置、bearer token 或 app-server stderr 原文写入状态文件。

- [ ] **Step 4: 对一个关闭或专用测试 thread 做真实验证**

先创建专用 Codex 测试 agent，不使用当前主会话。读取其 Paseo 状态中公开可获得的 threadId；若只能从内部 JSON 获得 threadId，则 adapter capability 保持 `unconfirmed`，不得让常驻 sidecar读取内部文件。

真实验证必须确认：

1. app-server 返回 rename 成功；
2. Codex 原生会话列表显示新名称；
3. Paseo agent 名称不被改动；
4. 后续发送一轮消息后名称仍保持；
5. 重复同步同一 revision 不产生第二次写入。

- [ ] **Step 5: capability gate**

只有以上五项全部通过，才把 `capabilities.json` 的 Codex `nativeRename` 改为 `supported`，并允许用户在 `config.json` 中把 `providerSync.codex` 设为 `true`。否则保持 `unconfirmed` 或 `unsupported`。

---

### Task 7: workspace、Claude 和 Grok adapter 保持显式能力降级

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\providers\capabilities.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\test\provider-capabilities.test.cjs`

**Interfaces:**
- Produces: `providerCapability(provider, matrix) -> "supported" | "unsupported" | "unconfirmed"`
- Produces: `workspaceRenameCapability(matrix) -> same enum`

- [ ] **Step 1: 写失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { providerCapability, workspaceRenameCapability } = require("../providers/capabilities.cjs");

test("does not invent Claude or Grok rename support", () => {
  const matrix = {
    workspaceUpdateCli: false,
    providers: {
      codex: { nativeRename: "supported" },
      claude: { nativeRename: "unconfirmed" },
      grok: { nativeRename: "unconfirmed" }
    }
  };
  assert.equal(providerCapability("codex", matrix), "supported");
  assert.equal(providerCapability("claude", matrix), "unconfirmed");
  assert.equal(providerCapability("grok", matrix), "unconfirmed");
  assert.equal(workspaceRenameCapability(matrix), "unconfirmed");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test "C:\Users\PC\.paseo\agent-naming\test\provider-capabilities.test.cjs"`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现显式 capability 返回**

函数只读取能力矩阵，不做猜测。Claude/Grok 为 `unconfirmed` 时，协调器记录 `providerSync.<provider> = "unsupported-for-now"`，不入 outbox、不无限重试。

workspace 同理：当前公开 CLI 没有 rename/update，且未确认正式 daemon API 时，自动 workspace 命名报告为 `capability-blocked: workspace-update`。仍可由当前 Paseo MCP `rename_workspace` 在用户明确操作时手工完成，但不能由独立 sidecar 假装成稳定自动接口。

- [ ] **Step 4: 运行完整测试**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\*.test.cjs"
```

Expected: 全部 PASS；没有测试读取真实 agent JSON、provider token 或用户 prompt。

---

### Task 8: 安装 audit sidecar、灰度启用与端到端验证

**Files:**
- Create: `C:\Users\PC\.paseo\agent-naming\sidecar.cjs`
- Create: `C:\Users\PC\.paseo\agent-naming\start-sidecar.cmd`
- Create: `C:\Users\PC\.paseo\agent-naming\README.md`
- Modify after explicit approval: `C:\Users\PC\.paseo\config.json`

**Interfaces:**
- `sidecar.cjs --once --audit`: 只输出对账报告，不写名称。
- `sidecar.cjs --once --apply`: 执行一次允许的 Paseo agent 更新。
- `sidecar.cjs --watch`: 每 `pollIntervalMs` 对账；使用单实例锁。

- [ ] **Step 1: 实现单实例和命令行模式测试**

增加 `test/sidecar.test.cjs`，覆盖：

- audit 模式不调用 `updateAgentName`；
- apply 模式只更新满足首轮、候选、层级元数据和非锁定条件的 agent；
- 第二实例检测到锁文件中的活动 PID 后退出；
- 进程异常退出后陈旧锁可恢复；
- SIGINT/SIGTERM 清理锁并原子保存状态。

- [ ] **Step 2: 实现 sidecar**

`start-sidecar.cmd`：

```bat
@echo off
"%ProgramFiles%\nodejs\node.exe" "%USERPROFILE%\.paseo\agent-naming\sidecar.cjs" --watch
```

若 Node 不在该路径，执行阶段使用 `(Get-Command node).Source` 写入真实绝对路径，不假设 PATH。

sidecar 日志只允许：时间、agentId 前 8 位、provider、动作、标题修订、错误类别。不得输出 prompt、response、完整 MCP URL 或环境变量。

- [ ] **Step 3: 先运行 audit**

Run:

```powershell
node "C:\Users\PC\.paseo\agent-naming\sidecar.cjs" --once --audit
```

Expected:

- 不修改任何 agent/workspace 名称；
- 报告哪些现有名称合规、哪些明显是客户端自动标题；
- 层级元数据不足时明确显示 blocked，不退化成全局重名判断；
- Claude/Grok 原生同步显示 unsupported-for-now。

- [ ] **Step 4: 用户确认灰度对象后运行 apply**

先只对白名单测试 workspace 启用，不批量处理历史 agent。配置增加：

```json
{
  "enabled": true,
  "mode": "apply",
  "workspaceAllowlist": ["专用测试 workspaceId"]
}
```

该 workspaceId 必须在执行时由用户选择，不能把当前 PaperHot workspace 静默作为测试对象。

- [ ] **Step 5: 端到端验收**

在同一测试 workspace 分别创建 Claude、Codex、Grok agent，首条请求使用可验证目标。逐项确认：

1. 第一轮运行期间保持临时/客户端标题；
2. 第一轮结束后 Paseo 标题符合类型与 24 字限制；
3. 同一层级第二个同名 agent 获得 `#2`；
4. 不同 workspace 同名主会话不加后缀；
5. 在 Paseo 手工改名后，后续三轮不被覆盖；
6. 在 provider 原生窗口改名不反向改变 Paseo；
7. Codex capability 已通过时原生标题最终一致；
8. Claude/Grok 未确认时仍只更新 Paseo；
9. sidecar 重启后不重复编号或改名；
10. state/log 中不含 prompt、token 或 Authorization header。

- [ ] **Step 6: workspace 验收门禁**

只有 capability 矩阵确认正式 workspace update API 后，才增加 workspace 自动命名端到端用例。否则将该成功标准保留为已知阻塞，并继续由 Paseo MCP/界面手工命名，禁止写 `workspaces.json`。

- [ ] **Step 7: 常驻启动选择**

验证通过后再由用户选择 Windows 登录启动方式。优先使用 Paseo 官方 extension/service 生命周期；若没有，只创建当前用户的 Windows Task Scheduler 登录任务。创建计划任务属于外部持久化操作，执行前必须再次取得用户明确确认。

- [ ] **Step 8: 最终验证与记录**

Run:

```powershell
node --test "C:\Users\PC\.paseo\agent-naming\test\*.test.cjs"
git -C "E:\my2\codex-project\paperHot" status --short
```

Expected: 全部命名脚本测试 PASS；PaperHot Git 只包含已批准的设计/计划/README/CHANGELOG 文档，不包含 `~/.paseo` 状态、token、`.playwright-cli/` 或 `output/`。

---

## 计划自审结论

- 本计划覆盖已确认的名称格式、首轮触发、冻结、手工锁、局部重名、单向同步、Codex adapter、Claude/Grok 降级、隐私和重启边界。
- 当前 Paseo 0.2.3 尚未确认正式 lifecycle/WebSocket/workspace update 契约，因此对应功能设置了明确 capability gate，没有用内部 JSON 或 UI 自动化填补空白。
- 第一阶段能可靠交付的是 Paseo agent 名称策略、状态、审计和在层级元数据充足时的安全对账；workspace 自动命名和 Claude/Grok 原生同步必须等待稳定能力。
- 没有新增第三方依赖，也没有把个人 Paseo 状态纳入 PaperHot 数据或备份格式。
