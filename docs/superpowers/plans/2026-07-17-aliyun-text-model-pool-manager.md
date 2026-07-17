# Aliyun Text Model Pool Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a paginated Aliyun text-chat model pool manager with per-model quota bars, per-model tests, automatic enablement after success, greyed unavailable models, and failure-switch hints.

**Architecture:** Extend the existing PaperHot LLM model-pool implementation instead of replacing it. Keep the raw LLM request path in `callConfiguredLlm`, add a curated text-chat registry plus status derivation in `paperhot_backend.cjs`, expose model-pool read/update/test endpoints in `server.cjs`, and render a 25-per-page model-card manager inside the existing Aliyun provider config UI.

**Tech Stack:** Node.js CommonJS backend, browser JavaScript in `public/index.html`, built-in `node:test`, local JSON config and state files.

## Global Constraints

- Only Aliyun Model Studio models that can be used through the existing OpenAI-compatible chat-completions text path.
- Do not automate browser login or scrape the private Aliyun console.
- Exclude embedding, rerank, OCR, image, video, audio, realtime, multimodal-only, tool-specific, agent, workflow, or application-only models.
- Do not claim the local quota estimate is the official Aliyun remaining quota.
- Do not add a user-editable official quota endpoint in this iteration.
- Default quota is `1,000,000` tokens unless a registry entry explicitly overrides it.
- A model becomes unavailable for automatic rotation when local usage reaches 85%, local remaining quota is below 15%, status is exhausted, status is failing, or it is disabled.
- A successful per-model test automatically enables that model for future rotation and clears failure counters.
- The model manager displays 25 models per page in a 5 x 5 grid on desktop, responsive down on narrow screens.
- `data/papers/llm-model-pool-state.json` remains the runtime state file and is exported only when stats are included.
- API keys and request content are never exported through model-pool state.
- Every code or doc change updates `CHANGELOG.md`.
- After backend or frontend service changes, restart fixed port `http://127.0.0.1:50751` and verify runtime APIs.

---

## File Structure

- `paperhot_backend.cjs`
  - Add `ALIYUN_TEXT_MODEL_REGISTRY`, `cleanAliyunTextModelRegistryEntry`, `readAliyunTextModelRegistry`, enhanced status derivation, per-model config patching, per-model testing, and exports.
  - Extend `cleanLlmModelPoolStateEntry` to preserve `lastTestAt`, `lastTestStatus`, and `lastTestMessage`.
  - Update selection so `near_limit`, `exhausted`, `failing`, and disabled models are skipped for rotation.
- `server.cjs`
  - Add `GET /api/integrations/llm/model-pool`.
  - Add `POST /api/integrations/llm/model-pool/test`.
  - Add `POST /api/integrations/llm/model-pool/model`.
  - Keep existing reset route.
- `public/index.html`
  - Replace the small Aliyun model-pool list with a model-card manager, quota bars, pagination, test buttons, and greyed states.
  - Keep existing integration config save flow and stats page.
- `config/llm.example.json`
  - Expand Aliyun `modelPool.models` to the curated text-chat registry subset and keep defaults conservative.
- `test/paperhot_backend.test.cjs`
  - Add backend tests for registry filtering, status derivation, selection skips, model config patching, and per-model tests.
- `test/paperhot_frontend.test.cjs`
  - Add static frontend tests for 25-per-page model cards, quota bars, greyed cards, repeated-failure hints, and per-model test endpoint use.
- `README.md`
  - Document text-only model eligibility, local quota bars, and per-model testing.
- `CHANGELOG.md`
  - Record feature, configuration/data behavior, docs, and tests in `未发布`.

---

### Task 1: Text Model Registry And Status Rules

**Files:**
- Modify: `paperhot_backend.cjs`
- Modify: `config/llm.example.json`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: existing `cleanLlmModelPool`, `cleanLlmModelPoolStateEntry`, `modelPoolStatusForModel`, `selectLlmPoolModel`, `readLlmModelPoolStatus`.
- Produces:
  - `readAliyunTextModelRegistry(): Array<{ model, displayName, family, enabled, freeQuotaTokens, priority, source, notes }>`
  - `cleanAliyunTextModelRegistryEntry(value, index)`
  - enhanced `modelPoolStatusForModel(modelConfig, stateEntry, pool): "available" | "near_limit" | "exhausted" | "failing" | "disabled"`
  - enhanced `readLlmModelPoolStatus(options)` rows with `usageRatio`, `remainingRatio`, `selectable`, `greyed`, `statusLabel`, and test fields.

