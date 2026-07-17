# Aliyun LLM Model Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Aliyun Model Studio text model pool that switches models at 85% local free-quota usage or after repeated retryable failures, with visible status and logs.

**Architecture:** Keep the feature inside the existing PaperHot LLM integration path. Store static model-pool configuration in `config/llm.json`, store mutable runtime usage in `data/papers/llm-model-pool-state.json`, choose the actual model immediately before each LLM request, and expose the same state through existing integration and token-stats APIs.

**Tech Stack:** Node.js CommonJS backend, browser JavaScript in `public/index.html`, built-in `node:test`, local JSON files.

## Global Constraints

- Official quota data is preferred when a supported API or configured endpoint is available; otherwise PaperHot falls back to conservative local token accounting based on successful LLM responses.
- Do not automate browser login to the Alibaba console.
- Do not add a brittle scraper for private console frontend state.
- Do not include image, OCR, realtime audio, or multimodal-only models in the default PaperHot text-summary pool.
- Do not export API keys or private quota data unless the existing explicit secrets export option is selected.
- Default models: `qwen-plus`, `qwen-flash`, `qwen-turbo`, `qwen-long`, `qwen3.5-flash`, `qwen3.7-plus`, `qwen3-coder-plus`.
- Each default model uses `1,000,000` free tokens and `0.85` switch ratio.
- Use `3` consecutive retryable failures as the default switch threshold.
- Do not expose a user-editable official quota endpoint in the first implementation.
- Do not auto-recover a `failing` model by cooldown in the first implementation; provide manual reset first.
- Every code change updates `CHANGELOG.md`; runtime state/export behavior changes also update `BACKUP_FORMAT.md` if import/export content changes.

---

## File Structure

- `paperhot_backend.cjs`: Add model-pool defaults, config cleaning, runtime state read/write, selection, usage accounting, failure handling, export/stats integration, and backend exports for tests.
- `server.cjs`: Add a reset endpoint for one model's local state.
- `public/index.html`: Render model-pool configuration and stats panels, serialize model-pool config, call reset endpoint, and show clear reset copy.
- `test/paperhot_backend.test.cjs`: Cover selection, switching, retry/failure classification, operation logs, and export boundaries.
- `test/paperhot_frontend.test.cjs`: Cover model-pool UI in config and stats pages.
- `config/llm.example.json`: Add the default Aliyun model-pool block to the example provider.
- `BACKUP_FORMAT.md`: Document that `llm-model-pool-state.json` is exported only when stats are included.
- `README.md`: Document model-pool behavior and local state.
- `CHANGELOG.md`: Record feature, configuration/data, docs, and test changes.

---

### Task 1: Model Pool Config And Runtime State

**Files:**
- Modify: `paperhot_backend.cjs`
- Modify: `config/llm.example.json`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces: `DEFAULT_ALIYUN_MODEL_POOL`, `cleanLlmModelPool(value)`, `readLlmModelPoolState(dataDir)`, `writeLlmModelPoolState(state, dataDir)`, `modelPoolStatusForModel(modelConfig, stateEntry, pool)`.
- Consumes: existing `readJsonFile`, `writeJsonFile`, `cleanLlmConfig`, `maskSecretConfig`, `readIntegrationConfigs`.

- [ ] **Step 1: Add failing backend tests for config cleaning and state defaults**

Add this test near the current LLM config tests in `test/paperhot_backend.test.cjs`:

```js
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
  assert.equal(pool.quotaSwitchRatio, 0.99);
  assert.equal(pool.failureSwitchThreshold, 3);
  assert.deepEqual(pool.models.map(item => item.model), ["qwen-flash", "qwen-plus"]);
  assert.equal(pool.models[0].freeQuotaTokens, 1000000);
});

test("llm model pool state defaults to empty model records", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-state-"));
  const state = await readLlmModelPoolState(tempDir);
  assert.deepEqual(state.models, {});
  assert.equal(state.format, "paperhot-llm-model-pool-state");
});
```

Run: `node --test test\paperhot_backend.test.cjs --test-name-pattern "llm .*model pool"`

Expected: FAIL because `modelPool` cleaning and `readLlmModelPoolState` do not exist.

