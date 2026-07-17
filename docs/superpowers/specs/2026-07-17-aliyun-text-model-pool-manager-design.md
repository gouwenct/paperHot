# Aliyun Text Model Pool Manager Design

## Goal

Upgrade PaperHot's Aliyun Bailian model pool from a small default rotation list into a visible model-pool manager for text-compatible chat models.

The feature should let the user browse many compatible text conversation models, test each model individually, enable successful models into rotation, see local remaining-quota bars, and rely on automatic switching when a model is nearly exhausted or repeatedly fails.

## Scope

In scope:

- Only Aliyun Model Studio models that can be used through the existing OpenAI-compatible chat-completions text path.
- A paginated model-pool UI with 25 models per page in a 5 x 5 grid.
- A per-model quota bar based on PaperHot's local token accounting.
- A per-model test button that calls the selected model only.
- Automatic enabling after a successful per-model test.
- Disabled or greyed model cards when the local remaining quota is below 15%, local usage reaches 85%, the model is marked exhausted, or the model is disabled.
- A visible hint when a model was last switched away because of repeated failures.
- Automatic runtime switching from one enabled usable model to the next enabled usable model.

Out of scope:

- Browser automation or scraping of the private Aliyun console.
- Embedding, rerank, OCR, image, video, audio, realtime, multimodal-only, or tool-specific models.
- Claiming the local quota estimate is the official Aliyun remaining quota.
- Adding a user-editable official quota endpoint in this iteration.

## Model Eligibility

PaperHot should maintain a local registry of Aliyun-compatible text conversation models. The registry is curated from Aliyun public Model Studio documentation, not from the private console.

Reference sources for registry curation:

- Aliyun Model Studio text generation model documentation: `https://help.aliyun.com/zh/model-studio/text-generation-model/`
- Aliyun Model Studio model documentation index: `https://help.aliyun.com/zh/model-studio/models`
- Aliyun Model Studio OpenAI-compatible usage documentation should be used to confirm the chat-completions request shape before a model is added.

A model can be in the registry only if it satisfies all of these:

- It is documented as a text generation or chat model.
- It can be called with the same OpenAI-compatible chat-completions request shape used by `callConfiguredLlm`.
- It can plausibly return the JSON object PaperHot expects for `abstractZh`, `reason`, and `shortTitle`.

Models excluded from the registry:

- Embedding models.
- Rerank models.
- Image, video, audio, speech, OCR, or multimodal-only models.
- Agent, workflow, or application products that are not direct chat models.

The initial registry should include a conservative set of current Aliyun text models and aliases such as Qwen text/chat families, plus any other Aliyun-hosted text-generation models documented as OpenAI-compatible. Each registry entry should include:

- `model`
- `displayName`
- `family`
- `enabled`
- `freeQuotaTokens`
- `priority`
- `source`
- `notes`

Default quota remains `1,000,000` tokens unless the registry entry explicitly overrides it.

## State And Selection Rules

The existing state file remains:

```text
data/papers/llm-model-pool-state.json
```

Each model state keeps:

- `localUsedTokens`
- `status`
- `consecutiveFailures`
- `lastSuccessAt`
- `lastFailureAt`
- `lastFailureMessage`
- `lastSwitchAt`
- `lastSwitchReason`
- `lastTestAt`
- `lastTestStatus`
- `lastTestMessage`

Derived UI status:

- `available`: enabled, not exhausted, not failing, and local usage is below 85%.
- `near_limit`: local usage is at or above 85%.
- `exhausted`: local usage is at or above free quota, or status was explicitly exhausted.
- `failing`: consecutive failures reached the threshold.
- `disabled`: user has not enabled this model or the model is manually disabled.

Cards with `near_limit`, `exhausted`, `failing`, or `disabled` appear greyed. `near_limit` and `exhausted` cannot be selected for activation until reset. A `failing` model cannot be used for automatic rotation until reset or retested successfully.

Runtime selection uses only models that are:

- enabled,
- below the 85% local usage threshold,
- not exhausted,
- not failing,
- and compatible text-chat registry entries.

