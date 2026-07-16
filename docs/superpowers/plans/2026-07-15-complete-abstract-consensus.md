# Complete Abstract and Firecrawl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the first identity-matched complete abstract to the LLM and add Firecrawl as a configurable parallel publisher-page fetcher.

**Architecture:** Keep the existing parallel candidate collector, add a dependency-free Firecrawl REST loader, and accept the first candidate that passes identity and completeness validation. Reuse the existing integration configuration, masking, import/export and settings-card patterns for the Firecrawl API Key.

**Tech Stack:** Node.js standard library, existing `fetch`, `node:test`, existing HTML frontend.

## Global Constraints

- Do not add dependencies; add only the Firecrawl integration configuration requested by the user.
- Launch all configured abstract sources in parallel.
- Accept the first complete identity-matched abstract; one source is enough.
- Do not call LLM for snippets, truncation markers or robot challenge text.
- Do not use Firecrawl Agent, Question or LLM extraction formats.
- Do not change `paperhot-local-data` version `1`.

---

### Task 1: Single complete abstract selection

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Produces: `cleanAbstractText(value)`, `isCompleteAbstract(value)`, and first-valid-candidate recovery behavior.

- [ ] Change the existing single-source rejection test to require one complete source to trigger LLM processing.
- [ ] Add a race test proving all loaders start and the first valid complete candidate returns without waiting for a second source.
- [ ] Run focused tests and verify they fail under the existing two-source gate.
- [ ] Replace pair selection in recovery and LLM eligibility with one-source completeness checks.
- [ ] Re-run focused tests and confirm snippets remain blocked.

### Task 2: Firecrawl publisher-page source

**Files:**
- Modify: `paperhot_backend.cjs`
- Test: `test/paperhot_backend.test.cjs`

**Interfaces:**
- Consumes: paper DOI/title/authors and `config/firecrawl.json`.
- Produces: `fetchFirecrawlAbstractForPaper(paper, options)` returning an exact abstract candidate or `null`.

- [ ] Add failing tests for Firecrawl request headers/body and HTML/Markdown abstract extraction.
- [ ] Run focused tests and confirm the Firecrawl loader/config do not exist.
- [ ] Add the default config, cleaner/reader and REST loader using Node.js `fetch`.
- [ ] Add Firecrawl to `defaultAbstractSources` so it starts in parallel.
- [ ] Re-run focused tests and confirm publisher challenge pages and snippets are rejected.

### Task 3: Firecrawl settings and LLM/UI status

**Files:**
- Modify: `paperhot_backend.cjs`
- Modify: `public/index.html`
- Create: `config/firecrawl.example.json`
- Test: `test/paperhot_backend.test.cjs`
- Test: `test/paperhot_frontend.test.cjs`

**Interfaces:**
- Consumes: `abstractConsensusSources`, Firecrawl integration state and existing `tokenUsage`.
- Produces: no LLM call without a complete abstract, a Firecrawl settings card, and “未获得完整摘要，未进行 AI 分析”.

- [ ] Add failing backend tests for masked Firecrawl secrets, blank-key preservation and opt-in backup import/export.
- [ ] Add failing frontend tests for the Firecrawl card and updated incomplete-abstract status.
- [ ] Run focused tests and verify failures.
- [ ] Reuse the existing integration read/write and secret export patterns for Firecrawl.
- [ ] Render the Firecrawl fields and updated incomplete-abstract status using existing card styles.
- [ ] Re-run focused backend and frontend tests.

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `BACKUP_FORMAT.md`
- Modify: `CHANGELOG.md`

- [ ] Document single-complete-source release, Firecrawl configuration and the no-LLM fallback.
- [ ] Add `config/firecrawl.json` to the opt-in secret ZIP contract without changing backup version `1`.
- [ ] Record user-visible behavior, configuration impact and tests under `未发布`.
- [ ] Run `npm run test:backend` and `npm run test:frontend`.
- [ ] Run `node --check paperhot_backend.cjs`, `node --check server.cjs`, and `git diff --check`.
- [ ] Restart `node server.cjs --port 50751` after warning that active fetches will stop, then verify the new PID, HTTP 200 and cursor write permission.