- [ ] **Step 2: Add backend defaults and cleaners**

In `paperhot_backend.cjs`, add constants near `DEFAULT_LLM_CONFIG`:

```js
const LLM_MODEL_POOL_STATE_NAME = "llm-model-pool-state.json";
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
const DEFAULT_ALIYUN_MODEL_POOL = {
  quotaMode: "official-first",
  quotaFallback: "local",
  quotaSwitchRatio: 0.85,
  failureSwitchThreshold: 3,
  models: DEFAULT_ALIYUN_MODEL_POOL_MODELS.map((model, index) => ({
    model,
    enabled: true,
    freeQuotaTokens: 1000000,
    priority: (index + 1) * 10
  }))
};
```

Add helpers before `cleanLlmProvider`:

```js
function cleanLlmModelPoolEntry(value = {}, index = 0) {
  const model = compactText(value.model);
  if (!model) return null;
  const quota = Number(value.freeQuotaTokens);
  const priority = Number(value.priority);
  return {
    model,
    enabled: value.enabled !== false,
    freeQuotaTokens: Number.isFinite(quota) && quota > 0 ? Math.round(quota) : 1000000,
    priority: Number.isFinite(priority) ? priority : (index + 1) * 10
  };
}

function cleanLlmModelPool(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const ratio = Number(input.quotaSwitchRatio);
  const failureSwitchThreshold = Number(input.failureSwitchThreshold);
  const sourceModels = Array.isArray(input.models) && input.models.length
    ? input.models
    : DEFAULT_ALIYUN_MODEL_POOL.models;
  const seen = new Set();
  const models = sourceModels
    .map((item, index) => cleanLlmModelPoolEntry(item, index))
    .filter(Boolean)
    .sort((left, right) => left.priority - right.priority)
    .filter(item => {
      const key = item.model.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    quotaMode: input.quotaMode === "official-first" ? "official-first" : DEFAULT_ALIYUN_MODEL_POOL.quotaMode,
    quotaFallback: input.quotaFallback === "local" ? "local" : DEFAULT_ALIYUN_MODEL_POOL.quotaFallback,
    quotaSwitchRatio: Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? ratio : DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio,
    failureSwitchThreshold: Number.isInteger(failureSwitchThreshold) && failureSwitchThreshold > 0 ? failureSwitchThreshold : DEFAULT_ALIYUN_MODEL_POOL.failureSwitchThreshold,
    models: models.length ? models : DEFAULT_ALIYUN_MODEL_POOL.models
  };
}
```

Extend `cleanLlmProvider` so Aliyun providers get a `modelPool`:

```js
const provider = String(input.provider || fallback.provider || id);
return {
  ...
  provider,
  ...
  ...(provider === "aliyun-modelstudio" ? { modelPool: cleanLlmModelPool(input.modelPool || fallback.modelPool) } : {})
};
```

- [ ] **Step 3: Add runtime state helpers**

Add these helpers near other state-file helpers:

