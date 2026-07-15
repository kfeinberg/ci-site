# Clarion — Competitive Intelligence for Biotech/Pharma

Clarion is a monitoring tool for competitive-intelligence teams at consulting firms.
You point it at a disease area (right now: **ovarian cancer**), and it keeps a live,
filtered list of the clinical trials that matter — then tells you whenever one of them
changes.

**Where it stands today:** an early working version that pulls real data from
ClinicalTrials.gov, narrows it to the competitively relevant Phase 3 ovarian trials, and
flags changes over time. Ovarian cancer is the test case; other disease areas come later.

---

## What it does

1. **Collects** every ovarian-cancer trial listed on ClinicalTrials.gov (~5,200 of them).
2. **Filters** them down to the competitively relevant set (currently **20 trials**) using
   the rules below.
3. **Watches for changes** — each time it runs, it compares every tracked trial to what it
   looked like last time.
4. **Alerts** you when something moves: a new trial appears, enrollment changes, the status
   changes (e.g. starts or finishes recruiting), or a completion/readout date shifts.

Running it again when nothing has changed produces no new alerts — you only hear about real
movement.

---

## Which trials we track

Of the ~5,211 ovarian trials on ClinicalTrials.gov, **20 make the cut.** A trial is kept
only if it passes **every** rule below. (A single trial can fail several rules at once, so
the "removed" numbers add up to more than 5,211.)

| Rule | What it means | Trials removed |
|------|---------------|---------------:|
| 1. Interventional | It tests a treatment (drug/biologic), not just an observational or registry study | 1,058 |
| 2. Ovarian | The listed condition actually mentions "ovarian" | 1,419 |
| 3. Phase 3 | It's a Phase 3 trial (a Phase 2/3 counts, since it includes a Phase 3 stage) | 4,774 |
| 4. Active or planned | It's recruiting, about to recruit, or ongoing — **not** completed, terminated, withdrawn, or suspended | 3,869 |
| 5. Industry-sponsored | The lead sponsor is a company (not purely academic/government) | 3,893 |
| 6. Runs in the US or Europe | Has at least one trial site in the US, EU, UK, or Switzerland | 1,713 |
| 7. Not stale | Its primary completion date isn't already more than 6 months in the past | 3,851 |

We are **not** currently filtering on trial size (enrollment) — no minimum patient count is
applied.

### Rule 6 — which countries count

A trial passes if **at least one** of its sites is in one of these countries. (So a trial
running in both the US and China passes; a China-only trial does not. Trials that list no
sites at all are dropped.)

- **US:** United States
- **UK & Switzerland:** United Kingdom, Switzerland
- **EU (all 27):** Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia,
  Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg,
  Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden

### Rule 7 — what "not stale" means

- The cutoff is **6 months before the day the tool runs.** A trial is dropped if its primary
  completion date falls before that cutoff.
- Example: for the run on **July 15, 2026**, the cutoff was **January 15, 2026** — trials that
  were due to complete before then were dropped.
- Because the cutoff is tied to the run date, it **moves forward every time you run** the tool.
- Trials with **no completion date**, or a date **in the future**, are **kept**.

---

## Cases that need a human's judgment

The number "20" is exactly what the rules produce — it is **not** a definitive count of every
competitively relevant trial. These situations are handled bluntly and deserve a closer look:

1. **Academic-led but company-funded pivotal trials — the biggest gap.** 23 trials pass every
   rule *except* Rule 5. They're run by cooperative groups (ENGOT, GOG-Foundation, AGO) but the
   drug and funding come from a company — ClinicalTrials.gov just lists the academic group as the
   sponsor. These are often the *most* important Phase 3s. Recommended fix: also count trials
   where a company is a **collaborator**, not only the lead sponsor.
2. **Trials that just reported.** 9 trials pass everything except Rule 7 (they completed more than
   6 months ago). A trial that recently read out can still be highly relevant. Consider keeping
   recently-completed trials, flagged as "likely reported."
3. **Trials with no listed sites.** 13 trials pass everything except Rule 6, only because
   ClinicalTrials.gov lists no locations for them. We currently drop these — some may be relevant
   global programs.
4. **Related cancers.** Rule 2 only matches the word "ovarian." Fallopian-tube and primary-peritoneal
   cancers are clinically grouped with ovarian but may not say "ovarian" — so they're missed today.
5. **Phase 2 threats.** A competitively important Phase 2 asset is excluded by design (Rule 3).
   Revisit if earlier-stage threats matter to you.
6. **Phase 2/3 trials** are counted as Phase 3 (they include a Phase 3 stage). Confirm that's what
   you want.
7. **Source data errors** — see the next section.

---

## Data you can't fully trust (ClinicalTrials.gov quirks)

ClinicalTrials.gov is filled out by the trial sponsors, so the data is uneven. Real examples we
found in the ovarian data (July 2026):

