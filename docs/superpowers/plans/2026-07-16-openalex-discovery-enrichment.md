# OpenAlex Discovery and Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenAlex as a configurable discovery and always-available enrichment source while making Today-page source switches control discovery only and documenting field provenance in the configuration page.

**Architecture:** Extend the existing adapters and integration-config objects in `paperhot_backend.cjs`; route OpenAlex through the existing discovery, cursor, dedupe, abstract-consensus, archive, and export/import paths. Keep the single-page UI in `public/index.html`, hide credential-free source cards only in the configuration list, and retain all discovery switches on the Today page.

**Tech Stack:** Node.js 20 built-ins, CommonJS, native `fetch`, static HTML/CSS/JavaScript, `node:test`.

## Global Constraints

- No new dependencies or service layer.
- OpenAlex API requests require a saved API Key and use the shared academic contact email only in `User-Agent`.
- Today-page switches control discovery only; enrichment remains enabled when its configured API is available.
- API Keys and contact email remain excluded from default ZIP exports; backup format stays `paperhot-local-data` version `1`.
- Runtime verification uses `http://127.0.0.1:50751` only.
- Preserve unrelated existing working-tree changes and update `CHANGELOG.md`, `README.md`, and `BACKUP_FORMAT.md` narrowly.

---

### Task 1: OpenAlex Configuration and Backup Contract

**Files:**
- Create: `config/openalex.example.json`
- Modify: `.gitignore`
- Modify: `paperhot_backend.cjs`
- Modify: `BACKUP_FORMAT.md`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces: `readOpenAlexConfig(file?)`, integration payload key `openAlex`, and optional ZIP entry `config/openalex.json`.
- Consumes: existing `readIntegrationConfigs`, `writeIntegrationConfigs`, `readIntegrationSecrets`, `exportLocalDataZip`, and `importLocalDataZip` patterns.

- [x] Add tests proving OpenAlex config defaults, secret masking/preservation, default ZIP exclusion, explicit secret export, and opt-in import.
- [x] Run the focused tests and confirm the new behavior is exercised.
- [x] Add `DEFAULT_OPENALEX_CONFIG = { provider: "openalex", enabled: false, endpoint: "https://api.openalex.org/works", apiKey: "", maxPages: 3, perPage: 100 }`, clean/read/write integration handling, secret output, and v1 ZIP whitelist entries.
- [x] Add the example JSON and ignore the real `config/openalex.json`; document the optional secret file in `BACKUP_FORMAT.md` without changing version `1`.
- [x] Re-run the focused backend tests and confirm they pass.

### Task 2: OpenAlex Adapter, Normalization, and Enrichment

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces: `restoreOpenAlexAbstract(index)`, `normalizeOpenAlexWork(work, keywords)`, `fetchOpenAlexPapers(keywords, options)`, and OpenAlex abstract candidates for `recoverAbstractConsensus`.
- Consumes: existing `completePaperRecord`, date precision, identity checks, pagination callbacks, and discovery task flow.

- [x] Add normalization tests for `id`, title, DOI, authors, journal, date/year precision, citation count/source, landing/PDF URLs, topics, preprint stage, and reconstructed `abstract_inverted_index`.
- [x] Add request tests for direction search, exact DOI, API Key, contact-email `User-Agent`, and pagination.
- [x] Add a pipeline test proving discovery source selection does not disable Semantic Scholar field enrichment.
- [x] Implement the minimal adapter using native `URL`/`URLSearchParams` and the existing page callbacks; add `openalex` to API labels, supported sources, source priority below Google Scholar, and discovery dispatch.
- [x] Add OpenAlex to abstract recovery by DOI, reconstructing the inverted index and applying the existing identity/completeness gate; do not key enrichment off discovery `sources`.
- [x] Merge metadata by the approved field rules: preserve valid existing identity fields, choose the most precise date, keep citation priority WoS > Google Scholar > OpenAlex, and fill missing URL/PDF/tags only.
- [x] Run backend tests: `208/208` passed.

### Task 3: Configuration and Today-Page UI

**Files:**
- Modify: `public/index.html`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: backend integration key `openAlex` and existing `sourceState`.
- Produces: OpenAlex credential form, field-provenance table, and Today-page `sources` containing only selected discovery sources.

- [x] Add frontend assertions for an OpenAlex API Key card/help link, hidden credential-free cards in `renderSourceConfig`, retained Today switches, `检索信源` wording, and the complete field-source/priority table.
- [x] Extend default/load/current integration state with `openAlex`, secret reveal support, enabled/API Key inputs, and official Key help URL.
- [x] Filter only the configuration-page source-card list to Google, WoS, and OpenAlex; do not remove arXiv, bioRxiv, or Semantic Scholar from `sourceState` or Today controls.
- [x] Rename the Today label to `检索信源` and state that field completion remains automatic.
- [x] Render the approved field mapping and priorities in the integration configuration section using the existing table/card styles and responsive constraints.
- [x] Run frontend tests: `68/68` passed.

### Task 4: Documentation, Full Verification, and Runtime Restart

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-07-16-openalex-discovery-enrichment.md`

**Interfaces:**
- Consumes: completed runtime behavior and test results.
- Produces: accurate user documentation and verification record.

- [x] Update README source/config/ingestion descriptions and its document index; describe discovery-only switches and automatic enrichment.
- [x] Update `CHANGELOG.md` under `未发布` for feature, configuration/data, UI, docs, and tests.
- [x] Run `node --check paperhot_backend.cjs`, `node --check server.cjs`, `npm run test:backend`, and `npm run test:frontend`; backend `208/208`, frontend `68/68` passed.
- [x] Warn that restarting interrupts active fetches but does not remove saved archives/logs, stop the old `50751` process, and start `node server.cjs --port 50751` as the normal user.
- [x] Verify the new process start time is later than modified files, `/api/integrations/config` returns HTTP 200 with `openAlex`, and `data/papers/recent-fetch-cursors.json` can be opened read/write under the service identity.
- [x] Inspect `git status --short` and ensure no real `config/openalex.json`, API Key, or local paper data is included in the implementation diff.

### Task 5: Configuration Page Order and Native Collapsing

**Files:**
- Modify: `public/index.html`
- Modify: `CHANGELOG.md`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: existing `renderSetupStatus`, `renderSourceConfig`, `renderIntegrationConfig`, autosave, secret reveal, and API help handlers.
- Produces: six ordered configuration sections; source, Firecrawl, and external integration sections use closed native `<details>` elements.

- [x] Add frontend assertions for the six section markers in the approved order and closed `<details>` wrappers around source, Firecrawl, and external integrations.
- [x] Split `renderIntegrationConfig` output across dedicated contact-email, field-provenance, Firecrawl, and external-interface containers without changing integration payload keys.
- [x] Reorder the static configuration skeleton, keep keyword configuration in the existing right column, and place local data after the six ordered sections.
- [x] Add restrained native disclosure styling and preserve save/help/autosave event delegation.
- [x] Update `CHANGELOG.md`, run frontend tests (`69/69`) and embedded-script syntax validation, then restart and verify `50751` (HTTP 200, PID `22272`).