```js
function cleanLlmModelPoolStateEntry(value = {}) {
  const status = ["available", "near_limit", "exhausted", "failing", "disabled"].includes(value.status)
    ? value.status
    : "available";
  return {
    model: compactText(value.model),
    status,
    localUsedTokens: Math.max(0, Math.round(Number(value.localUsedTokens || 0))),
    officialRemainingTokens: value.officialRemainingTokens === null || value.officialRemainingTokens === undefined ? null : Math.max(0, Math.round(Number(value.officialRemainingTokens || 0))),
    officialQuotaCheckedAt: compactText(value.officialQuotaCheckedAt),
    officialQuotaStatus: compactText(value.officialQuotaStatus || "unavailable"),
    consecutiveFailures: Math.max(0, Math.round(Number(value.consecutiveFailures || 0))),
    lastSuccessAt: compactText(value.lastSuccessAt),
    lastFailureAt: compactText(value.lastFailureAt),
    lastFailureMessage: compactText(value.lastFailureMessage),
    lastSwitchAt: compactText(value.lastSwitchAt),
    lastSwitchReason: compactText(value.lastSwitchReason)
  };
}

function cleanLlmModelPoolState(value = {}) {
  const inputModels = value && typeof value.models === "object" && !Array.isArray(value.models) ? value.models : {};
  const models = {};
  Object.entries(inputModels).forEach(([key, entry]) => {
    const clean = cleanLlmModelPoolStateEntry({ ...entry, model: entry?.model || key });
    if (clean.model) models[clean.model] = clean;
  });
  return {
    format: LLM_MODEL_POOL_STATE_FORMAT,
    updatedAt: compactText(value.updatedAt),
    activeModel: compactText(value.activeModel),
    models
  };
}

async function readLlmModelPoolState(dataDir = DATA_DIR) {
  return cleanLlmModelPoolState(await readJsonFile(path.join(dataDir, LLM_MODEL_POOL_STATE_NAME), { format: LLM_MODEL_POOL_STATE_FORMAT, models: {} }));
}

async function writeLlmModelPoolState(state, dataDir = DATA_DIR) {
  const clean = cleanLlmModelPoolState({ ...state, updatedAt: new Date().toISOString() });
  await writeJsonFile(path.join(dataDir, LLM_MODEL_POOL_STATE_NAME), clean);
  return clean;
}
```

Export `readLlmModelPoolState`, `writeLlmModelPoolState`, and `cleanLlmModelPool` in `module.exports`.

- [ ] **Step 4: Add the example config block**

In `config/llm.example.json`, add `modelPool` to the `aliyun-coding` provider:

```json
"modelPool": {
  "quotaMode": "official-first",
  "quotaFallback": "local",
  "quotaSwitchRatio": 0.85,
  "failureSwitchThreshold": 3,
  "models": [
    { "model": "qwen-plus", "enabled": true, "freeQuotaTokens": 1000000, "priority": 10 },
    { "model": "qwen-flash", "enabled": true, "freeQuotaTokens": 1000000, "priority": 20 },
    { "model": "qwen-turbo", "enabled": true, "freeQuotaTokens": 1000000, "priority": 30 },
    { "model": "qwen-long", "enabled": true, "freeQuotaTokens": 1000000, "priority": 40 },
    { "model": "qwen3.5-flash", "enabled": true, "freeQuotaTokens": 1000000, "priority": 50 },
    { "model": "qwen3.7-plus", "enabled": true, "freeQuotaTokens": 1000000, "priority": 60 },
    { "model": "qwen3-coder-plus", "enabled": true, "freeQuotaTokens": 1000000, "priority": 70 }
  ]
}
```

- [ ] **Step 5: Verify Task 1**

Run: `node --test test\paperhot_backend.test.cjs --test-name-pattern "llm .*model pool"`

Expected: PASS for the two new tests.

Commit:

```bash
git add paperhot_backend.cjs config/llm.example.json test/paperhot_backend.test.cjs
git commit -m "feat: add aliyun llm model pool state"
```

---

### Task 2: Model Selection, Switching, And Logs

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: `cleanLlmModelPool`, `readLlmModelPoolState`, `writeLlmModelPoolState`.
- Produces: `selectLlmPoolModel({ config, state })`, `callConfiguredLlmWithPool({ paper, userBackground, config, fetchImpl, dataDir })`, `isRetryableLlmModelFailure(error)`.

- [ ] **Step 1: Add failing selection tests**

Add:

```js
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
```

Run: `node --test test\paperhot_backend.test.cjs --test-name-pattern "selects the first aliyun|shared credential"`

Expected: FAIL because selectors do not exist.

- [ ] **Step 2: Implement selection and failure classification**

Add:

