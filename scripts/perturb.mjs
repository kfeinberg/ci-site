// Demo seeder — makes the NEXT full scrape produce real alerts.
//
// The change-detection engine only fires when the stored "before" differs from
// the freshly-scraped "after". On a fresh DB there's nothing to diff, so alerts
// are empty. This script rolls back / alters a few fields on real trials (and
// injects one trial that will vanish), so that running:
//
//   node scripts/perturb.mjs      # mutate stored state
//   npm run scrape                # full re-scrape restores true values -> diffs
//
// yields a realistic spread of alert types & severities for the demo.
//
// Safe to re-run. Requires an existing DB (run `npm run scrape` once first).

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "..", "data/clarion.db");

if (!existsSync(DB_PATH)) {
  console.error(`No DB at ${DB_PATH}. Run \`npm run scrape\` once first.`);
  process.exit(1);
}

const db = new Database(DB_PATH);

// Defensive migration — this script may run against a DB created before the
// dropped_at column existed (scrape.mjs adds it, but perturb runs first).
const cols = new Set(db.prepare(`PRAGMA table_info(trials)`).all().map((c) => c.name));
if (!cols.has("dropped_at")) db.exec(`ALTER TABLE trials ADD COLUMN dropped_at TEXT`);

// Pick 4 distinct real trials (largest first — recognizable in the demo).
const targets = db
  .prepare(
    `SELECT nct_id, sponsor, enrollment, status, phase, primary_completion_date
     FROM trials
     WHERE dropped_at IS NULL
     ORDER BY enrollment DESC
     LIMIT 4`
  )
  .all();

if (targets.length < 4) {
  console.error(`Need at least 4 tracked trials to perturb; found ${targets.length}.`);
  process.exit(1);
}

const planned = [];

// 1) enrollment_change (info): lower the stored count so re-scrape shows a bump.
{
  const t = targets[0];
  const newVal = Math.max(1, (t.enrollment ?? 200) - 150);
  db.prepare(`UPDATE trials SET enrollment = ? WHERE nct_id = ?`).run(newVal, t.nct_id);
  planned.push(`enrollment_change  ${t.nct_id}  ${newVal} → (live) ${t.enrollment}`);
}

// 2) phase_status_change (high): downgrade stored phase so re-scrape shows advance.
{
  const t = targets[1];
  db.prepare(`UPDATE trials SET phase = ? WHERE nct_id = ?`).run("Phase 2", t.nct_id);
  planned.push(`phase change (high) ${t.nct_id}  Phase 2 → (live) ${t.phase}`);
}

// 3) phase_status_change (watch): alter stored status so re-scrape shows a shift.
{
  const t = targets[2];
  db.prepare(`UPDATE trials SET status = ? WHERE nct_id = ?`).run("NOT_YET_RECRUITING", t.nct_id);
  planned.push(`status change (watch) ${t.nct_id}  Not yet recruiting → (live) ${t.status}`);
}

// 4) date_change (info): shift stored completion date so re-scrape shows a change.
{
  const t = targets[3];
  db.prepare(`UPDATE trials SET primary_completion_date = ? WHERE nct_id = ?`).run("2025-01", t.nct_id);
  planned.push(`date_change  ${t.nct_id}  2025-01 → (live) ${t.primary_completion_date ?? "—"}`);
}

// 5) trial_dropped (watch): inject a trial that won't appear in live results.
const FAKE_ID = "NCT09999999";
db.prepare(
  `INSERT INTO trials
     (nct_id, title, sponsor, sponsor_class, study_type, phase, status, enrollment,
      primary_completion_date, interventions, conditions, countries, raw,
      first_seen, last_updated, dropped_at)
   VALUES
     (@id, @title, @sponsor, 'INDUSTRY', 'INTERVENTIONAL', 'Phase 3', 'RECRUITING', 300,
      '2027-06', '[]', '["Ovarian cancer"]', '["United States"]', '{}',
      @now, @now, NULL)
   ON CONFLICT(nct_id) DO UPDATE SET dropped_at = NULL, status = 'RECRUITING'`
).run({
  id: FAKE_ID,
  title: "Phase 3 Demo Trial That Will Be Dropped",
  sponsor: "Acme Oncology",
  now: new Date().toISOString(),
});
planned.push(`trial_dropped (watch) ${FAKE_ID}  (injected; vanishes on full scrape)`);

db.close();

console.log("Perturbed stored state. Planned alerts on next FULL scrape:\n");
for (const p of planned) console.log("  " + p);
console.log(
  "\nNow run:  npm run scrape   (a full run — no --max-pages, so the vanished\n" +
    "trial is trusted as dropped). Then reload the app to see the alerts."
);