- [ ] **Step 1: Add failing backend tests for registry and derived status**

Add these tests near the existing LLM model pool tests in `test/paperhot_backend.test.cjs`:

```js
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
```

Also add these imports at the top of the test file:

```js
  readAliyunTextModelRegistry,
  readLlmModelPoolStatus,
```

- [ ] **Step 2: Run tests to confirm RED**

Run:

```powershell
node --test --test-name-pattern "aliyun text model registry|greys out|selection skips" test\paperhot_backend.test.cjs
```

Expected: FAIL with `readAliyunTextModelRegistry is not a function` or missing `greyed/selectable/failureHint`.

- [ ] **Step 3: Add curated registry constants and cleaners**

In `paperhot_backend.cjs`, near `DEFAULT_ALIYUN_MODEL_POOL_MODELS`, add a registry with at least 25 text-chat-compatible entries. Use this exact starter list:

```js
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
  enabled: index < DEFAULT_ALIYUN_MODEL_POOL_MODELS.length,
  freeQuotaTokens: 1000000,
  priority: (index + 1) * 10,
  source: "aliyun-modelstudio-text-generation",
  notes: "Text chat model for PaperHot summary and recommendation prompts."
}));
```

Add:

```js
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
```

- [ ] **Step 4: Merge registry into default model pool**

Change `DEFAULT_ALIYUN_MODEL_POOL.models` so it derives from the registry while preserving the existing seven enabled defaults:

```js
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
```

Extend `cleanLlmModelPoolEntry` so it preserves `displayName`, `family`, `source`, and `notes`:

```js
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
```

- [ ] **Step 5: Extend state cleaning and derived status**

In `cleanLlmModelPoolStateEntry`, add:

```js
lastTestAt: compactText(value.lastTestAt),
lastTestStatus: ["passed", "failed", ""].includes(value.lastTestStatus) ? compactText(value.lastTestStatus) : "",
lastTestMessage: compactText(value.lastTestMessage)
```

Update `modelPoolStatusForModel`:

```js
function modelPoolStatusForModel(modelConfig, stateEntry = {}, pool = DEFAULT_ALIYUN_MODEL_POOL) {
  if (!modelConfig.enabled) return "disabled";
  const used = Number(stateEntry.localUsedTokens || 0);
  const quota = Number(modelConfig.freeQuotaTokens || 1000000);
  const threshold = quota * Number(pool.quotaSwitchRatio || DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio);
  if (stateEntry.status === "exhausted" || used >= quota) return "exhausted";
  if (stateEntry.status === "failing") return "failing";
  if (used >= threshold) return "near_limit";
  return "available";
}
```

Update `selectLlmPoolModel` so it uses `modelPoolStatusForModel(model, entry, cleanPool)` and blocks every status except `available`.

- [ ] **Step 6: Extend `readLlmModelPoolStatus` rows**

In `readLlmModelPoolStatus`, merge registry rows with saved pool rows:

```js
const registry = readAliyunTextModelRegistry();
const savedRows = new Map(pool.models.map(item => [item.model, item]));
const allModels = registry.map(item => ({ ...item, ...(savedRows.get(item.model) || {}) }));
```

For each model row, return:

```js
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
```

Add helper:

```js
function llmModelPoolStatusLabel(status) {
  if (status === "near_limit") return "低于 15%";
  if (status === "exhausted") return "已用尽";
  if (status === "failing") return "响应失败";
  if (status === "disabled") return "未启用";
  return "额度充足";
}
```

- [ ] **Step 7: Export new functions and update example config**

Add to `module.exports`:

```js
readAliyunTextModelRegistry,
cleanAliyunTextModelRegistryEntry,
```

In `config/llm.example.json`, expand the Aliyun `modelPool.models` list to match the registry starter list from Step 3. Keep only the original seven models enabled by default; set all other `enabled` values to `false`.

- [ ] **Step 8: Run Task 1 verification**

Run:

```powershell
node --test --test-name-pattern "aliyun text model registry|greys out|selection skips|llm config includes a cleaned aliyun" test\paperhot_backend.test.cjs
node --check paperhot_backend.cjs
```

Expected: all targeted tests pass and syntax check succeeds.

- [ ] **Step 9: Commit Task 1**

Run:

```powershell
git add paperhot_backend.cjs config\llm.example.json test\paperhot_backend.test.cjs
git commit -m "feat: add aliyun text model registry"
```

---

### Task 2: Per-Model Update And Test API

**Files:**
- Modify: `paperhot_backend.cjs`
- Modify: `server.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes:
  - `readAliyunTextModelRegistry()`
  - `readLlmModelPoolStatus(options)`
  - `readLlmConfig(configFile)`
  - `writeIntegrationConfigs(payload, options)`
  - `callConfiguredLlm({ paper, userBackground, config, fetchImpl })`
- Produces:
  - `updateLlmModelPoolModel(model, patch, options): Promise<{ ok: true, status }>`
  - `testLlmPoolModel(model, options): Promise<{ ok: boolean, model, enabled, tokenUsage, status }>`
  - routes `/api/integrations/llm/model-pool`, `/api/integrations/llm/model-pool/test`, `/api/integrations/llm/model-pool/model`

- [ ] **Step 1: Add failing backend tests for update and per-model test**

Add these tests near the existing model-pool tests:

```js
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
  assert.equal(state.models["qwen-flash"].lastTestStatus, "passed");
  assert.equal(state.models["qwen-flash"].consecutiveFailures, 0);
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
  assert.equal(state.models["qwen-flash"].lastTestStatus, "failed");
  assert.equal(state.models["qwen-flash"].consecutiveFailures, 1);
  await fs.rm(tempDir, { recursive: true, force: true });
});
```

Add imports:

```js
  updateLlmModelPoolModel,
  testLlmPoolModel,
```

- [ ] **Step 2: Run tests to confirm RED**

Run:

```powershell
node --test --test-name-pattern "updates one aliyun|per-model aliyun test" test\paperhot_backend.test.cjs
```

Expected: FAIL with missing exported functions.

- [ ] **Step 3: Implement `updateLlmModelPoolModel`**

In `paperhot_backend.cjs`, add helper functions near `readLlmModelPoolStatus`:

```js
function activeAliyunProviderFromConfig(config = {}) {
  return (config.providers || []).find(item => item.id === config.activeProviderId && item.provider === "aliyun-modelstudio")
    || (config.providers || []).find(item => item.provider === "aliyun-modelstudio")
    || null;
}

function patchLlmPoolModel(pool = DEFAULT_ALIYUN_MODEL_POOL, model, patch = {}) {
  const cleanModel = compactText(model);
  const registryEntry = readAliyunTextModelRegistry().find(item => item.model === cleanModel) || { model: cleanModel, displayName: cleanModel, family: "Aliyun Text", priority: 9990, freeQuotaTokens: 1000000 };
  const cleanPool = cleanLlmModelPool(pool);
  const rows = new Map(cleanPool.models.map(item => [item.model, item]));
  const current = rows.get(cleanModel) || registryEntry;
  rows.set(cleanModel, cleanLlmModelPoolEntry({
    ...current,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    freeQuotaTokens: patch.freeQuotaTokens === undefined ? current.freeQuotaTokens : Number(patch.freeQuotaTokens)
  }, rows.size));
  return { ...cleanPool, models: [...rows.values()].filter(Boolean).sort((left, right) => left.priority - right.priority) };
}