```js
function modelPoolStatusForModel(modelConfig, stateEntry = {}, pool = DEFAULT_ALIYUN_MODEL_POOL) {
  if (!modelConfig.enabled) return "disabled";
  const used = Number(stateEntry.localUsedTokens || 0);
  const quota = Number(modelConfig.freeQuotaTokens || 1000000);
  if (stateEntry.status === "exhausted") return "exhausted";
  if (stateEntry.status === "failing") return "failing";
  if (used >= quota) return "exhausted";
  if (used >= quota * Number(pool.quotaSwitchRatio || DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio)) return "near_limit";
  return "available";
}

function selectLlmPoolModel({ pool, state = {}, attempted = new Set() }) {
  const models = cleanLlmModelPool(pool).models;
  const enabled = models.filter(model => model.enabled && !attempted.has(model.model));
  const rows = enabled.map(model => {
    const entry = state.models?.[model.model] || {};
    const used = Number(entry.localUsedTokens || 0);
    const threshold = Number(model.freeQuotaTokens || 1000000) * Number(pool.quotaSwitchRatio || DEFAULT_ALIYUN_MODEL_POOL.quotaSwitchRatio);
    const blocked = entry.status === "exhausted" || used >= threshold || entry.status === "failing";
    return { ...model, state: entry, blocked, used };
  });
  const available = rows.find(row => !row.blocked);
  if (available) return { ...available, reason: "available" };
  const fallback = rows.find(row => row.state.status !== "exhausted") || rows[0] || null;
  return fallback ? { ...fallback, reason: "fallback" } : null;
}

function isRetryableLlmModelFailure(error) {
  const message = String(error?.message || error || "");
  if (/HTTP\s*(401|403)/i.test(message)) return false;
  if (/API 密钥未填写|Endpoint 未填写|模型未填写|invalid endpoint/i.test(message)) return false;
  return /HTTP\s*(429|5\d\d)|timeout|network|quota|rate limit|insufficient|额度|限流/i.test(message);
}
```

Export `selectLlmPoolModel`, `modelPoolStatusForModel`, and `isRetryableLlmModelFailure`.

- [ ] **Step 3: Add failing LLM call tests for switching and logging**

Add:

```js
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
});

test("aliyun llm pool retries the same paper on the next model after repeated retryable failures", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-failure-switch-"));
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
        failureSwitchThreshold: 1,
        models: [
          { model: "qwen-plus", enabled: true, freeQuotaTokens: 1000000, priority: 10 },
          { model: "qwen-flash", enabled: true, freeQuotaTokens: 1000000, priority: 20 }
        ]
      }
    },
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
});
```

Run: `node --test test\paperhot_backend.test.cjs --test-name-pattern "aliyun llm pool switches"`

Expected: FAIL because `callConfiguredLlmWithPool` does not exist.

- [ ] **Step 4: Implement pooled LLM call wrapper**

Keep `callConfiguredLlm` as the single raw request function. Add `callConfiguredLlmWithPool` and update the existing LLM call sites to use it:

