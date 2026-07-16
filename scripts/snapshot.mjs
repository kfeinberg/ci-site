// Exports the SQLite DB to a committed JSON snapshot the web app reads.
//
// Why: Vercel is serverless and can't reliably read a local SQLite file / native
// module at request time. The app instead imports this JSON (bundled at build),
// so it runs identically locally and when deployed. Re-scraping regenerates it.

import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data/clarion.db");
const OUT_PATH = resolve(ROOT, "src/data/snapshot.json");

// nowIso is passed in so scrape.mjs and this script share one timestamp source
// (Date.now() is fine in a plain Node script).
export function writeSnapshot(nowIso = new Date().toISOString()) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  const trials = db
    .prepare(
      `SELECT nct_id, title, sponsor, sponsor_class, study_type, phase, status,
              enrollment, primary_completion_date, interventions, conditions,
              countries, last_updated, dropped_at
       FROM trials
       ORDER BY enrollment DESC`
    )
    .all();

  const alerts = db
    .prepare(
      `SELECT id, workspace_id, nct_id, sponsor, type, severity, title, summary,
              field, old_value, new_value, created_at, read
       FROM alerts
       ORDER BY created_at DESC, id DESC`
    )
    .all();

  db.close();

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify({ generatedAt: nowIso, trials, alerts }, null, 2)
  );

  return { trials: trials.length, alerts: alerts.length, path: OUT_PATH };
}