- **Phase is sometimes left blank on drug trials.** `NCT00647023`, an interventional metformin
  study, has its phase recorded as "N/A." Our Phase 3 rule silently drops trials like this — so a
  genuine Phase 3 whose phase field was never filled in would be wrongly excluded.
- **Patient counts can be wrong.** Some trials list enrollment as `0` (a placeholder that was never
  updated — e.g. `NCT01386502`, `NCT02948101`); one (`NCT04334239`) lists **670,000**. This is part
  of why we don't yet filter on trial size.
- **The ClinicalTrials.gov search is loose.** A search for "ovarian cancer" also returns things like
  a polycystic *ovary* syndrome study (`NCT00647023`) and a 670,000-patient cancer-registry
  (`NCT04334239`). Our filter removes these — but it shows the raw list is noisy, and that matching on
  the single word "ovarian" is imperfect in both directions.

---

## A note on what we keep

Today we store **only the 20 qualifying trials**, not the ~5,200 that were filtered out. One
consequence: if a trial later *becomes* relevant (say it advances from Phase 2 to Phase 3, or adds a
US site), we can't show how it changed, because we never kept its earlier state. Keeping every trial
(and simply tagging which ones qualify) would fix this — a straightforward change when we want it.

---

# Technical reference (for developers)

## Pipeline

```
ClinicalTrials.gov v2 API
        │  npm run scrape  (scripts/scrape.mjs)
        ▼
   fetch (paginated) ─▶ map ─▶ criteria gate ─▶ change detection ─▶ SQLite (data/clarion.db)
                                (criteria.jsonc)      (diff vs stored)        │
                                                                     Next.js app reads (src/lib/db.ts)
                                                                              ▼
                                                        Overview · Trials · Alerts
```

Change detection writes one alert row per change (`new_trial`, `enrollment_change`,
`date_change`, `phase_status_change`). It's idempotent (no changes → no alerts); the first run
against an empty DB is treated as a baseline (no "everything is new" spam).

## Criteria → data-field mapping

Rules live in `criteria.jsonc`. Each maps to a ClinicalTrials.gov v2 field:

| Rule | CT.gov field | `criteria.jsonc` key |
|------|--------------|----------------------|
| Interventional | `designModule.studyType` | `interventionalOnly` |
| Ovarian | `conditionsModule.conditions[]` | `indicationIncludes` |
| Phase 3 | `designModule.phases[]` | `allowedPhases` |
| Active/planned | `statusModule.overallStatus` | `allowedStatuses` |
| Industry | `sponsorCollaboratorsModule.leadSponsor.class` (`INDUSTRY`) | `sponsorClassAnyOf` |
| Geography | `contactsLocationsModule.locations[].country` | `siteCountriesAnyOf` |
| Not stale | `statusModule.primaryCompletionDateStruct.date` | `maxMonthsPastCompletion` |

Not currently applied: `minEnrollment` (0) and `requirePrimaryCompletionDate` (false).

## Database

**Current: SQLite** (single file `data/clarion.db`, via `better-sqlite3`). Tables:
- `trials` — qualifying trials (all fields + raw JSON + `first_seen` / `last_updated`)
- `alerts` — change feed (type, severity, old→new, timestamps, read flag)
- `rejected` — per-run audit of what was filtered out and why

SQLite is the right choice while this runs on one machine (scraper writes, app reads).
**Migrate to Postgres** (Supabase / Neon / RDS) when the app is hosted on the web, multiple
people use it at once, or scrapes run as a separate scheduled service. The migration is
contained: DB access is isolated to `scripts/scrape.mjs` (writer) and `src/lib/db.ts` (reader),
and the schema is plain SQL — swap the driver, keep the tables.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · SQLite (better-sqlite3)

## Running it

```bash
npm install
npm run dev        # app at http://localhost:3000
npm run scrape     # collect → filter → detect changes → write DB
```

Scrape options:
```bash
npm run scrape -- --dry-run        # filter only, no DB writes
npm run scrape -- --max-pages 3    # cap pages (100/page) for testing
npm run scrape -- --query "ovarian cancer"
npm run scrape -- --url "<ct.gov search or api url>"
```

Reset to a clean baseline: `rm -f data/clarion.db data/clarion.db-* && npm run scrape`

## Project layout

```
scripts/
  scrape.mjs         collector → criteria gate → change detection → SQLite
  criteria.mjs       the filter (loads criteria.jsonc)
criteria.jsonc       editable filter rules
data/clarion.db      SQLite database (gitignored)
src/
  app/               Next.js pages (workspace list, Overview · Trials · Alerts)
  components/         Sidebar, nav, cards, table, badges
  lib/
    db.ts            reads the DB for the app
    types.ts         data model
    landscape.ts     landscape summary
```

## Next steps

1. **Schedule scrapes** so change detection runs automatically.
2. **Keep every trial** (tag which qualify) to catch trials crossing into the criteria.
3. **Classify mechanism of action** to power competitive-overlap flagging.
4. **Postgres + accounts + per-client separation** when hosting for multiple clients.