```js
function activeProviderModelPool(config = {}) {
  if (config.provider !== "aliyun-modelstudio") return null;
  return config.modelPool || (config.providers || []).find(provider => provider.id === config.activeProviderId)?.modelPool || null;
}

async function callConfiguredLlmWithPool({ paper, userBackground, config, fetchImpl, dataDir = DATA_DIR }) {
  const pool = activeProviderModelPool(config);
  if (!pool) return callConfiguredLlm({ paper, userBackground, config, fetchImpl });
  const state = await readLlmModelPoolState(dataDir);
  const attempted = new Set();
  const selected = selectLlmPoolModel({ pool, state, attempted });
  if (!selected) return callConfiguredLlm({ paper, userBackground, config, fetchImpl });
  return callConfiguredLlmWithSelectedPoolModel({ paper, userBackground, config, fetchImpl, dataDir, pool, state, selected, attempted });
}

async function callConfiguredLlmWithSelectedPoolModel({ paper, userBackground, config, fetchImpl, dataDir, pool, state, selected, attempted }) {
  const previousModel = config.model;
  const selectedConfig = { ...config, model: selected.model };
  if (previousModel && previousModel !== selected.model) {
    await appendOperationLogSafe({
      action: "modify",
      operation: "llm-model-switch",
      fromModel: previousModel,
      toModel: selected.model,
      reason: selected.state?.localUsedTokens >= selected.freeQuotaTokens * pool.quotaSwitchRatio ? "quota-threshold" : "manual",
      localUsedTokens: Number(selected.state?.localUsedTokens || 0),
      freeQuotaTokens: selected.freeQuotaTokens,
      officialQuotaStatus: selected.state?.officialQuotaStatus || "unavailable"
    }, dataDir);
  }
  try {
    const insight = await callConfiguredLlm({ paper, userBackground, config: selectedConfig, fetchImpl });
    const usage = insight?.tokenUsage || {};
    const entry = cleanLlmModelPoolStateEntry({
      ...(state.models[selected.model] || {}),
      model: selected.model,
      status: "available",
      localUsedTokens: Number(state.models[selected.model]?.localUsedTokens || 0) + Number(usage.total || 0),
      consecutiveFailures: 0,
      lastSuccessAt: new Date().toISOString()
    });
    if (entry.localUsedTokens >= selected.freeQuotaTokens * pool.quotaSwitchRatio) entry.status = "near_limit";
    state.activeModel = selected.model;
    state.models[selected.model] = entry;
    await writeLlmModelPoolState(state, dataDir);
    return insight;
  } catch (error) {
    const entry = cleanLlmModelPoolStateEntry({
      ...(state.models[selected.model] || {}),
      model: selected.model,
      consecutiveFailures: Number(state.models[selected.model]?.consecutiveFailures || 0) + 1,
      lastFailureAt: new Date().toISOString(),
      lastFailureMessage: error.message
    });
    if (entry.consecutiveFailures >= Number(pool.failureSwitchThreshold || 3)) entry.status = "failing";
    state.models[selected.model] = entry;
    await writeLlmModelPoolState(state, dataDir);
    attempted.add(selected.model);
    if (isRetryableLlmModelFailure(error)) {
      const next = selectLlmPoolModel({ pool, state, attempted });
      if (next && next.model !== selected.model) {
        await appendOperationLogSafe({
          action: "modify",
          operation: "llm-model-switch",
          fromModel: selected.model,
          toModel: next.model,
          reason: "repeated-failure",
          localUsedTokens: Number(state.models[selected.model]?.localUsedTokens || 0),
          freeQuotaTokens: selected.freeQuotaTokens,
          officialQuotaStatus: state.models[selected.model]?.officialQuotaStatus || "unavailable"
        }, dataDir);
        return callConfiguredLlmWithSelectedPoolModel({ paper, userBackground, config, fetchImpl, dataDir, pool, state, selected: next, attempted });
      }
    }
    throw error;
  }
}
```

Update `testLlmConfig()` and `enrichPapersWithLlmInsights()` to pass `dataDir` into the pooled wrapper.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
node --test test\paperhot_backend.test.cjs --test-name-pattern "llm pool|shared credential|aliyun"
node --check paperhot_backend.cjs
```

Expected: all targeted tests pass and syntax check succeeds.

Commit:

```bash
git add paperhot_backend.cjs test/paperhot_backend.test.cjs
git commit -m "feat: switch aliyun llm models by quota"
```

---

### Task 3: API, Export, Stats, And Reset

**Files:**
- Modify: `paperhot_backend.cjs`
- Modify: `server.cjs`
- Modify: `BACKUP_FORMAT.md`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: `readLlmModelPoolState`, `writeLlmModelPoolState`.
- Produces: `readLlmModelPoolStatus(options)`, `resetLlmModelPoolState(model, options)`.
- API: `GET /api/token/stats` includes `llmModelPool`; `POST /api/integrations/llm/model-pool/reset` resets one model's local state.

- [ ] **Step 1: Add failing tests for stats/export/reset**

Add:

```js
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
});