If the active model becomes unavailable by quota threshold or failure threshold, PaperHot switches to the next usable model by priority.

## Per-Model Test Behavior

The UI test button sends a minimal connectivity prompt through the selected model:

- It does not change the global active model before the test.
- It uses the same endpoint and API key as the Aliyun provider.
- It writes local model state with `lastTestAt`, `lastTestStatus`, and `lastTestMessage`.
- If the test succeeds, the model is automatically enabled for rotation and its failure counters are cleared.
- If the test fails with `401`, `403`, missing key, or missing endpoint, PaperHot reports it as a shared credential/config problem and does not rotate through other models.
- If the test fails with retryable model-level errors such as `429`, `5xx`, timeout, quota, or rate-limit text, it marks that model's test as failed and increments its model-level failure count.

Testing a model consumes local estimated tokens only if the provider returns token usage.

## UI Design

The Aliyun provider configuration area should include a model-pool manager:

- Grid: 5 columns x 5 rows on desktop, responsive down to fewer columns on narrow screens.
- Pagination: 25 models per page, with previous/next controls and a page indicator.
- Model card contents:
  - Model display name and raw model id.
  - Family label.
  - Quota bar: used vs configured free quota.
  - Remaining token estimate and used token estimate.
  - Status label.
  - Enable/select control.
  - Test button.
  - Failure hint if `lastSwitchReason === "repeated-failure"` or `lastTestStatus === "failed"`.

The stats page should keep the summary table added in the previous model-pool implementation, but it can link users back to the model manager for bulk browsing and tests.

The UI copy must be explicit:

- The quota bar is PaperHot's local estimate.
- Resetting local estimate does not restore Aliyun's real free quota.
- A successful model test enables the model for future automatic rotation.

## API Design

Add backend functions and endpoints:

- `readAliyunTextModelRegistry()`
- `readLlmModelPoolStatus(options)`
- `testLlmPoolModel(model, options)`
- `updateLlmModelPoolModel(model, patch, options)`
- `resetLlmModelPoolState(model, options)` remains.

Suggested routes:

- `GET /api/integrations/llm/model-pool`
  - Returns registry entries merged with runtime state and derived status.
- `POST /api/integrations/llm/model-pool/test`
  - Body: `{ model }`
  - Tests only that model and enables it on success.
- `POST /api/integrations/llm/model-pool/model`
  - Body: `{ model, enabled, freeQuotaTokens }`
  - Updates user-editable model settings.
- `POST /api/integrations/llm/model-pool/reset`
  - Existing reset route, keeps current semantics.

## Data Export

The existing export rule remains:

- `llm-model-pool-state.json` is exported only when stats are included.
- API keys and request content are never exported through model-pool state.
- Static registry defaults live in code/config examples and do not require a new backup version.

If user-edited per-model enablement and quota settings are stored in `config/llm.json`, they are exported only under the existing explicit secrets/integration-config export option.

## Testing

Backend tests should cover:

- Registry excludes non-text model types.
- Model-pool status derives `available`, `near_limit`, `exhausted`, `failing`, and `disabled`.
- Per-model test calls exactly the requested model.
- Successful per-model test enables the model and clears failure counters.
- Failed per-model test records last failure and does not enable shared credential failures.
- Automatic runtime selection skips greyed, failing, disabled, and near-limit models.
- Pagination data returns all model rows without losing runtime state.

Frontend tests should cover:

- Model manager renders model cards, quota bars, test buttons, and pagination.
- 25 models per page.
- Greyed cards cannot be selected.
- Repeated-failure hint appears next to the affected model.
- Per-model test calls `/api/integrations/llm/model-pool/test`.
- Successful test marks or serializes the model as enabled.

## Verification

Minimum verification:

```powershell
npm test
node --check paperhot_backend.cjs
node --check server.cjs
```

After backend or frontend service changes, restart `http://127.0.0.1:50751` and verify:

- `/api/integrations/config` returns 200.
- `/api/token/stats` returns 200.
- `/api/integrations/llm/model-pool` returns text-compatible model rows.
- `data/papers/recent-fetch-cursors.json` remains readable and writable.
