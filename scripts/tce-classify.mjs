// TCE arm-pair classification — the layer that turns the messy tce_trials net into
// a clean "is this a T-cell engager, and what are its two arms?" answer.
//
// A TCE is a bispecific antibody with one T-cell arm (CD3/CD28) and one tumor arm
// (MUC16, FOLR1, ...). ct.gov encodes none of this structurally, so we ask Claude
// per DISTINCT DRUG (deduped — ubamatamab classifies once, applies to all its
// trials), feeding it the trial titles/summaries/intervention descriptions where
// the pair is sometimes stated, plus the model's own knowledge of named drugs.
//
// To bound cost we only classify plausible candidates: drugs appearing in a trial
// that (a) matched "bispecific"/"T cell engager", (b) has an explicit arm pair in
// its summary, or (c) enrolls ovarian patients (the priority indication). Because
// classification is per-drug, coverage propagates to that drug's other trials.
//
// Usage:
//   node scripts/tce-classify.mjs             # classify not-yet-classified drugs
//   node scripts/tce-classify.mjs --dry-run   # show candidate count, don't call LLM
//   node scripts/tce-classify.mjs --force     # re-classify everything
//   node scripts/tce-classify.mjs --limit 20  # cap calls (testing)
//
// Requires ANTHROPIC_API_KEY (see .env.local). Run after tce.mjs, before the snapshot.

import "./loadEnv.mjs";
import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import Anthropic from "@anthropic-ai/sdk";
import { extractPairFromText, tceDrugTerms } from "./tce-flags.mjs";

const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY;
if (PROXY) {
  const caPath = process.env.NODE_EXTRA_CA_CERTS || "/etc/ssl/cert.pem";
  const ca = existsSync(caPath) ? readFileSync(caPath) : undefined;
  setGlobalDispatcher(new ProxyAgent(ca ? { uri: PROXY, requestTls: { ca } } : PROXY));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "..", "data/clarion.db");

const MODEL = process.env.CLARION_TCE_MODEL || process.env.CLARION_CLASSIFY_MODEL || "claude-opus-4-8";
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const T_CELL_ARMS = ["CD3", "CD28", "other", "none", "unknown"];
const MODALITIES = [
  "bispecific antibody", "T-cell engager", "monoclonal antibody", "ADC",
  "CAR-T", "cell therapy", "small molecule", "other", "unknown",
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Is this drug a T-cell engager (a bispecific with a CD3/CD28 arm)?
    is_tce: { type: "boolean" },
    t_cell_arm: { type: "string", enum: T_CELL_ARMS },
    tumor_target: { type: "string" }, // e.g. "MUC16", "FOLR1", "CLDN6"; "unknown" if unclear
    target_pair: { type: "string" }, // e.g. "CD3 × MUC16"; "unknown" if unclear
    modality: { type: "string", enum: MODALITIES },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["is_tce", "t_cell_arm", "tumor_target", "target_pair", "modality", "confidence"],
};

function parseArgs(argv) {
  const args = { force: false, dryRun: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10) || 0;
  }
  return args;
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json ?? "");
  } catch {
    return fallback;
  }
}

// A trial is a TCE candidate if it looks like a bispecific/engager, states a pair,
// or enrolls ovarian patients (priority). Only candidates' drugs get classified.
function isCandidate(trial) {
  const terms = safeParse(trial.matched_terms, []);
  if (terms.includes("bispecific") || terms.includes("T cell engager")) return true;
  if (trial.enrolls_ovarian) return true;
  if (extractPairFromText(trial.brief_summary)) return true;
  return false;
}

async function classifyDrug(drug, ctx) {
  const parts = [`Drug: ${drug}`];
  if (ctx.indications.size) {
    parts.push(`Trial indications: ${[...ctx.indications].slice(0, 6).join("; ")}`);
  }
  if (ctx.titles.length) parts.push(`Example trial titles:\n- ${ctx.titles.slice(0, 3).join("\n- ")}`);
  if (ctx.summaries.length) {
    parts.push("Trial/intervention descriptions:\n" + ctx.summaries.slice(0, 4).map((s) => `- ${s.slice(0, 500)}`).join("\n"));
  }
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    system:
      "You are a pharma competitive-intelligence analyst specializing in " +
      "T-cell engagers (TCEs). A TCE is a bispecific antibody with one arm that " +
      "engages a T cell (CD3 or, less often, CD28) and one arm that binds a tumor " +
      "antigen (e.g. MUC16, FOLR1, CLDN6, B7-H4, DLL3, PSMA, EpCAM). Given a drug " +
      "and its trial context, decide whether the drug is a T-cell engager and, if " +
      "so, identify its two arms. Use your knowledge of named investigational " +
      "drugs (e.g. ubamatamab/REGN4018 is CD3×MUC16) even when the trial text does " +
      "not spell out the mechanism. Rules: is_tce=true only if there is a CD3/CD28 " +
      "(or clearly T-cell-engaging) arm — a bispecific like PD-1×CTLA-4 is NOT a " +
      "TCE. Format target_pair as \"<T-cell arm> × <tumor target>\" (e.g. " +
      "\"CD3 × MUC16\"). If the drug is a bispecific but you cannot identify the " +
      "tumor arm, set tumor_target/target_pair to \"unknown\" and lower confidence. " +
      "If it is clearly not a TCE, set is_tce=false, t_cell_arm=\"none\", and give " +
      "the actual modality.",
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block ? JSON.parse(block.text) : null;
}