test("local data export includes llm model pool state only with stats", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperhot-llm-pool-export-"));
  await writeLlmModelPoolState({ models: { "qwen-plus": { model: "qwen-plus", localUsedTokens: 42 } } }, tempDir);
  const plain = await exportLocalData({ dataDir: tempDir, includePapers: false });
  assert.equal(plain.data.papers.llmModelPoolState, undefined);
  const withStats = await exportLocalData({ dataDir: tempDir, includePapers: false, includeStats: true });
  assert.equal(withStats.data.papers.llmModelPoolState.models["qwen-plus"].localUsedTokens, 42);
});
```

Run: `node --test test\paperhot_backend.test.cjs --test-name-pattern "llm model pool state"`

Expected: FAIL because stats/export do not include this state.

- [ ] **Step 2: Add status and reset functions**

Add:

```js
async function readLlmModelPoolStatus(options = {}) {
  const config = await readLlmConfig(options.llmConfigFile);
  const state = await readLlmModelPoolState(options.dataDir || DATA_DIR);
  const provider = (config.providers || []).find(item => item.id === config.activeProviderId) || {};
  const pool = activeProviderModelPool(provider) || activeProviderModelPool(config) || cleanLlmModelPool();
  return {
    activeModel: state.activeModel || config.model || "",
    quotaMode: pool.quotaMode,
    quotaFallback: pool.quotaFallback,
    quotaSwitchRatio: pool.quotaSwitchRatio,
    failureSwitchThreshold: pool.failureSwitchThreshold,
    models: pool.models.map(model => {
      const entry = state.models[model.model] || {};
      return {
        ...model,
        ...entry,
        status: modelPoolStatusForModel(model, entry, pool),
        estimatedRemainingTokens: Math.max(0, Number(model.freeQuotaTokens || 0) - Number(entry.localUsedTokens || 0)),
        thresholdTokens: Math.round(Number(model.freeQuotaTokens || 0) * Number(pool.quotaSwitchRatio || 0.85))
      };
    })
  };
}

async function resetLlmModelPoolState(model, options = {}) {
  const cleanModel = compactText(model);
  if (!cleanModel) throw new Error("模型名称不能为空");
  const dataDir = options.dataDir || DATA_DIR;
  const state = await readLlmModelPoolState(dataDir);
  delete state.models[cleanModel];
  await writeLlmModelPoolState(state, dataDir);
  await appendOperationLogSafe({
    action: "modify",
    operation: "llm-model-pool-reset",
    model: cleanModel
  }, dataDir);
  return { ok: true, status: await readLlmModelPoolStatus({ ...options, dataDir }) };
}
```

Export both functions.

- [ ] **Step 3: Wire stats/export and server route**

In `buildTokenStats()`, add:

```js
const llmModelPool = await readLlmModelPoolStatus({ dataDir });
...
return {
  ok: true,
  today: todayBucket,
  last7Days: last7DaysBucket,
  last30Days: last30DaysBucket,
  daily: ...,
  models: ...,
  llmModelPool
};
```

In `exportLocalData()` include:

```js
...(includeStats ? {
  journalMetricsCache: await readJournalMetricsCache(dataDir),
  googleRollingCursors: await readGoogleRollingCursorsPayload(dataDir),
  webOfScienceUsage: await readWebOfScienceUsageFile(dataDir),
  llmModelPoolState: await readLlmModelPoolState(dataDir),
  paperCacheFiles
} : {})
```

In `buildLocalDataExportFiles()` include:

```js
{ path: "data/papers/llm-model-pool-state.json", content: jsonText(data.papers?.llmModelPoolState || { format: LLM_MODEL_POOL_STATE_FORMAT, models: {} }) }
```

In `server.cjs` import `resetLlmModelPoolState` and add route:

```js
if (req.method === "POST" && pathname === "/api/integrations/llm/model-pool/reset") {
  const body = await collectRequestBody(req);
  sendJson(res, 200, await resetLlmModelPoolState(body.model));
  return true;
}
```

- [ ] **Step 4: Update backup docs**

In `BACKUP_FORMAT.md`, add `data/papers/llm-model-pool-state.json` to the stats/logs export section and state:

```markdown
- `data/papers/llm-model-pool-state.json` is operational quota telemetry. It is exported only when stats are included, and it never contains API keys.
```

- [ ] **Step 5: Verify Task 3**

Run:

```bash
node --test test\paperhot_backend.test.cjs --test-name-pattern "llm model pool|local data export"
node --check paperhot_backend.cjs
node --check server.cjs
```

Expected: targeted tests pass and syntax checks succeed.

Commit:

```bash
git add paperhot_backend.cjs server.cjs BACKUP_FORMAT.md test/paperhot_backend.test.cjs
git commit -m "feat: expose aliyun llm model pool state"
```

---

### Task 4: Configuration And Stats UI

**Files:**
- Modify: `public/index.html`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: `integrationState.llm.providers[].modelPool`, `tokenStats.llmModelPool`, `POST /api/integrations/llm/model-pool/reset`.
- Produces: `renderLlmModelPoolConfig(provider)`, `readLlmModelPoolConfig(provider)`, `llmModelPoolStatsPanel(pool)`.

- [ ] **Step 1: Add failing frontend tests**

Add:

```js
test("config page exposes aliyun llm model pool controls", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /renderLlmModelPoolConfig/);
  assert.match(html, /data-llm-model-pool/);
  assert.match(html, /qwen-plus/);
  assert.match(html, /85%/);
  assert.match(html, /只重置 PaperHot 本地估算/);
});