async function updateLlmModelPoolModel(model, patch = {}, options = {}) {
  const cleanModel = compactText(model);
  if (!cleanModel) throw new Error("模型名称不能为空");
  const configFile = options.llmConfigFile || options.configFile || LLM_CONFIG_FILE;
  const config = await readLlmConfig(configFile);
  const provider = activeAliyunProviderFromConfig(config);
  if (!provider) throw new Error("未找到阿里百炼 LLM 配置");
  provider.modelPool = patchLlmPoolModel(provider.modelPool, cleanModel, patch);
  await writeJsonFile(configFile, cleanLlmConfig(config));
  return { ok: true, status: await readLlmModelPoolStatus({ ...options, llmConfigFile: configFile }) };
}
```

- [ ] **Step 4: Implement `testLlmPoolModel`**

Add:

```js
async function testLlmPoolModel(model, options = {}) {
  const cleanModel = compactText(model);
  if (!cleanModel) throw new Error("模型名称不能为空");
  const configFile = options.llmConfigFile || options.configFile || LLM_CONFIG_FILE;
  const dataDir = options.dataDir || DATA_DIR;
  const config = await readLlmConfig(configFile);
  const provider = activeAliyunProviderFromConfig(config);
  if (!provider) throw new Error("未找到阿里百炼 LLM 配置");
  if (!provider.endpoint) throw new Error("LLM Endpoint 未填写");
  if (!provider.apiKey && provider.apiMode !== "local") throw new Error("LLM API 密钥未填写");
  const state = await readLlmModelPoolState(dataDir);
  const previous = state.models[cleanModel] || {};
  try {
    const insight = await callConfiguredLlm({
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
    const usage = insight?.tokenUsage || {};
    state.models[cleanModel] = cleanLlmModelPoolStateEntry({
      ...previous,
      model: cleanModel,
      status: "available",
      localUsedTokens: Number(previous.localUsedTokens || 0) + Number(usage.total || 0),
      consecutiveFailures: 0,
      lastSuccessAt: new Date().toISOString(),
      lastTestAt: new Date().toISOString(),
      lastTestStatus: "passed",
      lastTestMessage: "测试成功"
    });
    await writeLlmModelPoolState(state, dataDir);
    await updateLlmModelPoolModel(cleanModel, { enabled: true }, { ...options, llmConfigFile: configFile, dataDir });
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
    return { ok: true, model: cleanModel, enabled: true, tokenUsage: usage, status: await readLlmModelPoolStatus({ ...options, llmConfigFile: configFile, dataDir }) };
  } catch (error) {
    const consecutiveFailures = Number(previous.consecutiveFailures || 0) + (isRetryableLlmModelFailure(error) ? 1 : 0);
    state.models[cleanModel] = cleanLlmModelPoolStateEntry({
      ...previous,
      model: cleanModel,
      status: consecutiveFailures >= Number((provider.modelPool || {}).failureSwitchThreshold || DEFAULT_ALIYUN_MODEL_POOL.failureSwitchThreshold) ? "failing" : previous.status,
      consecutiveFailures,
      lastFailureAt: new Date().toISOString(),
      lastFailureMessage: error.message,
      lastTestAt: new Date().toISOString(),
      lastTestStatus: "failed",
      lastTestMessage: error.message
    });
    await writeLlmModelPoolState(state, dataDir);
    await appendOperationLogSafe({
      action: "test",
      operation: "llm-model-pool-test",
      model: cleanModel,
      result: "failed",
      error: error.message
    }, dataDir);
    return { ok: false, model: cleanModel, enabled: false, error: error.message, status: await readLlmModelPoolStatus({ ...options, llmConfigFile: configFile, dataDir }) };
  }
}
```

- [ ] **Step 5: Export new backend functions**

Add to `module.exports`:

```js
updateLlmModelPoolModel,
testLlmPoolModel,
```

- [ ] **Step 6: Add server routes**

In `server.cjs`, import:

```js
  readLlmModelPoolStatus,
  testLlmPoolModel,
  updateLlmModelPoolModel,
```

Add routes near the existing LLM test/reset endpoints:

```js
if (req.method === "GET" && pathname === "/api/integrations/llm/model-pool") {
  sendJson(res, 200, { ok: true, modelPool: await readLlmModelPoolStatus() });
  return true;
}

if (req.method === "POST" && pathname === "/api/integrations/llm/model-pool/test") {
  const body = await collectRequestBody(req);
  try {
    sendJson(res, 200, await testLlmPoolModel(body.model));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
  return true;
}

if (req.method === "POST" && pathname === "/api/integrations/llm/model-pool/model") {
  const body = await collectRequestBody(req);
  try {
    sendJson(res, 200, await updateLlmModelPoolModel(body.model, body));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
  return true;
}
```

- [ ] **Step 7: Run Task 2 verification**

Run:

```powershell
node --test --test-name-pattern "updates one aliyun|per-model aliyun test" test\paperhot_backend.test.cjs
node --check paperhot_backend.cjs
node --check server.cjs
```

Expected: all targeted tests pass and both syntax checks succeed.

- [ ] **Step 8: Commit Task 2**

Run:

```powershell
git add paperhot_backend.cjs server.cjs test\paperhot_backend.test.cjs
git commit -m "feat: test aliyun pool models individually"
```

---

### Task 3: Paginated Model Manager UI

**Files:**
- Modify: `public/index.html`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes:
  - `GET /api/integrations/llm/model-pool`
  - `POST /api/integrations/llm/model-pool/test`
  - `POST /api/integrations/llm/model-pool/model`
  - existing `renderLlmModelPoolConfig(provider)`
- Produces:
  - `const llmModelPoolPageSize = 25`
  - `let llmModelPoolPage = 0`
  - `renderLlmModelPoolManager(provider)`
  - `llmModelPoolCard(model)`
  - `bindLlmModelPoolManager()`
  - `testOneLlmPoolModel(model)`
  - `updateOneLlmPoolModel(model, patch)`

- [ ] **Step 1: Add failing frontend tests**

Add these tests near the existing Aliyun frontend tests in `test/paperhot_frontend.test.cjs`:

```js
test("aliyun model pool manager renders quota bars test buttons and pagination", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /const llmModelPoolPageSize = 25/);
  assert.match(html, /function renderLlmModelPoolManager/);
  assert.match(html, /function llmModelPoolCard/);
  assert.match(html, /class="llm-pool-grid"/);
  assert.match(html, /class="llm-pool-quota-bar"/);
  assert.match(html, /data-llm-pool-test-model/);
  assert.match(html, /data-llm-pool-page="next"/);
  assert.match(html, /5 x 5/);
});

test("aliyun model pool manager greys unavailable cards and shows repeated failure hints", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /model\.greyed \? "greyed" : ""/);
  assert.match(html, /disabled=\$\{model\.selectable \? "" : "disabled"\}/);
  assert.match(html, /上次因连续失败切换/);
  assert.match(html, /PaperHot 本地估算/);
});

