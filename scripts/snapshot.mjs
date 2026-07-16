// Exports the SQLite DB to a committed JSON snapshot the web app reads.
//
// Why: Vercel is serverless and can't reliably read a local SQLite file / native
// module at request time. The app instead imports this JSON (bundled at build),
// so it runs identically locally and when deployed. Re-scraping regenerates it.

import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { primaryDrug } from "./drugs.mjs";

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

  // comms (EDGAR filings) may not exist yet if edgar.mjs has never run.
  const hasComms = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='comms'`)
    .get();
  const comms = hasComms
    ? db
        .prepare(
          `SELECT nct_id, matched_term, source, cik, company, form, filed_date,
                  item_codes, accession, doc_url, description, summary
           FROM comms
           ORDER BY filed_date DESC`
        )
        .all()
    : [];

  // Mechanism classifications (may not exist if classify.mjs has never run).
  const hasClass = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='drug_classifications'`)
    .get();
  const classRows = hasClass
    ? db
        .prepare(
          `SELECT drug, display_name, target, mechanism_class, modality,
                  line_of_therapy, confidence FROM drug_classifications`
        )
        .all()
    : [];
  const classByDrug = new Map(classRows.map((r) => [r.drug, r]));

  // Denormalize each trial's primary-drug classification onto the trial row so
  // the app (and overlap logic) can read mechanism/target/modality directly.
  for (const t of trials) {
    let interventions = [];
    try {
      interventions = JSON.parse(t.interventions ?? "[]");
    } catch {
      interventions = [];
    }
    const drug = primaryDrug(interventions);
    const c = drug ? classByDrug.get(drug.toLowerCase()) : null;
    t.drug = drug ?? null;
    t.mechanism_class = c?.mechanism_class ?? null;
    t.target = c?.target ?? null;
    t.modality = c?.modality ?? null;
    t.line_of_therapy = c?.line_of_therapy ?? null;
  }

  db.close();

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify({ generatedAt: nowIso, trials, alerts, comms }, null, 2)
  );

  return {
    trials: trials.length,
    alerts: alerts.length,
    comms: comms.length,
    path: OUT_PATH,
  };
}
