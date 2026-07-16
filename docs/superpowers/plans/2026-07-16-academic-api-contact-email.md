# Academic API Contact Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save one academic API contact email from the PaperHot configuration page and send it with every Crossref DOI/title request, while keeping it out of default exports.

**Architecture:** Extend the existing integration-config pipeline with an `academicApis` object persisted in `config/academic-apis.json`. Crossref reads that configuration at its shared DOI/title request boundary; the existing ZIP integration gate controls export and import. OpenAlex is not added in this change, but can later consume the same `academicApis.contactEmail` field.

**Tech Stack:** Node.js 20 built-ins, CommonJS, native `fetch`, existing single-file HTML/JavaScript frontend, `node:test`, existing ZIP helpers.

## Global Constraints

- Users fill the email in the “领域配置” page; they never need to edit JSON manually.
- Store the local value in `config/academic-apis.json`; commit only `config/academic-apis.example.json` with an empty value.
- `academicApis.contactEmail` is optional; reject a non-empty invalid email with a clear message.
- Crossref DOI and title queries send both `mailto=<email>` and `User-Agent: paperHOT/0.1 (mailto:<email>)` when configured.
- When empty, omit `mailto` and remove the existing `local@example.invalid` placeholder.
- Do not add OpenAlex requests, a retry framework, a dependency, or a new service layer.
- Default exports exclude the email; only `includeSecrets=true` includes and restores it.
- Keep backup format `paperhot-local-data` version `1`; old v1 packages without the optional file remain valid.
- Update `BACKUP_FORMAT.md`, `README.md`, and `CHANGELOG.md` with the implementation.
- Before every `git commit`, show the staged scope and obtain explicit user confirmation because the worktree contains unrelated changes.

## File Map

- Create `config/academic-apis.example.json`: public empty configuration template.
- Modify `.gitignore`: exclude the real `config/academic-apis.json` containing the user's email.
- Modify `paperhot_backend.cjs`: configuration validation/read/write, Crossref request identity, ZIP export/import.
- Modify `public/index.html`: form state, email input, save payload, backend error display.
- Modify `test/paperhot_backend.test.cjs`: configuration, Crossref, export/import regression coverage.
- Modify `test/paperhot_frontend.test.cjs`: page field and save/error wiring checks.
- Modify `BACKUP_FORMAT.md`: optional v1 ZIP file and privacy gate.
- Modify `README.md`: page configuration, example command, config table, document index.
- Modify `CHANGELOG.md`: user-visible configuration, data/privacy, documentation, and verification entries.

---

### Task 1: Academic API Config and Crossref Identity

**Files:**
- Create: `config/academic-apis.example.json`
- Modify: `.gitignore:8-14`
- Modify: `paperhot_backend.cjs:20-27, 1500-1775, 3420-3450, 6460-6555`
- Test: `test/paperhot_backend.test.cjs:1-93, 2190-2250, 2411-2510, 4650-4672`

**Interfaces:**
- Consumes: existing `readJsonFile(file, fallback)`, `writeJsonFile(file, value)`, `compactText(value)`.
- Produces: `readAcademicApisConfig(file?) -> Promise<{contactEmail: string}>`, `writeIntegrationConfigs({academicApis}, options)`, and Crossref options `academicApis` or `academicApisConfigFile`.

- [ ] **Step 1: Add failing backend tests for save/read validation**

Add `readAcademicApisConfig` to the test import and extend the existing integration-config test with an isolated file:

```js
const files = {
  // existing test files...
  academicApisConfigFile: path.join(tempDir, "academic-apis.json")
};

const saved = await writeIntegrationConfigs({
  // existing integrations...
  academicApis: { contactEmail: "researcher@example.org" }
}, files);

assert.equal(saved.academicApis.contactEmail, "researcher@example.org");
assert.deepEqual(
  await readAcademicApisConfig(files.academicApisConfigFile),
  { contactEmail: "researcher@example.org" }
);
await assert.rejects(
  writeIntegrationConfigs({ academicApis: { contactEmail: "not-an-email" } }, files),
  /学术 API 联系邮箱格式不正确/
);
```

- [ ] **Step 2: Run the focused config test and verify RED**

Run:

```powershell
node --test --test-name-pattern "writes integration configs" test\paperhot_backend.test.cjs
```

Expected: FAIL because `readAcademicApisConfig` or `saved.academicApis` does not exist.

- [ ] **Step 3: Implement the minimal config contract**

Add the path/default, a small cleaner, and reader:

