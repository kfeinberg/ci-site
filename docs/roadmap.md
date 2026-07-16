# Clarion — Roadmap

Competitive-intelligence monitoring for biotech/pharma, sold to consulting firms.

**Core loop:** define a workspace (disease/indication) → ingest trials + company
communications → detect changes → generate an alert (*what happened → what changed
→ why it matters to this client*) → the client's private portfolio is the filter
that turns a raw data point into a tailored implication.

**Initial scope:** one disease (ovarian cancer), one client portfolio, built on
free data (CT.gov + SEC EDGAR). Prove the loop, land a design partner, *then*
invest in the expensive/complex pieces.

---

## Current state (as of this writing)

**Built:**
- Workspace scoped to ovarian cancer (single, `ws_ovarian`).
- CT.gov ingestion (`scripts/scrape.mjs`) with an editable criteria gate
  (`criteria.jsonc`); rejected trials logged with reasons.
- Baseline "current landscape" summary (`src/lib/landscape.ts`).
- Change detection (`scripts/detect.mjs`, unit-tested): new trial, enrollment,
  status, phase, completion-date, **and trial-dropped** (terminated/withdrawn or
  vanished). Static severity map.
- Alert feed + trial table (CT.gov links, dropped indicator, search + phase/status
  filters, Comms column).
- **Company comms (EDGAR):** per-drug SEC filings filtered to the trial's sponsor
  (fuzzy company match), with AI summaries of the drug-relevant passage
  (`scripts/edgar.mjs`, Anthropic SDK). Trial detail page renders them.
- Deploy model: local scrape → committed `src/data/snapshot.json` → Vercel serves
  static (no DB / scraper / API key at runtime).

**Not built / stubbed:**
- Client portfolio input — skeleton page, in-session only, does not persist.
- Portfolio overlap flag — `src/lib/overlap.ts` exists but nothing feeds it;
  needs mechanism data (see linchpin below).
- Implications — `implication?` field is plumbed to the UI but never generated.
- Scheduled polling — scraping is manual (`npm run scrape` / `npm run edgar`).
- Hosted DB / multi-client isolation.

---

## The linchpin: mechanism-classification layer

Everything differentiated depends on one missing capability. CT.gov gives no clean
**mechanism / target / modality** (the `mechanism` field is empty in the DB).
Without it we cannot flag portfolio overlap, score severity by relevance, or write
a portfolio-relative implication.

**Build:** an LLM classification pass (Anthropic SDK already wired) that derives,
per drug, `{ target, mechanismClass, modality, lineOfTherapy }` from the trial text
+ the comms already scraped. Store on the trial/drug.

This single layer unlocks **overlap detection, severity scoring, and implications**
at once. It is the highest-leverage next step and the product's real moat — cheap
to approximate with an LLM now in a way it wasn't when the incumbents were built.

---

## P0 — Complete the core loop (single disease)

Goal: the full "we caught this competitor move and here's why it threatens your
asset" demo. This is what lands a design partner.

1. **Mechanism-classification layer** (linchpin above) — do this first; the rest
   depend on it.
2. **Persist the client portfolio** — save per-client assets privately (forces the
   first storage decision; see architecture inflection). This is the "secret sauce"
   input that personalizes everything.
3. **Portfolio overlap flag** — with mechanism data, `overlap.ts` becomes real:
   same indication + same mechanism class + comparable phase → threat flag.
   Restore the alerts-header overlap count, populated for real.
4. **Generate implications** — populate the `implication?` field via an LLM call
   over (the change) + (the client's overlapping assets). Keep the two types
   separate: **trial-driven timing** (safe to project — "enrollment closed →
   readout H2 2026") vs **company-stated timing** (report as claimed).
5. **Severity + materiality scoring** — replace the static severity map with a
   scoring function (magnitude + direction + phase + overlap). Doubles as the noise
   filter once polling is automated.

---

## P1 — Differentiation (beyond a scraper)

- **Comms depth** — EDGAR (built) covers US-listed press releases. Add forward-
  looking signal (earnings-call Q&A, IR transcripts) — the signal that often leads
  CT.gov. **Needs a paid license and has scraping-ToS risk — validate demand with
  the free EDGAR signal first.**
- **Comms-ahead-of-CT.gov alerts** — flag when a company mentions a planned trial
  before it appears on CT.gov, or makes a competitive claim on an earnings call.
- **Analog-based timeline prediction** — estimate readout timing from comparable
  historical trials (indication, phase, enrollment target, site count). Requires a
  historical-trial-duration dataset and a defined "comparable" methodology.
- **KOL sentiment** — lightweight tracking of public KOL commentary on tracked
  assets; flag positive/negative early signal.

---

## P2 — Scale & depth

- **Multi-client isolation** — a real security boundary, not a UI filter (clients
  are direct competitors). Decide single-tenant-per-client vs. hardened multi-tenant.
- **Structured analog database** — historical trial-to-trial comparisons as a
  durable asset, not a per-request calculation.
- **Transcript Q&A mining** — systematic extraction of competitive comparisons
  across a coverage universe, not just reactive alerts.
- **Auto-generated deliverables** — turn the alert feed + workspace state into an
  investor-deck-style summary a consultant hands to the client.
- **Configurable alert rules** — per-client materiality thresholds.

---

## P3 — Later / nice to have

- ML-refined enrollment/timeline forecasting (beyond analog-matching).
- Expansion beyond oncology to therapeutic areas with different trial dynamics.
- White-labeling for consulting firms.
- Slack/Teams/email digest delivery + notification preferences.
- Self-serve client onboarding.

---

## Architecture inflection (defer, but plan for it)

The current model — local scrape → committed snapshot → Vercel static — is ideal
for a demo and **cannot** do four things: scheduled polling, read/unread +
acknowledge state, saved private portfolios, and multi-client isolation.

**Do not build multi-tenant infra now.** When a design partner needs live data +
a saved portfolio, add exactly two things:
1. a **scheduled scrape runner** (GitHub Action or a small worker), and
2. a **lightweight hosted store** (Turso/LibSQL or Postgres) for *mutable* per-client
   state only.

Keep CT.gov/EDGAR *content* in the snapshot; put only *mutable* state (portfolios,
read flags, acknowledgements) in the DB. Minimal step up, not a rewrite.

---

## Decisions to resolve

- **Materiality:** what change is worth an alert? Define before automating polling
  (lives in severity scoring) or the feed becomes noise.
- **Comms licensing:** EDGAR is free/public; transcripts/PR feeds likely need a
  paid license — check ToS before P1.
- **Portfolio data security:** competitors as clients → isolation is a trust
  requirement. Decide single- vs multi-tenant early.
- **Analog methodology:** what makes two trials "comparable" for timeline
  prediction? Define before building the P1 math.

---

## Near-term cleanups (low effort, worth doing)

- **Cache comm summaries in the DB** keyed by filing — `edgar` currently
  re-summarizes the whole batch every run; only summarize *new* filings to cut cost.
- **Re-sync button** is disabled (no runtime scrape path) — wire it up once the
  scheduled runner exists.

---

## Recommended sequence

**Mechanism classification → portfolio persistence → overlap → implications →
severity/materiality.** That completes the P0 demo. Only after a design partner is
actively using it, add the scheduled-scrape + hosted-DB step. Defer analog-timeline
prediction and KOL sentiment until the loop has proven it earns its keep — they're
the most complex and least validated.
