// Exports the TCE tables (tce_trials + tce_classifications) to a committed JSON
// snapshot the /engagers page reads — same "bundle a snapshot" model as
// snapshot.mjs, so the app needs no DB/native module at runtime.
//
// Per trial we resolve the T-cell-engager drug and its arm pair by:
//   1) matching each distinct drug (tceDrugTerms) to its LLM classification and
//      preferring a drug the model called a TCE (highest confidence wins);
//   2) falling back to a regex pair pulled from the brief summary when no drug
//      classification yields one.
//
// Usage: node scripts/tce-snapshot.mjs

import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPairFromText, tceDrugTerms } from "./tce-flags.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data/clarion.db");
const OUT_PATH = resolve(ROOT, "src/data/tce-snapshot.json");

const CONF_RANK = { high: 3, medium: 2, low: 1 };

function safeParse(json, fallback) {
  try {
    return JSON.parse(json ?? "");
  } catch {
    return fallback;
  }
}

export function writeTceSnapshot(nowIso = new Date().toISOString()) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  const trials = db
    .prepare(
      `SELECT nct_id, title, brief_summary, sponsor, sponsor_class, phase, status,
              enrollment, primary_completion_date, interventions, conditions,
              countries, matched_terms, enrolls_ovarian, has_us_sites, last_updated
       FROM tce_trials`
    )
    .all();

  const classRows = db
    .prepare(
      `SELECT drug, display_name, is_tce, t_cell_arm, tumor_target, target_pair,
              modality, confidence FROM tce_classifications`
    )
    .all();
  const classByDrug = new Map(classRows.map((r) => [r.drug, r]));

  db.close();

  const out = trials.map((t) => {
    const interventions = safeParse(t.interventions, []);
    const conditions = safeParse(t.conditions, []);
    const countries = safeParse(t.countries, []);
    const matched = safeParse(t.matched_terms, []);

    // Resolve the drug + classification: prefer a TCE-classified drug, else the
    // best-classified drug, else the first distinctive drug name.
    const drugNames = tceDrugTerms(interventions);
    let best = null; // { name, cls }
    for (const name of drugNames) {
      const cls = classByDrug.get(name.toLowerCase());
      if (!cls) {
        best ??= { name, cls: null };
        continue;
      }
      if (!best || !best.cls) {
        best = { name, cls };
        continue;
      }
      // Prefer TCE over non-TCE; within that, higher confidence.
      const better =
        (cls.is_tce ? 1 : 0) - (best.cls.is_tce ? 1 : 0) ||
        (CONF_RANK[cls.confidence] ?? 0) - (CONF_RANK[best.cls.confidence] ?? 0);
      if (better > 0) best = { name, cls };
    }

    const cls = best?.cls ?? null;
    let isTce = Boolean(cls?.is_tce);
    let tCellArm = cls?.is_tce ? cls.t_cell_arm : null;
    let tumorTarget =
      cls?.is_tce && cls.tumor_target !== "unknown" ? cls.tumor_target : null;
    let targetPair =
      cls?.is_tce && cls.target_pair !== "unknown" ? cls.target_pair : null;
    let source = cls?.is_tce ? "llm" : null;

    // Regex fallback: an explicit pair in the summary makes it a TCE even if no
    // drug was classifiable (or fills in a missing target).
    if (!isTce || !targetPair) {
      const pair = extractPairFromText(t.brief_summary);
      if (pair) {
        isTce = true;
        tCellArm = tCellArm ?? pair.tCellArm;
        tumorTarget = tumorTarget ?? pair.tumorTarget;
        targetPair = targetPair ?? pair.pair;
        source = source ?? "regex";
      }
    }

    return {
      nctId: t.nct_id,
      title: t.title,
      summary: (t.brief_summary ?? "").slice(0, 400),
      sponsor: t.sponsor,
      sponsorClass: t.sponsor_class,
      phase: t.phase,
      status: t.status,
      enrollment: t.enrollment,
      primaryCompletionDate: t.primary_completion_date,
      conditions,
      interventions,
      countries,
      matchedTerms: matched,
      enrollsOvarian: Boolean(t.enrolls_ovarian),
      hasUsSites: Boolean(t.has_us_sites),
      drug: best?.name ?? null,
      isTce,
      tCellArm,
      tumorTarget,
      targetPair,
      modality: cls?.modality ?? null,
      confidence: cls?.confidence ?? null,
      classificationSource: source,
      lastUpdated: t.last_updated,
    };
  });

  // Sort: TCEs first, then MUC16 to the top (client's target), then by enrollment.
  out.sort((a, b) => {
    if (a.isTce !== b.isTce) return a.isTce ? -1 : 1;
    const am = a.tumorTarget === "MUC16" ? 1 : 0;
    const bm = b.tumorTarget === "MUC16" ? 1 : 0;
    if (am !== bm) return bm - am;
    return (b.enrollment ?? 0) - (a.enrollment ?? 0);
  });

  const tceCount = out.filter((t) => t.isTce).length;
  const muc16Count = out.filter((t) => t.isTce && t.tumorTarget === "MUC16").length;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { generatedAt: nowIso, total: out.length, tceCount, muc16Count, trials: out },
      null,
      2
    )
  );

  return { total: out.length, tceCount, muc16Count, path: OUT_PATH };
}

// Run directly (not just imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = writeTceSnapshot();
  console.log(
    `TCE snapshot: ${r.total} trials, ${r.tceCount} T-cell engagers, ` +
      `${r.muc16Count} MUC16 → ${r.path}`
  );
}
