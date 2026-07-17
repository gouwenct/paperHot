# Aliyun LLM Model Pool Design

## Goal

PaperHot should use Alibaba Model Studio free text-generation quotas more safely. When the active model reaches 85% of its free quota, or when it repeatedly fails, PaperHot should automatically move to the next configured model and make the current model-pool state visible to the user.

The first implementation should work even when Alibaba's console quota page cannot be read automatically. Official quota data is preferred when a supported API or configured endpoint is available; otherwise PaperHot falls back to conservative local token accounting based on successful LLM responses.

## Context

- The Alibaba console URL under `bailian.console.aliyun.com` requires a logged-in browser session, so PaperHot cannot reliably scrape a user's current balance from that page in the local backend.
- The public Alibaba Model Studio pricing page lists many China mainland text models with `100万 Token` free quota. It also states that price tables show model-call pricing and points users to the console for activity-specific balance.
- PaperHot already stores LLM provider configuration in `config/llm.json`, masks secrets in `/api/integrations/config`, tests models through `/api/integrations/llm/test`, records LLM token usage, and renders model token statistics on the stats page.

## Non-Goals

- Do not automate browser login to the Alibaba console.
- Do not add a brittle scraper for private console frontend state.
- Do not include image, OCR, realtime audio, or multimodal-only models in the default PaperHot text-summary pool.
- Do not export API keys or private quota data unless the existing explicit secrets export option is selected.

## Model Pool Configuration

Add a model-pool block under the existing Aliyun-compatible LLM provider configuration:

```json
{
  "quotaMode": "official-first",
  "quotaFallback": "local",
  "quotaSwitchRatio": 0.85,
  "failureSwitchThreshold": 3,
  "models": [
    {
      "model": "qwen-plus",
      "enabled": true,
      "freeQuotaTokens": 1000000,
      "priority": 10
    }
  ]
}
```

The initial default text model pool should be:

- `qwen-plus`
- `qwen-flash`
- `qwen-turbo`
- `qwen-long`
- `qwen3.5-flash`
- `qwen3.7-plus`
- `qwen3-coder-plus`

Each default entry uses `1,000,000` free tokens and the shared 85% switch threshold. Users can reorder, disable, add, or remove models from the configuration page.

## Local Runtime State

Store mutable model-pool state outside `config/llm.json`, because it changes during normal use and should not be treated as a static integration setting.

Recommended file:

`data/papers/llm-model-pool-state.json`

State per model:

- `model`
- `status`: `available`, `near_limit`, `exhausted`, `failing`, or `disabled`
- `localUsedTokens`
- `officialRemainingTokens`
- `officialQuotaCheckedAt`
- `officialQuotaStatus`
- `consecutiveFailures`
- `lastSuccessAt`
- `lastFailureAt`
- `lastFailureMessage`
- `lastSwitchAt`
- `lastSwitchReason`

The local state should be included only when the user exports stats/logs. It is operational telemetry, not a secret. API keys remain governed by the existing explicit secrets export option.

## Quota Source Strategy

Use a small internal interface:

```js
async function readAliyunModelQuota({ config, model, fetchImpl }) {
  return { status: "unavailable", reason: "not-configured" };
}
```

Version 1 behavior:

- If no official quota endpoint is configured, return `unavailable`.
- If a future official endpoint is configured, return normalized quota data:
  - `remainingTokens`
  - `totalTokens`
  - `checkedAt`
  - `source`
- If official reading fails, keep the last known official value and fall back to local usage for switching.

This keeps the switching logic stable while leaving a clean place to plug in an Alibaba-supported quota API later.

## Model Selection Flow

Before each LLM call:

1. Load LLM config and model-pool state.
2. Refresh official quota for configured Aliyun models when the quota cache is stale.
3. Exclude disabled models.
4. Exclude models marked `exhausted`.
5. Exclude models with `localUsedTokens >= freeQuotaTokens * quotaSwitchRatio`, unless all models are above threshold.
6. Exclude models marked `failing` while another usable model exists.
7. Pick the first usable model by priority/order.
8. Call the LLM using the selected model while reusing the active provider endpoint and API key.

After a successful call:

- Add `usage.total_tokens` to that model's local usage.
- Reset `consecutiveFailures`.
- Record `lastSuccessAt`.
- If usage reaches the threshold, mark it `near_limit` and switch on the next call.
- Include the actual model in `tokenUsage.model`.

After a failed call:

- Increment `consecutiveFailures`.
- Record `lastFailureAt` and a sanitized failure message.
- If the failure count reaches the threshold, mark the model `failing`.
- Try the next model for the same paper once, unless the error looks like invalid shared credentials.
- Preserve existing per-paper failure behavior if no model succeeds.

## Failure Classification

Retry on the next model for:

- HTTP 429
- HTTP 5xx
- timeout
- network errors
- quota-like messages such as insufficient quota, free quota exhausted, or rate limit

Do not rotate through the whole pool for:

- missing API key
- HTTP 401 or 403 from the shared Aliyun key
- malformed request caused by PaperHot prompt/body bugs
- invalid endpoint configuration

These shared failures should surface immediately because every model would likely fail.

## Logging

Write operation-log entries for model switches:

- `operation`: `llm-model-switch`
- `fromModel`
- `toModel`
- `reason`: `quota-threshold`, `official-exhausted`, `repeated-failure`, or `manual`
- `localUsedTokens`
- `freeQuotaTokens`
- `officialQuotaStatus`

Existing LLM logs should continue to summarize token usage by the actual model used.

## UI

Configuration page:

- Show an Aliyun model-pool panel inside the LLM provider card.
- Show current active model, quota mode, switch threshold, and failure threshold.
- Show each model row with status, local used tokens, estimated remaining tokens, official quota freshness, failure count, and last failure.
- Provide controls to enable/disable models, reorder models, edit quota, and reset local state for one model.
- Keep reset wording explicit: it only resets PaperHot's local estimate, not Alibaba's real quota.

Stats page:

- Add a "百炼模型池" panel near "模型消耗".
- Group models into: current, quota sufficient, near limit, exhausted, failing, disabled.
- Show whether each row is using official quota, local estimate, or stale official data.

Paper card failure messages:

- Include the model that failed.
- If a fallback model succeeds, do not show a card-level error; record the switch in logs.

## Data And Backup Impact

This feature adds runtime state under `data/papers/llm-model-pool-state.json`, so implementation must update `BACKUP_FORMAT.md` only if import/export behavior changes.

Recommended export behavior:

- Include model-pool state when `includeStats=1`.
- Include model-pool config with `config/llm.json` only when `includeSecrets=1`, following the existing LLM config boundary.
- Do not export API keys without the existing explicit secrets option.

## Tests

Backend tests should cover:

- Choosing the first available model.
- Switching when local usage reaches 85%.
- Switching after repeated retryable failures.
- Not rotating on shared credential failures.
- Logging `llm-model-switch`.
- Preserving `tokenUsage.model` as the actual model used.
- Exporting local model-pool state only with stats, not with default export.

Frontend tests should cover:

- Configuration page renders model-pool rows and status labels.
- Stats page renders current, exhausted, failing, and sufficient model groups.
- Reset copy makes clear that only the local estimate is reset.

## Implementation Defaults

- Do not expose a user-editable official quota endpoint in the first implementation. Keep the quota reader internal and return `unavailable` until an Alibaba-supported endpoint is known.
- Use `3` consecutive retryable failures as the default switch threshold.
- Do not auto-recover a `failing` model by cooldown in the first implementation. Provide manual reset first, then consider cooldown as a later improvement.
