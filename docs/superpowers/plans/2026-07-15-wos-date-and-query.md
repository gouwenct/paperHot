# WoS Query and Publication Date Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quote WoS Boolean keywords, use the Starter API recent-record window, and keep the most precise publication date available from WoS, Crossref, or the publisher.

**Architecture:** Keep the existing discovery and enrichment pipeline. Adjust the existing WoS query builder/request parameters, make the existing Crossref DOI path run for incomplete dates, and add one small publisher-date fallback using the existing HTML fetch pattern.

**Tech Stack:** Node.js standard library, existing `fetch`, `node:test`.

## Global Constraints

- Do not add dependencies or new configuration.
- Do not persist fabricated dates.
- Preserve year/month values when no day is available.
- Do not modify API keys, local paper data, or backup format.

---

### Task 1: WoS Boolean query and recent-record window

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: `searchLogic`, `startDate`, `endDate` already passed in source options.
- Produces: quoted `q`, `modifiedTimeSpan`, and `sortField=LD+D` request parameters.

- [ ] Add a failing test asserting `("SIM" AND "super resolution") OR "RIM"`.
- [ ] Add failing assertions for `modifiedTimeSpan` and `sortField`, and removal of `publishTimeSpan`.
- [ ] Run the focused backend test and confirm the old request fails those assertions.
- [ ] Implement the smallest query-builder and request-parameter changes.
- [ ] Re-run the focused backend test and confirm it passes.

### Task 2: Highest-precision Crossref and WoS dates

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: existing WoS source fields and Crossref work records.
- Produces: `published` as `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` without fabrication.

- [ ] Add failing tests for WoS English months and Crossref choosing a full online date over a year-only generic date.
- [ ] Add a failing test proving an existing DOI with an incomplete date still calls the Crossref fetcher.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement month normalization, precision comparison, and remove the DOI skip guard.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Publisher date fallback and conservative range overlap

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: DOI, current publication date, existing HTML fetch injection, requested range.
- Produces: a more precise publisher date when available; otherwise the unchanged paper.

- [ ] Add a failing pipeline test where Crossref returns only a year and publisher metadata returns a full date.
- [ ] Add a failing range test proving a month-level date overlapping the requested range is retained.
- [ ] Run focused tests and verify expected failures.
- [ ] Reuse existing HTML metadata parsing and concurrency helper for the minimal fallback.
- [ ] Replace the post-enrichment strict day-only filter with precision-aware range overlap.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] Update the README document index and WoS behavior description.
- [ ] Record the user-visible fixes and tests under `未发布`.
- [ ] Run `npm run test:backend`.
- [ ] Run `npm test`.
- [ ] Run `node --check paperhot_backend.cjs` and `node --check server.cjs`.
- [ ] Run `git diff --check` and inspect `git status --short` for sensitive files.

### Task 5: Persist and display final confirmed dates

**Files:**
- Modify: `paperhot_backend.cjs`
- Modify: `public/index.html`
- Test: `test/paperhot_backend.test.cjs`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: `publisherDatedPapers`, `datedCrossrefPapers`, `archive.addedPapers`, and the existing `candidateSnapshots` log object.
- Produces: `afterDateEnrichment`, `finalDateMatched`, `dateConfirmed`, and accurate `newFetchedCount` log fields.

- [ ] Add a failing backend test asserting that out-of-range enriched papers remain visible in `afterDateEnrichment` with their final date and are absent from `finalDateMatched`.
- [ ] Add a failing frontend test asserting compact stage controls and the corrected funnel labels.
- [ ] Run focused tests and verify the missing snapshots and labels fail.
- [ ] Append the two snapshots after publisher enrichment and set `pipelineCounts.dateConfirmed`.
- [ ] Write `newFetchedCount` from `archive.addedPapers.length`.
- [ ] Make candidate detail default to the enriched-date stage, retain old-log fallback, and use the selected stage for archive actions.
- [ ] Run focused and full tests, syntax checks, `git diff --check`, then restart port `50751`.