test("token stats page exposes aliyun model pool status", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /llmModelPoolStatsPanel/);
  assert.match(html, /百炼模型池/);
  assert.match(html, /额度充足/);
  assert.match(html, /响应失败/);
  assert.match(html, /\/api\/integrations\/llm\/model-pool\/reset/);
});
```

Run: `node --test test\paperhot_frontend.test.cjs --test-name-pattern "aliyun"`

Expected: FAIL because the UI helpers do not exist.

- [ ] **Step 2: Add default frontend model-pool state**

In `defaultIntegrationState.llm.providers`, add `modelPool` to `aliyun-coding` matching `config/llm.example.json`.

Add helpers near LLM provider rendering:

```js
function llmModelPoolStatusLabel(status) {
  if (status === "near_limit") return "接近阈值";
  if (status === "exhausted") return "已用尽";
  if (status === "failing") return "响应失败";
  if (status === "disabled") return "已停用";
  return "额度充足";
}

function renderLlmModelPoolConfig(provider) {
  if (provider.provider !== "aliyun-modelstudio") return "";
  const pool = provider.modelPool || {};
  const models = Array.isArray(pool.models) ? pool.models : [];
  return `
    <div class="wos-usage-panel" data-llm-model-pool="${escapeHTML(provider.id)}">
      <div class="wos-usage-head"><strong>百炼模型池</strong><span class="small-text">官方额度优先，本地估算兜底</span></div>
      <div class="small-text">达到 ${escapeHTML(Math.round(Number(pool.quotaSwitchRatio || 0.85) * 100))}% 或连续失败 ${escapeHTML(pool.failureSwitchThreshold || 3)} 次后自动切换。</div>
      <div class="llm-model-pool-list">
        ${models.map(model => `
          <label class="llm-model-pool-row">
            <input type="checkbox" data-llm-pool-field="enabled" data-llm-pool-model="${escapeHTML(model.model)}" ${model.enabled !== false ? "checked" : ""}>
            <span>${escapeHTML(model.model)}</span>
            <input type="number" min="1" step="1" data-llm-pool-field="freeQuotaTokens" data-llm-pool-model="${escapeHTML(model.model)}" value="${escapeHTML(model.freeQuotaTokens || 1000000)}">
          </label>
        `).join("")}
      </div>
      <div class="small-text">重置按钮只重置 PaperHot 本地估算，不会恢复阿里云真实免费额度。</div>
    </div>
  `;
}
```

Insert `${renderLlmModelPoolConfig(provider)}` inside `llmProviderBody(provider)`.

- [ ] **Step 3: Serialize model-pool edits**

Extend `readActiveLlmProvider(provider)`:

```js
const pool = provider.modelPool ? JSON.parse(JSON.stringify(provider.modelPool)) : null;
if (pool) {
  const rows = new Map((pool.models || []).map(item => [item.model, { ...item }]));
  body.querySelectorAll("[data-llm-pool-model]").forEach(input => {
    const model = input.getAttribute("data-llm-pool-model");
    const row = rows.get(model) || { model, enabled: true, freeQuotaTokens: 1000000 };
    const field = input.getAttribute("data-llm-pool-field");
    row[field] = input.type === "checkbox" ? input.checked : Number(input.value);
    rows.set(model, row);
  });
  next.modelPool = { ...pool, models: [...rows.values()] };
}
```

- [ ] **Step 4: Render stats panel and reset action**

Add:

```js
function llmModelPoolStatsPanel(pool = {}) {
  const models = Array.isArray(pool.models) ? pool.models : [];
  if (!models.length) return "";
  return `
    <section class="panel" style="margin-top:16px">
      <div class="panel-head">
        <div>
          <h2>百炼模型池</h2>
          <div class="panel-note">当前模型：${escapeHTML(pool.activeModel || "未记录")}；官方额度不可用时使用本地估算。</div>
        </div>
      </div>
      <div class="candidate-table-wrap">
        <table class="candidate-table">
          <thead><tr><th>模型</th><th>状态</th><th>本地已用</th><th>估算剩余</th><th>失败</th><th>操作</th></tr></thead>
          <tbody>${models.map(model => `
            <tr>
              <td>${escapeHTML(model.model)}</td>
              <td>${escapeHTML(llmModelPoolStatusLabel(model.status))}</td>
              <td>${escapeHTML(model.localUsedTokens || 0)}</td>
              <td>${escapeHTML(model.estimatedRemainingTokens || 0)}</td>
              <td>${escapeHTML(model.consecutiveFailures || 0)}</td>
              <td><button class="ghost-btn" type="button" data-llm-pool-reset="${escapeHTML(model.model)}">重置本地估算</button></td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
      <div class="small-text">重置只重置 PaperHot 本地估算，不会恢复阿里云真实免费额度。</div>
    </section>
  `;
}
```

In `renderTokenStats()`, insert `${llmModelPoolStatsPanel(stats.llmModelPool)}` after the model consumption panel and bind reset buttons:

```js
document.querySelectorAll("[data-llm-pool-reset]").forEach(button => {
  button.addEventListener("click", async () => {
    const model = button.getAttribute("data-llm-pool-reset");
    if (!confirm(`只重置 PaperHot 对 ${model} 的本地额度估算，不会恢复阿里云真实免费额度。继续吗？`)) return;
    const response = await fetch("/api/integrations/llm/model-pool/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await loadTokenStats();
  });
});
```

- [ ] **Step 5: Update README and CHANGELOG**

In `README.md`, add a short bullet under LLM configuration:

```markdown
- 阿里百炼模型池可按官方额度优先、本地 Token 估算兜底运行；模型达到 85% 本地免费额度或连续失败 3 次后自动切换，并在统计页显示当前模型、接近用尽、响应失败和可用模型。
```

In `CHANGELOG.md`, add entries under `新增功能`, `配置与数据`, `文档`, and `测试与验证`.

- [ ] **Step 6: Verify Task 4**

Run:

```bash
node --test test\paperhot_frontend.test.cjs --test-name-pattern "aliyun|token stats|config page"
node --check server.cjs
```

Expected: targeted frontend tests pass and syntax checks succeed.

Commit:

```bash
git add public/index.html README.md CHANGELOG.md test/paperhot_frontend.test.cjs
git commit -m "feat: show aliyun llm model pool status"
```

---

### Task 5: Full Verification And Service Restart

**Files:**
- Verify only unless failures require fixes.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified local server on `http://127.0.0.1:50751`.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm test
node --check paperhot_backend.cjs
node --check server.cjs
```

Expected: all backend and frontend tests pass, and both syntax checks succeed.

- [ ] **Step 2: Restart fixed PaperHot port**

Warn the user before restart: active fetches will be interrupted, but written `archive.json`, `fetch-log.json`, and `operation-log.jsonl` are not lost by a normal restart.

Stop old `50751` listener and start:

```powershell
node server.cjs --port 50751
```

Use ordinary user permissions, not a restricted sandbox process.

- [ ] **Step 3: Verify runtime API**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:50751/api/integrations/config
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:50751/api/token/stats
node -e "const fs=require('fs');const f='data/papers/recent-fetch-cursors.json';const fd=fs.openSync(f,'r+');fs.closeSync(fd);console.log('cursor writable')"
```

Expected:

- HTTP 200 from both APIs.
- integration config includes the Aliyun `modelPool` block.
- token stats includes `llmModelPool`.
- cursor writable check prints `cursor writable`.

- [ ] **Step 4: Final status**

Run:

```bash
git status --short
```

Expected: clean worktree after all intended commits.
