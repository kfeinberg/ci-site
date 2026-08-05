# T-Cell Engager Tracker — Design

**Date:** 2026-08-05
**Status:** Approved to build (MVP)

## Goal

A pipeline pull + tracker page for every clinical trial evaluating a **T-cell
engager (TCE)** drug, across all indications, sponsors, and phases. A TCE is a
bispecific antibody with two arms: one a T-cell recruiter (**CD3** or **CD28**),
the other a **tumor-antigen target** (e.g. MUC16, FOLR1, CLDN6). The client's
drug is a **CD3×MUC16**, so MUC16 competitors are the priority lens.

Two per-trial flags requested: **enrolls ovarian patients** and **has US sites**.

## Key findings from ct.gov (why this design)

- ct.gov has **no structured modality/target field**. The arm pair is recoverable
  two ways:
  - **Free-text brief summaries** often state it explicitly, e.g.
    "B7-H4 x CD3 bispecific mAb", "HLA-A*02:01 specific T cell engager (TCE)".
  - **Named drugs** need domain knowledge (ubamatamab = REGN4018 = CD3×MUC16);
    the summary alone doesn't say it. The existing LLM classify layer handles this.
- **Not all bispecifics are TCEs** (found a PD-1×CTLA-4 bispecific in the ovarian
  net) → must *classify*, not keyword-match.
- **Raw `MUC16` keyword is a trap** — MUC16 = CA-125, the standard ovarian tumor
  marker, so it matches any trial that merely *measures* it. Competitors must be
  found via drug-level classification, not the keyword.

Net sizes (probed live): combined modality net ≈ 2,920 (any indication);
ovarian-scoped ≈ 88; bispecific ≈ 1,090; "T cell engager" phrase ≈ 128;
CD3 ≈ 1,988 (noisy); CD28 ≈ 251.

## Architecture (reuses existing pipeline patterns)

1. **`scripts/tce.mjs`** — scrape, no criteria gate. Modality net
   `"T cell engager" OR "T-cell engager" OR bispecific OR CD3 OR CD28`, all
   indications. Extended fields: `BriefSummary`, `InterventionDescription`,
   `Keyword`, `LocationCountry`. Writes `tce_trials` table (isolated from the
   ovarian `trials` table). Computes flags in code: `enrolls_ovarian`
   (regex over conditions + keywords + title), `has_us_sites`.

2. **`scripts/tce-classify.mjs`** — extends `classify.mjs`. Dedups to distinct
   drugs via `drugs.mjs` (ubamatamab classifies once). Per drug, opus returns:
   `is_tce` (bool), `t_cell_arm` (CD3|CD28|other|none|unknown), `tumor_target`,
   `target_pair` (e.g. "CD3 × MUC16"), `modality`, `confidence`. Stored in
   `tce_classifications`. Fallback: light regex on brief summary
   (`/(\w+)\s*[x×]\s*CD3/i` + reverse) when no distinctive drug name exists.

3. **Snapshot** — `src/data/tce-snapshot.json` (same "bundle a snapshot" model;
   no runtime SQLite). Read via a new accessor in `src/lib/db.ts`.

4. **App — new standalone `/engagers` section** (separate from ovarian
   workspace). Table: Drug · Target pair · T-cell arm · Tumor target ·
   Indication(s) · Ovarian ✓ · US sites ✓ · Phase · Status · Sponsor · NCT.
   Filters: confirmed-TCE-only (default on), tumor-target quick-filter (MUC16
   one-click), ovarian-only, US-only. MUC16 rows highlighted.

5. **Testing** — `node --test` unit tests for ovarian-flag, US-flag, and the
   summary pair-extractor. New npm scripts: `tce`, `tce:classify`.

## Decisions

- Default view = **confirmed + likely TCEs** (has CD3/CD28 arm); non-TCE
  bispecifics captured but hidden by default.
- Placement = **standalone section**, since this is modality-scoped across all
  indications (doesn't fit the indication-scoped workspace model).
- Net = **broad** (includes raw CD3/CD28); noise filtered by the confirmed-TCE
  default view.

## Deferred (YAGNI)

- Change-detection / alerts for TCE trials.
- Per-drug detail page.