```js
const ACADEMIC_APIS_CONFIG_FILE = path.join(__dirname, "config", "academic-apis.json");
const DEFAULT_ACADEMIC_APIS_CONFIG = { contactEmail: "" };

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
```

Wire `academicApisConfigFile` through `readIntegrationConfigs()` and `writeIntegrationConfigs()`, write it in the existing `Promise.all`, return `academicApis` without secret masking, and export `readAcademicApisConfig` from `module.exports`.

Create the committed template:

```json
{
  "contactEmail": ""
}
```

Add the real file to `.gitignore`:

```gitignore
config/academic-apis.json
```

Verify the boundary:

```powershell
git check-ignore config/academic-apis.json
git check-ignore config/academic-apis.example.json
```

Expected: the first command prints `config/academic-apis.json`; the second prints nothing and exits `1`, proving the public template remains committable.

- [ ] **Step 4: Run the focused config test and verify GREEN**

Run the Step 2 command.

Expected: PASS; the invalid email assertion rejects before overwriting the last valid file.

- [ ] **Step 5: Add failing Crossref DOI/title request tests**

Use captured URLs and request options for both public helpers:

```js
test("Crossref sends the configured academic API contact email", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: new URL(String(url)), options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { DOI: "10.1000/test", title: ["Test paper"], items: [] } })
    };
  };
  const academicApis = { contactEmail: "researcher@example.org" };

  await fetchCrossrefWorkByDoi("10.1000/test", { fetchImpl, academicApis });
  await fetchCrossrefWorkByTitle({ title: "Test paper" }, { fetchImpl, academicApis });

  for (const request of requests) {
    assert.equal(request.url.searchParams.get("mailto"), "researcher@example.org");
    assert.equal(request.options.headers["User-Agent"], "paperHOT/0.1 (mailto:researcher@example.org)");
  }
});

test("Crossref omits placeholder contact details when email is empty", async () => {
  let captured;
  await fetchCrossrefWorkByDoi("10.1000/test", {
    academicApis: { contactEmail: "" },
    fetchImpl: async (url, options) => {
      captured = { url: new URL(String(url)), options };
      return { ok: true, status: 200, json: async () => ({ message: {} }) };
    }
  });
  assert.equal(captured.url.searchParams.has("mailto"), false);
  assert.equal(captured.options.headers["User-Agent"], "paperHOT/0.1");
  assert.doesNotMatch(JSON.stringify(captured), /local@example\.invalid/);
});
```

- [ ] **Step 6: Run the Crossref tests and verify RED**

Run:

```powershell
node --test --test-name-pattern "Crossref sends|Crossref omits" test\paperhot_backend.test.cjs
```

Expected: FAIL because current requests have no `mailto` query and still use `local@example.invalid`.

- [ ] **Step 7: Apply the configured identity at the shared Crossref boundary**

Add one helper used by both DOI and title requests:

```js
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
```

In both `fetchCrossrefWorkByDoi()` and `fetchCrossrefWorkByTitle()`, call the helper immediately before `fetchImpl`, pass `identity.url`, and reuse `identity.headers`. Preserve the existing 20-second timeout and error text.

- [ ] **Step 8: Run focused and full backend tests**

Run:

```powershell
node --test --test-name-pattern "writes integration configs|Crossref" test\paperhot_backend.test.cjs
node --check paperhot_backend.cjs
```

Expected: all selected tests PASS and syntax check exits `0`.

- [ ] **Step 9: Prepare a narrow commit after approval**

Show `git diff -- .gitignore config/academic-apis.example.json paperhot_backend.cjs test/paperhot_backend.test.cjs`, then request explicit confirmation. After approval:

```powershell
git add .gitignore config/academic-apis.example.json paperhot_backend.cjs test/paperhot_backend.test.cjs
git commit -m "feat: configure Crossref contact email"
```

Expected: only Task 1 hunks are staged; unrelated pre-existing hunks in shared files require selective staging.

---

### Task 2: Configuration Page Input and Error Feedback

**Files:**
- Modify: `public/index.html:6562-6700, 7114-7242, 7337-7358`
- Test: `test/paperhot_frontend.test.cjs:382-409`

**Interfaces:**
- Consumes: backend integration response `{ academicApis: { contactEmail: string } }` and POST error `{ error: string }`.
- Produces: POST payload `academicApis.contactEmail` from an `<input type="email">` in `data-integration-section="academicApis"`.

- [ ] **Step 1: Add a failing frontend structure test**