function openDb() {
  const db = new Database(DB_PATH, { fileMustExist: true });
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tce_classifications (
      drug TEXT PRIMARY KEY,
      display_name TEXT,
      is_tce INTEGER,
      t_cell_arm TEXT,
      tumor_target TEXT,
      target_pair TEXT,
      modality TEXT,
      confidence TEXT,
      source TEXT DEFAULT 'llm',
      created_at TEXT
    );
  `);
  return db;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();

  const trials = db
    .prepare(
      `SELECT nct_id, title, brief_summary, interventions, intervention_descriptions,
              conditions, matched_terms, enrolls_ovarian
       FROM tce_trials`
    )
    .all();

  // Build per-drug context from candidate trials only.
  const drugs = new Map(); // lowerKey -> { display, indications:Set, titles:[], summaries:[] }
  const ensure = (name) => {
    const key = name.toLowerCase();
    if (!drugs.has(key)) {
      drugs.set(key, { display: name, indications: new Set(), titles: [], summaries: [] });
    }
    return drugs.get(key);
  };

  let candidateTrials = 0;
  for (const t of trials) {
    if (!isCandidate(t)) continue;
    candidateTrials++;
    const interventions = safeParse(t.interventions, []);
    const conditions = safeParse(t.conditions, []);
    const descs = safeParse(t.intervention_descriptions, []);
    for (const drug of tceDrugTerms(interventions)) {
      const ctx = ensure(drug);
      for (const c of conditions) ctx.indications.add(c);
      if (t.title && ctx.titles.length < 3) ctx.titles.push(t.title);
      if (t.brief_summary && ctx.summaries.length < 4) ctx.summaries.push(t.brief_summary);
      for (const d of descs) if (ctx.summaries.length < 4) ctx.summaries.push(d);
    }
  }

  const already = new Set(
    db.prepare(`SELECT drug FROM tce_classifications`).all().map((r) => r.drug)
  );
  let todo = [...drugs.entries()].filter(([key]) => args.force || !already.has(key));
  if (args.limit) todo = todo.slice(0, args.limit);

  console.log(
    `Candidate trials: ${candidateTrials} | distinct candidate drugs: ${drugs.size} | ` +
      `already classified: ${already.size} | to classify: ${todo.length}`
  );
  if (args.dryRun) {
    for (const [, ctx] of todo.slice(0, 40)) {
      console.log(`  ${ctx.display}  (${ctx.indications.size} indications, ${ctx.summaries.length} ctx)`);
    }
    if (todo.length > 40) console.log(`  … and ${todo.length - 40} more`);
    db.close();
    return;
  }

  if (!anthropic) {
    console.error("ANTHROPIC_API_KEY not set (see .env.local) — cannot classify.");
    process.exit(1);
  }

  const upsert = db.prepare(`
    INSERT INTO tce_classifications
      (drug, display_name, is_tce, t_cell_arm, tumor_target, target_pair, modality,
       confidence, source, created_at)
    VALUES
      (@drug, @display_name, @is_tce, @t_cell_arm, @tumor_target, @target_pair, @modality,
       @confidence, 'llm', @created_at)
    ON CONFLICT(drug) DO UPDATE SET
      display_name = excluded.display_name, is_tce = excluded.is_tce,
      t_cell_arm = excluded.t_cell_arm, tumor_target = excluded.tumor_target,
      target_pair = excluded.target_pair, modality = excluded.modality,
      confidence = excluded.confidence, created_at = excluded.created_at
  `);

  let done = 0;
  let tceCount = 0;
  for (const [key, ctx] of todo) {
    try {
      const c = await classifyDrug(ctx.display, ctx);
      if (!c) continue;
      upsert.run({
        drug: key,
        display_name: ctx.display,
        is_tce: c.is_tce ? 1 : 0,
        t_cell_arm: c.t_cell_arm,
        tumor_target: c.tumor_target,
        target_pair: c.target_pair,
        modality: c.modality,
        confidence: c.confidence,
        created_at: new Date().toISOString(),
      });
      done++;
      if (c.is_tce) tceCount++;
      const tag = c.is_tce ? `TCE ${c.target_pair}` : `not-TCE (${c.modality})`;
      console.log(`  ${c.is_tce ? "✓" : "·"} ${ctx.display.padEnd(28)} ${tag} [${c.confidence}]`);
    } catch (err) {
      console.warn(`  ! ${ctx.display}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  db.close();
  console.log(`\nClassified ${done} drug(s); ${tceCount} are T-cell engagers.`);
  console.log("Next: node scripts/tce-snapshot.mjs   (export snapshot for the app)");
}

main().catch((err) => {
  console.error("TCE classification failed:", err);
  process.exit(1);
});