test("aliyun model pool manager calls per-model test and update endpoints", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /\/api\/integrations\/llm\/model-pool\/test/);
  assert.match(html, /\/api\/integrations\/llm\/model-pool\/model/);
  assert.match(html, /testOneLlmPoolModel/);
  assert.match(html, /updateOneLlmPoolModel/);
});
```

- [ ] **Step 2: Run tests to confirm RED**

Run:

```powershell
node --test --test-name-pattern "aliyun model pool manager" test\paperhot_frontend.test.cjs
```

Expected: FAIL because manager functions and CSS do not exist.

- [ ] **Step 3: Add CSS for grid, cards, quota bars, and pagination**

In `public/index.html` near existing `.llm-model-pool-*` styles, add:

```css
.llm-pool-manager { display: grid; gap: 10px; }
.llm-pool-manager-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}
.llm-pool-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.llm-pool-card {
  display: grid;
  gap: 7px;
  min-height: 148px;
  padding: 9px;
  border: 1px solid #dfe8ee;
  border-radius: 8px;
  background: #fff;
  color: #27364c;
}
.llm-pool-card.greyed {
  background: #f2f4f6;
  color: #8794a4;
  opacity: 0.72;
}
.llm-pool-card-title { display: grid; gap: 2px; min-width: 0; }
.llm-pool-card-title strong { font-size: 12px; overflow-wrap: anywhere; }
.llm-pool-card-title span { color: #718195; font-size: 10px; overflow-wrap: anywhere; }
.llm-pool-quota-bar {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7edf2;
}
.llm-pool-quota-fill {
  height: 100%;
  border-radius: inherit;
  background: #12a5b8;
}
.llm-pool-card.greyed .llm-pool-quota-fill { background: #9aa7b4; }
.llm-pool-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.llm-pool-card-actions button { height: 26px; padding: 0 8px; border-radius: 7px; font-size: 11px; }
.llm-pool-pager { display: flex; justify-content: flex-end; gap: 8px; align-items: center; }
@media (max-width: 1200px) { .llm-pool-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 720px) { .llm-pool-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Add frontend state and rendering functions**

Near `let expandedLlmProviderId = "";`, add:

```js
const llmModelPoolPageSize = 25;
let llmModelPoolPage = 0;
let llmModelPoolStatus = null;
let llmModelPoolMessage = "";
```

Replace `renderLlmModelPoolConfig(provider)` with:

```js
function modelPoolRowsForProvider(provider) {
  const statusRows = Array.isArray(llmModelPoolStatus?.models) ? llmModelPoolStatus.models : [];
  if (statusRows.length) return statusRows;
  const pool = provider.modelPool || defaultAliyunModelPool;
  return Array.isArray(pool.models) ? pool.models.map(model => ({
    ...model,
    displayName: model.displayName || model.model,
    family: model.family || "Aliyun Text",
    localUsedTokens: 0,
    estimatedRemainingTokens: model.freeQuotaTokens || 1000000,
    usageRatio: 0,
    statusLabel: model.enabled === false ? "未启用" : "额度充足",
    selectable: model.enabled !== false,
    greyed: model.enabled === false,
    failureHint: ""
  })) : [];
}

function llmModelPoolCard(model) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(model.usageRatio || 0) * 100)));
  return `
    <article class="llm-pool-card ${model.greyed ? "greyed" : ""}" data-llm-pool-card="${escapeHTML(model.model)}">
      <div class="llm-pool-card-title">
        <strong>${escapeHTML(model.displayName || model.model)}</strong>
        <span>${escapeHTML(model.model)}</span>
      </div>
      <span class="tag">${escapeHTML(model.family || "Aliyun Text")}</span>
      <div class="llm-pool-quota-bar" title="PaperHot 本地估算：已用 ${escapeHTML(percent)}%">
        <div class="llm-pool-quota-fill" style="width:${Math.max(2, percent)}%"></div>
      </div>
      <div class="small-text">剩余 ${formatToken(model.estimatedRemainingTokens || 0)} / 已用 ${formatToken(model.localUsedTokens || 0)}</div>
      <div class="small-text">${escapeHTML(model.statusLabel || "额度充足")}${model.failureHint ? ` · ${escapeHTML(model.failureHint || "上次因连续失败切换")}` : ""}</div>
      <div class="llm-pool-card-actions">
        <button class="ghost-btn" type="button" data-llm-pool-enable-model="${escapeHTML(model.model)}" disabled=${model.selectable ? "" : "disabled"}>${model.enabled ? "已启用" : "启用"}</button>
        <button class="ghost-btn" type="button" data-llm-pool-test-model="${escapeHTML(model.model)}">测试</button>
      </div>
    </article>
  `;
}

function renderLlmModelPoolManager(provider) {
  if (provider.provider !== "aliyun-modelstudio") return "";
  const rows = modelPoolRowsForProvider(provider);
  const pageCount = Math.max(1, Math.ceil(rows.length / llmModelPoolPageSize));
  llmModelPoolPage = Math.max(0, Math.min(llmModelPoolPage, pageCount - 1));
  const start = llmModelPoolPage * llmModelPoolPageSize;
  const pageRows = rows.slice(start, start + llmModelPoolPageSize);
  return `
    <div class="wos-usage-panel llm-pool-manager" data-llm-model-pool="${escapeHTML(provider.id)}">
      <div class="llm-pool-manager-head">
        <div>
          <strong>百炼文本模型池</strong>
          <div class="small-text">5 x 5；只显示兼容文本对话的模型。额度条是 PaperHot 本地估算。</div>
        </div>
        <div class="llm-pool-pager">
          <button class="ghost-btn" type="button" data-llm-pool-page="prev" ${llmModelPoolPage <= 0 ? "disabled" : ""}>上一页</button>
          <span class="small-text">${llmModelPoolPage + 1} / ${pageCount}</span>
          <button class="ghost-btn" type="button" data-llm-pool-page="next" ${llmModelPoolPage >= pageCount - 1 ? "disabled" : ""}>下一页</button>
        </div>
      </div>
      <div class="llm-pool-grid">${pageRows.map(llmModelPoolCard).join("")}</div>
      <div class="small-text">${escapeHTML(llmModelPoolMessage || "测试成功会自动启用模型；低于 15% 剩余额度或连续失败后会灰掉并跳过。")}</div>
    </div>
  `;
}
```

Then change the provider body insertion from:

```js
${renderLlmModelPoolConfig(provider)}
```

to:

```js
${renderLlmModelPoolManager(provider)}
```

- [ ] **Step 5: Add load, update, and test helpers**

Near `loadIntegrationConfig`, add:

```js
async function loadLlmModelPoolStatus() {
  if (location.protocol === "file:") return;
  try {
    const response = await fetch("/api/integrations/llm/model-pool");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    llmModelPoolStatus = payload.modelPool || null;
  } catch (error) {
    llmModelPoolMessage = `模型池状态暂不可用：${error.message}`;
  }
}

async function updateOneLlmPoolModel(model, patch) {
  const response = await fetch("/api/integrations/llm/model-pool/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, ...patch })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
  llmModelPoolStatus = payload.status || null;
  llmModelPoolMessage = `${model} 已更新`;
}

async function testOneLlmPoolModel(model) {
  llmModelPoolMessage = `正在测试 ${model}...`;
  renderIntegrationConfig();
  bindIntegrationConfig();
  const response = await fetch("/api/integrations/llm/model-pool/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  llmModelPoolStatus = payload.status || null;
  llmModelPoolMessage = payload.ok ? `${model} 测试成功，已自动启用` : `${model} 测试失败：${payload.error || "模型未响应"}`;
}
```

In `loadIntegrationConfig`, after `applyIntegrationState(await response.json())`, add:

```js
await loadLlmModelPoolStatus();
```

- [ ] **Step 6: Bind manager controls**

Add:

```js
function bindLlmModelPoolManager() {
  document.querySelectorAll("[data-llm-pool-page]").forEach(button => {
    button.addEventListener("click", () => {
      const direction = button.getAttribute("data-llm-pool-page");
      llmModelPoolPage += direction === "next" ? 1 : -1;
      renderIntegrationConfig();
      bindIntegrationConfig();
    });
  });
  document.querySelectorAll("[data-llm-pool-enable-model]").forEach(button => {
    button.addEventListener("click", async () => {
      const model = button.getAttribute("data-llm-pool-enable-model");
      button.disabled = true;
      try {
        await updateOneLlmPoolModel(model, { enabled: true });
      } catch (error) {
        llmModelPoolMessage = `启用失败：${error.message}`;
      }
      renderIntegrationConfig();
      bindIntegrationConfig();
    });
  });
  document.querySelectorAll("[data-llm-pool-test-model]").forEach(button => {
    button.addEventListener("click", async () => {
      const model = button.getAttribute("data-llm-pool-test-model");
      button.disabled = true;
      try {
        await testOneLlmPoolModel(model);
      } catch (error) {
        llmModelPoolMessage = `测试失败：${error.message}`;
      }
      renderIntegrationConfig();
      bindIntegrationConfig();
    });
  });
}
```

In `bindIntegrationConfig()`, add:

```js
bindLlmModelPoolManager();
```

- [ ] **Step 7: Keep serialization compatible**

Update `readActiveLlmProvider(provider)` so it no longer depends on visible inputs for all model-pool rows. Keep this existing block, but make sure it only patches visible rows and does not drop hidden pages:

```js
if (provider.modelPool) {
  const pool = JSON.parse(JSON.stringify(provider.modelPool));
  const rows = new Map((pool.models || []).map(item => [item.model, { ...item }]));
  body.querySelectorAll("[data-llm-pool-model]").forEach(input => {
    const model = input.getAttribute("data-llm-pool-model");
    const field = input.getAttribute("data-llm-pool-field");
    const row = rows.get(model) || { model, enabled: true, freeQuotaTokens: 1000000 };
    row[field] = input.type === "checkbox" ? input.checked : Number(input.value);
    rows.set(model, row);
  });
  next.modelPool = { ...pool, models: [...rows.values()] };
}
```

If the old checkbox/number controls are removed, this block can remain harmless because it finds no `[data-llm-pool-model]` inputs and preserves `provider.modelPool`.

- [ ] **Step 8: Run Task 3 verification**

Run:

```powershell
node --test --test-name-pattern "aliyun model pool manager|config page exposes aliyun|token stats page exposes aliyun" test\paperhot_frontend.test.cjs
node --check server.cjs
```

Expected: all targeted frontend tests pass and syntax check succeeds.

- [ ] **Step 9: Commit Task 3**

Run:

```powershell
git add public\index.html test\paperhot_frontend.test.cjs
git commit -m "feat: add aliyun model pool manager UI"
```

---

### Task 4: Documentation, Full Verification, And Runtime Restart

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Verify: `paperhot_backend.cjs`
- Verify: `server.cjs`

**Interfaces:**
- Consumes:
  - All functions and routes from Tasks 1-3.
- Produces:
  - Updated user docs and verified fixed-port runtime.

- [ ] **Step 1: Update README user documentation**

In `README.md`, update the existing Aliyun model-pool bullet under web configuration to:

```markdown
- 阿里百炼模型池只启用兼容文本对话 / Chat Completions 的模型；配置页以 5 x 5 分页卡片展示模型、PaperHot 本地剩余额度条和单模型测试按钮。测试成功会自动启用模型；已用达到 85%、剩余低于 15%、已用尽或连续失败的模型会灰掉并从自动轮换中跳过。
```

In the statistics section, update the model-pool bullet to:

```markdown
- 显示阿里百炼模型池当前模型、各模型本地已用 Token、估算剩余额度、连续失败次数和“上次因连续失败切换”提示，并可重置 PaperHot 本地估算；重置不会恢复阿里云真实免费额度。
```

- [ ] **Step 2: Update CHANGELOG**

In `CHANGELOG.md` `未发布`:

Under `新增功能`, add:

```markdown
- 阿里百炼配置页新增文本模型池管理器，以 25 个模型一页展示兼容文本对话模型，每个模型都有 PaperHot 本地剩余额度条、单模型测试按钮和启用状态；测试成功会自动加入轮换池。
```

Under `功能优化`, add:

```markdown
- 阿里百炼自动切换只选择已启用、兼容文本对话、未达到 85% 本地额度阈值、未用尽且未连续失败的模型；低额度或失败模型会灰度显示并跳过。
```

Under `测试与验证`, add:

```markdown
- 增加阿里百炼文本模型注册表、状态派生、单模型测试、模型池 API、分页卡片、额度条、灰度不可选和连续失败提示的前后端回归测试。
```

- [ ] **Step 3: Run full automated checks**

Run:

```powershell
npm test
node --check paperhot_backend.cjs
node --check server.cjs
```

Expected:

- `npm test` exits 0.
- `node --check paperhot_backend.cjs` exits 0.
- `node --check server.cjs` exits 0.

- [ ] **Step 4: Restart fixed PaperHot port**

Warn before restart:

```text
正在重启 PaperHot 固定端口 50751；正在进行中的抓取请求会被中断，已写入磁盘的 archive.json、fetch-log.json 和 operation-log.jsonl 不会因正常重启丢失。
```

Run in PowerShell with normal user permissions:

```powershell
$port = 50751
$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
$owners = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($ownerPid in $owners) {
  if ($ownerPid) { Stop-Process -Id $ownerPid -Force }
}
Start-Sleep -Milliseconds 500
Start-Process -FilePath node -ArgumentList @('server.cjs','--port','50751') -WorkingDirectory 'E:\my2\codex-project\paperHot' -WindowStyle Hidden
Start-Sleep -Milliseconds 1200
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1 -Property OwningProcess,LocalAddress,LocalPort
```

Expected: one listener on `127.0.0.1:50751` with a new Node PID.

- [ ] **Step 5: Verify runtime APIs and data write permissions**

Run:

```powershell
$port = 50751
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
$proc = Get-Process -Id $conn.OwningProcess
$backend = Get-Item -LiteralPath 'paperhot_backend.cjs'
$server = Get-Item -LiteralPath 'server.cjs'
$config = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:50751/api/integrations/config' -TimeoutSec 5
$stats = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:50751/api/token/stats' -TimeoutSec 5
$pool = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:50751/api/integrations/llm/model-pool' -TimeoutSec 5
$cursor = 'data\papers\recent-fetch-cursors.json'
if (!(Test-Path -LiteralPath $cursor)) {
  New-Item -ItemType File -Path $cursor -Force | Out-Null
  Set-Content -LiteralPath $cursor -Value '{"tasks":{}}' -Encoding UTF8
}
$fd = [System.IO.File]::Open((Resolve-Path -LiteralPath $cursor), [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
$fd.Close()
$poolText = $pool.Content
[pscustomobject]@{
  Pid=$proc.Id
  StartTime=$proc.StartTime
  BackendWriteTime=$backend.LastWriteTime
  ServerWriteTime=$server.LastWriteTime
  ConfigStatus=$config.StatusCode
  StatsStatus=$stats.StatusCode
  PoolStatus=$pool.StatusCode
  PoolHasRows=$poolText.Contains('"models"')
  CursorWritable=$true
}
```

Expected:

- `StartTime` is later than `BackendWriteTime` and `ServerWriteTime`.
- `ConfigStatus`, `StatsStatus`, and `PoolStatus` are `200`.
- `PoolHasRows` is `True`.
- `CursorWritable` is `True`.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add README.md CHANGELOG.md
git commit -m "docs: document aliyun text model pool manager"
```

If code fixes were needed during full verification, include only the related files in the same commit and mention the verification in the final response.

- [ ] **Step 7: Final git status**

Run:

```powershell
git status --short --branch
```

Expected: clean worktree on `codex/paperofsearch`.