```js
test("academic API contact email is editable from the config page", async () => {
  const html = await fs.readFile(htmlFile, "utf8");
  assert.match(html, /academicApis:\s*\{\s*contactEmail:\s*""/);
  assert.match(html, /data-integration-section="academicApis"/);
  assert.match(html, /type="email"[^>]*data-integration-field="contactEmail"/);
  assert.match(html, /学术 API 联系邮箱/);
  assert.match(html, /Crossref/);
  assert.match(html, /OpenAlex/);
  assert.match(html, /academicApis:\s*integrationState\.academicApis/);
  assert.match(html, /payload\.error/);
});
```

- [ ] **Step 2: Run the frontend test and verify RED**

Run:

```powershell
node --test --test-name-pattern "academic API contact email" test\paperhot_frontend.test.cjs
```

Expected: FAIL because the `academicApis` state and input do not exist.

- [ ] **Step 3: Add the minimal page state and form section**

Extend the default and incoming integration state:

```js
academicApis: { contactEmail: "" }
```

```js
academicApis: { ...defaultIntegrationState.academicApis, ...(items.academicApis || {}) }
```

Render one section before Firecrawl:

```html
<div class="config-section source-form" data-integration-section="academicApis">
  <div class="keyword-section-head">
    <h3>学术 API 联系邮箱</h3>
    <div class="keyword-section-note">Crossref 当前使用；未来接入 OpenAlex 时复用。默认不进入本地数据导出包。</div>
  </div>
  <label>联系邮箱
    <input type="email" data-integration-field="contactEmail"
      value="${escapeHTML(integrationState.academicApis.contactEmail)}"
      placeholder="name@example.org" autocomplete="email">
  </label>
</div>
```

Add `academicApis: integrationState.academicApis` to `currentIntegrationConfig()`. Existing `readIntegrationSection()` already trims ordinary input values, so no new form reader is needed.

- [ ] **Step 4: Surface backend validation text**

Replace the status-only failure handling in `saveIntegrationConfig()` with:

```js
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
applyIntegrationState(payload);
```

In the catch block use:

```js
showToast(`配置保存失败：${error.message}`);
```

This keeps the existing server route; the global server error handler already returns `{ error: error.message }`.

- [ ] **Step 5: Run frontend tests and syntax-adjacent checks**

Run:

```powershell
node --test --test-name-pattern "academic API contact email|external integrations" test\paperhot_frontend.test.cjs
node --check server.cjs
```

Expected: selected frontend tests PASS and server syntax check exits `0`.

- [ ] **Step 6: Prepare a narrow commit after approval**

Show the Task 2 diff and request explicit confirmation. After approval, selectively stage only Task 2 hunks because both files already contain unrelated changes:

```powershell
git commit -m "feat: add academic API email setting"
```

Expected: the commit contains only the new page field, save/error behavior, and its frontend test.

---

### Task 3: Private ZIP Export and Import

**Files:**
- Modify: `paperhot_backend.cjs:2260-2545`
- Test: `test/paperhot_backend.test.cjs:6690-7050`
- Modify: `BACKUP_FORMAT.md:58-75`

**Interfaces:**
- Consumes: `readAcademicApisConfig(options.academicApisConfigFile)` and `writeIntegrationConfigs(input.integrations, options)` from Task 1.
- Produces: optional ZIP entry `config/academic-apis.json`, gated by `includeSecrets`/`allowSecrets`.

- [ ] **Step 1: Extend ZIP tests and verify RED**

In the existing include-secrets ZIP test, create `academic-apis.json`, pass `academicApisConfigFile`, and assert:

```js
await fs.writeFile(
  path.join(userDir, "academic-apis.json"),
  JSON.stringify({ contactEmail: "researcher@example.org" }),
  "utf8"
);

assert.equal(
  JSON.parse(entries["config/academic-apis.json"].toString("utf8")).contactEmail,
  "researcher@example.org"
);
```

Also assert the entry is absent from the existing default export test. Extend the allow-secrets import test with:

```js
assert.equal(
  JSON.parse(await fs.readFile(path.join(targetUserDir, "academic-apis.json"), "utf8")).contactEmail,
  "researcher@example.org"
);
```

Run:

```powershell
node --test --test-name-pattern "exports ZIP|skips imported API|imports API configs" test\paperhot_backend.test.cjs
```

Expected: FAIL because the new config is not yet written to or parsed from ZIP.

- [ ] **Step 2: Wire the optional file through existing backup gates**

Add `academicApis` to `exportLocalData()` only inside `if (includeSecrets)`, add the file in `buildLocalDataExportFiles()`, parse it in `importLocalDataZip()`, and include it in the existing integrations presence check:

```js
academicApis: await readAcademicApisConfig(options.academicApisConfigFile)
```

