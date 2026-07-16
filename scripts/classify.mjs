// Mechanism-classification layer — the linchpin for overlap, severity, and
// implications. For each distinct investigational drug, derive its target,
// mechanism class, modality, and line of therapy with Claude, using the trial
// indications + the company-filing summaries edgar.mjs already produced.
//
// Usage:
//   node scripts/classify.mjs            # classify drugs not yet classified
//   node scripts/classify.mjs --force    # re-classify everything
//   node scripts/classify.mjs --dry-run  # show what would be classified
//
// Requires ANTHROPIC_API_KEY (see .env.local). Runs after scrape + edgar.

import "./loadEnv.mjs";
import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import Anthropic from "@anthropic-ai/sdk";
import { writeSnapshot } from "./snapshot.mjs";
import { primaryDrug } from "./drugs.mjs";

const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY;
if (PROXY) setGlobalDispatcher(new ProxyAgent(PROXY));

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "..", "data/clarion.db");

const MODEL = process.env.CLARION_CLASSIFY_MODEL || "claude-opus-4-8";
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Fixed modality set keeps drugs with the same modality consistent for overlap.
const MODALITIES = [
  "ADC", "small molecule", "monoclonal antibody", "bispecific antibody",
  "CAR-T", "cell therapy", "oncolytic virus", "cancer vaccine", "radioligand",
  "peptide", "gene therapy", "immunotherapy", "other", "unknown",
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    target: { type: "string" }, // molecular target/antigen, e.g. "FRα", "TROP2", "WEE1"
    mechanism_class: { type: "string" }, // e.g. "anti-FRα ADC", "WEE1 inhibitor"
    modality: { type: "string", enum: MODALITIES },
    line_of_therapy: { type: "string" }, // e.g. "platinum-resistant", "1L maintenance"
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["target", "mechanism_class", "modality", "line_of_therapy", "confidence"],
};

function parseArgs(argv) {
  return {
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function classifyDrug(drug, ctx) {
  const parts = [`Drug: ${drug}`];
  if (ctx.indications.size) parts.push(`Trial indications: ${[...ctx.indications].slice(0, 6).join("; ")}`);
  if (ctx.titles.length) parts.push(`Example trial: ${ctx.titles[0]}`);
  if (ctx.summaries.length) {
    parts.push("Company filing summaries:\n" + ctx.summaries.slice(0, 6).map((s) => `- ${s}`).join("\n"));
  }
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    system:
      "You are a pharma competitive-intelligence analyst. Classify an " +
      "investigational drug by its molecular target, mechanism class, modality, " +
      "and the line/setting of therapy it is being developed for, using the trial " +
      "indications and company-filing summaries provided. Use standard oncology " +
      "terminology and be consistent, so two drugs with the same mechanism get " +
      "identical mechanism_class strings (e.g. \"anti-FRα ADC\", \"WEE1 inhibitor\", " +
      "\"PARP inhibitor\"). If a field is genuinely not determinable from the " +
      "context, use \"unknown\" and lower your confidence.",
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block ? JSON.parse(block.text) : null;
}

function openDb() {
  const db = new Database(DB_PATH, { fileMustExist: true });
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS drug_classifications (
      drug TEXT PRIMARY KEY,
      display_name TEXT,
      target TEXT,
      mechanism_class TEXT,
      modality TEXT,
      line_of_therapy TEXT,
      confidence TEXT,
      source TEXT DEFAULT 'llm',
      created_at TEXT
    );
  `);
  return db;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!anthropic) {
    console.error("ANTHROPIC_API_KEY not set (see .env.local) — cannot classify.");
    process.exit(1);
  }
  const db = openDb();

  const trials = db
    .prepare(`SELECT nct_id, title, conditions, interventions FROM trials WHERE dropped_at IS NULL`)
    .all();
  const comms = db.prepare(`SELECT matched_term, summary FROM comms`).all();

  // Build per-drug context: indications + trial titles + comm summaries.
  const drugs = new Map(); // lowerKey -> { display, indications:Set, titles:[], summaries:[] }
  const ensure = (name) => {
    const key = name.toLowerCase();
    if (!drugs.has(key)) drugs.set(key, { display: name, indications: new Set(), titles: [], summaries: [] });
    return drugs.get(key);
  };
  for (const t of trials) {
    let interventions = [], conditions = [];
    try { interventions = JSON.parse(t.interventions ?? "[]"); } catch {}
    try { conditions = JSON.parse(t.conditions ?? "[]"); } catch {}
    const drug = primaryDrug(interventions);
    if (!drug) continue;
    const ctx = ensure(drug);
    for (const c of conditions) ctx.indications.add(c);
    if (t.title && ctx.titles.length < 2) ctx.titles.push(t.title);
  }
  for (const c of comms) {
    if (!c.summary || c.summary === "Mentioned in passing.") continue;
    const ctx = drugs.get((c.matched_term ?? "").toLowerCase());
    if (ctx && ctx.summaries.length < 6) ctx.summaries.push(c.summary);
  }

  const already = new Set(
    db.prepare(`SELECT drug FROM drug_classifications`).all().map((r) => r.drug)
  );
  const todo = [...drugs.entries()].filter(([key]) => args.force || !already.has(key));

  console.log(`Distinct drugs: ${drugs.size} | already classified: ${already.size} | to classify: ${todo.length}`);
  if (args.dryRun) {
    for (const [, ctx] of todo) console.log(`  ${ctx.display}  (${ctx.summaries.length} summaries)`);
    db.close();
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO drug_classifications
      (drug, display_name, target, mechanism_class, modality, line_of_therapy, confidence, source, created_at)
    VALUES
      (@drug, @display_name, @target, @mechanism_class, @modality, @line_of_therapy, @confidence, 'llm', @created_at)
    ON CONFLICT(drug) DO UPDATE SET
      display_name = excluded.display_name, target = excluded.target,
      mechanism_class = excluded.mechanism_class, modality = excluded.modality,
      line_of_therapy = excluded.line_of_therapy, confidence = excluded.confidence,
      created_at = excluded.created_at
  `);

  let done = 0;
  for (const [key, ctx] of todo) {
    try {
      const c = await classifyDrug(ctx.display, ctx);
      if (!c) continue;
      upsert.run({
        drug: key,
        display_name: ctx.display,
        target: c.target,
        mechanism_class: c.mechanism_class,
        modality: c.modality,
        line_of_therapy: c.line_of_therapy,
        confidence: c.confidence,
        created_at: new Date().toISOString(),
      });
      done++;
      console.log(`  ✓ ${ctx.display.padEnd(30)} ${c.mechanism_class} · ${c.modality} · ${c.line_of_therapy} [${c.confidence}]`);
    } catch (err) {
      console.warn(`  ! ${ctx.display}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  db.close();
  console.log(`\nClassified ${done} drug(s).`);
  const snap = writeSnapshot();
  console.log(`Snapshot: ${snap.trials} trials, ${snap.alerts} alerts, ${snap.comms} comms`);
}

main().catch((err) => {
  console.error("Classification failed:", err);
  process.exit(1);
});