```js
{ path: "config/academic-apis.json", content: jsonText(data.integrations.academicApis || {}) }
```

```js
const academicApis = parseZipJsonEntry(entries, "config/academic-apis.json");
if (academicApis) payload.integrations.academicApis = academicApis;
```

Do not change `LOCAL_DATA_VERSION`.

- [ ] **Step 3: Update the authoritative backup document**

Add `config/academic-apis.json` to the explicit “包含 API Key 和外部接口配置” list and state:

```markdown
`config/academic-apis.json` 保存用户在页面填写的学术 API 联系邮箱。该文件默认不导出，只在用户显式勾选包含外部接口配置时进入 ZIP；旧 v1 包缺少该可选文件仍可正常导入，因此格式版本保持 `1`。
```

- [ ] **Step 4: Run focused backup tests**

Run the Step 1 command.

Expected: all selected tests PASS; default ZIP has no email, opted-in ZIP has it, and allowed import restores it.

- [ ] **Step 5: Prepare a narrow commit after approval**

Show the Task 3 staged diff, confirm `LOCAL_DATA_VERSION` is still `1`, and request explicit confirmation. After approval:

```powershell
git commit -m "feat: back up academic API contact config"
```

Expected: only backup logic/tests and `BACKUP_FORMAT.md` hunks are committed.

---

### Task 4: User Documentation, Changelog, and Runtime Verification

**Files:**
- Modify: `README.md:85-125, 337-382`
- Modify: `CHANGELOG.md` under `## 未发布`
- Verify: `paperhot_backend.cjs`, `server.cjs`, `public/index.html`, `data/papers/recent-fetch-cursors.json`

**Interfaces:**
- Consumes: completed UI/config/Crossref/backup behavior from Tasks 1-3.
- Produces: documented setup and a verified `http://127.0.0.1:50751` runtime.

- [ ] **Step 1: Update README setup and file map**

Document that users fill the contact email on the page. Add the optional manual bootstrap command for maintainers, but keep the page as the recommended path:

```powershell
Copy-Item config\academic-apis.example.json config\academic-apis.json
```

Add `config/academic-apis.json` to the config table and state that Crossref uses it now while OpenAlex can reuse it later. Update the `config/` folder description to include the new template and personal-email privacy boundary.

- [ ] **Step 2: Update CHANGELOG `未发布` categories**

Add exact entries:

```markdown
### 新增功能

- 领域配置新增共用“学术 API 联系邮箱”；Crossref DOI 和标题查询会同时携带 `mailto` 参数和可联系的 `User-Agent`，OpenAlex 暂未接入但未来复用同一字段。

### 配置与数据

- 新增本地 `config/academic-apis.json`；联系邮箱默认不导出，仅在用户显式选择包含 API Key 和外部接口配置时进入 v1 ZIP，旧 v1 备份继续兼容。

### 测试与验证

- 增加学术 API 邮箱校验、Crossref DOI/标题请求身份、页面保存提示及敏感配置导入导出回归测试。
```

- [ ] **Step 3: Run the complete automated suite**

Run:

```powershell
npm test
node --check paperhot_backend.cjs
node --check server.cjs
git diff --check
```

Expected: backend and frontend suites PASS, both syntax checks exit `0`, and diff check reports no whitespace errors. If a pre-existing test fails, record its exact name and rerun against the pre-task revision before attributing it to this change.

- [ ] **Step 4: Warn, restart fixed port 50751, and verify the loaded process**

Before stopping the old process, tell the user that active fetch requests will be interrupted but already-written `archive.json`, `fetch-log.json`, and `operation-log.jsonl` remain on disk. Stop only the listener on `50751`, then start:

```powershell
node server.cjs --port 50751
```

Verify:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:50751/api/integrations/config
```

Expected: HTTP `200`, response contains `integrations.academicApis.contactEmail`, and the Node process start time is later than the latest modified backend/frontend service file.

- [ ] **Step 5: Verify runtime write permission without changing cursor contents**

Open `data/papers/recent-fetch-cursors.json` using the same ordinary-user context as the server, read its bytes, open it for write access without truncation, and close it. Expected: read and write access succeed; do not delete, reset, or replace the cursor file.

- [ ] **Step 6: Prepare the final narrow commit after approval**

Review `git status --short`, ensure no real `config/academic-apis.json`, API Key, local paper data, or unrelated dirty files are staged, and request explicit confirmation. After approval, selectively stage only remaining feature/docs hunks and commit:

```powershell
git commit -m "docs: explain academic API contact email"
```

Expected: implementation is complete, verified, and unrelated pre-existing changes remain untouched.
