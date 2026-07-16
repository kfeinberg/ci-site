// ClinicalTrials.gov scraper → criteria gate → SQLite.
//
// Usage:
//   node scripts/scrape.mjs                       # default: ovarian cancer
//   node scripts/scrape.mjs --query "ovarian cancer"
//   node scripts/scrape.mjs --url "<ct.gov search or api url>"
//   node scripts/scrape.mjs --max-pages 3         # cap pages (100/page) for testing
//   node scripts/scrape.mjs --dry-run             # scrape + gate, but don't write DB
//
// Pipeline: fetch (paginated) -> map -> meetsCriteria() -> upsert into DB.
// Trials that fail the gate are logged to the `rejected` table with reasons.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { meetsCriteria } from "./criteria.mjs";
import { writeSnapshot } from "./snapshot.mjs";
import { detectChanges, detectDropped } from "./detect.mjs";

// Node's built-in fetch ignores http(s)_proxy env vars. If a proxy is set
// (as in this environment), route fetch through it. No-op otherwise.
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY;
if (PROXY) {
  setGlobalDispatcher(new ProxyAgent(PROXY));
  console.log(`Using proxy: ${PROXY}`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data/clarion.db");

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;
const FIELDS = [
  "NCTId",
  "BriefTitle",
  "OverallStatus",
  "Phase",
  "LeadSponsorName",
  "LeadSponsorClass",
  "EnrollmentCount",
  "PrimaryCompletionDate",
  "InterventionName",
  "Condition",
  "StudyType",
  "LocationCountry",
];

// ---------- args ----------
function parseArgs(argv) {
  const args = {
    query: "ovarian cancer",
    url: null,
    maxPages: 0,
    dryRun: false,
    workspace: "ws_ovarian",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--query") args.query = argv[++i];
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--max-pages") args.maxPages = parseInt(argv[++i], 10) || 0;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--workspace") args.workspace = argv[++i];
  }
  return args;
}

// Translate a user-supplied URL (web search or api) into api query params.
// Falls back to a plain condition query.
function buildBaseParams({ url, query }) {
  const params = new URLSearchParams();
  params.set("pageSize", String(PAGE_SIZE));
  params.set("fields", FIELDS.join(","));
  params.set("countTotal", "true");

  if (url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      console.warn(`Could not parse --url; using --query instead.`);
      params.set("query.cond", query);
      return params;
    }
    if (u.pathname.includes("/api/v2/studies")) {
      // Already an API URL — carry over its query.* / filter.* params.
      for (const [k, v] of u.searchParams.entries()) {
        if (k.startsWith("query.") || k.startsWith("filter.")) params.set(k, v);
      }
      if (![...params.keys()].some((k) => k.startsWith("query."))) {
        params.set("query.cond", query);
      }
    } else {
      // A ct.gov website search URL: map common params.
      const cond = u.searchParams.get("cond");
      const term = u.searchParams.get("term");
      params.set("query.cond", cond || query);
      if (term) params.set("query.term", term);
    }
  } else {
    params.set("query.cond", query);
  }
  return params;
}

// ---------- fetch ----------
async function* fetchAllStudies(baseParams, maxPages) {
  let pageToken = null;
  let page = 0;
  let total = null;
  while (true) {
    const params = new URLSearchParams(baseParams);
    if (pageToken) params.set("pageToken", pageToken);
    const url = `${API_BASE}?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CT.gov ${res.status} ${res.statusText} for ${url}`);
    }
    const data = await res.json();
    if (total === null && typeof data.totalCount === "number") {
      total = data.totalCount;
      console.log(`Total matching studies at source: ${total}`);
    }
    const studies = data.studies ?? [];
    page++;
    console.log(`Page ${page}: ${studies.length} studies`);
    for (const s of studies) yield s;

    pageToken = data.nextPageToken ?? null;
    if (!pageToken) break;
    if (maxPages && page >= maxPages) {
      console.log(`Reached --max-pages ${maxPages}; stopping.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 200)); // be polite
  }
}

// ---------- map ----------
function mapStudy(study) {
  const ps = study.protocolSection ?? {};
  const id = ps.identificationModule ?? {};
  const status = ps.statusModule ?? {};
  const design = ps.designModule ?? {};
  const sponsor = ps.sponsorCollaboratorsModule?.leadSponsor ?? {};
  const arms = ps.armsInterventionsModule ?? {};
  const conditions = ps.conditionsModule?.conditions ?? [];
  const locations = ps.contactsLocationsModule?.locations ?? [];
  const countries = Array.from(
    new Set(locations.map((l) => l.country).filter(Boolean))
  );

  return {
    nctId: id.nctId ?? null,
    title: id.briefTitle ?? null,
    sponsor: sponsor.name ?? null,
    sponsorClass: sponsor.class ?? null, // INDUSTRY, NIH, OTHER, ...
    studyType: design.studyType ?? null,
    phases: design.phases ?? [],
    status: status.overallStatus ?? null,
    enrollment: design.enrollmentInfo?.count ?? null,
    primaryCompletionDate: status.primaryCompletionDateStruct?.date ?? null,
    interventions: (arms.interventions ?? []).map((i) => i.name).filter(Boolean),
    conditions,
    countries,
    raw: study,
  };
}

// Collapse a specific reject reason into a category for the summary tally.
function normalizeReason(r) {
  if (r.startsWith("enrollment")) return "enrollment below minimum";
  if (r.startsWith("phase")) return "phase not allowed";
  if (r.startsWith("status")) return "status not active/planned";
  if (r.startsWith("indication")) return "indication mismatch";
  if (r.startsWith("not interventional")) return "not interventional";
  if (r.startsWith("sponsor class")) return "not industry-sponsored";
  if (r.startsWith("no US/EU")) return "no US/EU site";
  if (r.startsWith("primary completion")) return "completion date too stale";
  return r;
}

// Human-friendly phase label from v2 codes.
function phaseLabel(phases) {
  if (!phases || phases.length === 0) return "N/A";
  const map = {
    EARLY_PHASE1: "Early Phase 1",
    PHASE1: "Phase 1",
    PHASE2: "Phase 2",
    PHASE3: "Phase 3",
    PHASE4: "Phase 4",
    NA: "N/A",
  };
  return phases.map((p) => map[p] ?? p).join("/");
}

// ---------- db ----------
function openDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS trials (
      nct_id TEXT PRIMARY KEY,
      title TEXT,
      sponsor TEXT,
      sponsor_class TEXT,
      study_type TEXT,
      phase TEXT,
      status TEXT,
      enrollment INTEGER,
      primary_completion_date TEXT,
      interventions TEXT,
      conditions TEXT,
      countries TEXT,
      raw TEXT,
      first_seen TEXT,
      last_updated TEXT,
      dropped_at TEXT
    );
    CREATE TABLE IF NOT EXISTS rejected (
      nct_id TEXT,
      reasons TEXT,
      seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT,
      nct_id TEXT,
      sponsor TEXT,
      type TEXT,          -- new_trial | enrollment_change | date_change | phase_status_change
      severity TEXT,      -- info | watch | high
      title TEXT,
      summary TEXT,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      created_at TEXT,
      read INTEGER DEFAULT 0
    );
  `);

  // Migrate older DBs: add any columns missing from an earlier schema.
  const existing = new Set(
    db.prepare(`PRAGMA table_info(trials)`).all().map((c) => c.name)
  );
  for (const [col, type] of [
    ["sponsor_class", "TEXT"],
    ["countries", "TEXT"],
    ["dropped_at", "TEXT"],
  ]) {
    if (!existing.has(col)) db.exec(`ALTER TABLE trials ADD COLUMN ${col} ${type}`);
  }
  return db;
}

function makeUpsert(db) {
  return db.prepare(`
    INSERT INTO trials
      (nct_id, title, sponsor, sponsor_class, study_type, phase, status, enrollment,
       primary_completion_date, interventions, conditions, countries, raw, first_seen, last_updated)
    VALUES
      (@nct_id, @title, @sponsor, @sponsor_class, @study_type, @phase, @status, @enrollment,
       @primary_completion_date, @interventions, @conditions, @countries, @raw, @now, @now)
    ON CONFLICT(nct_id) DO UPDATE SET
      title = excluded.title,
      sponsor = excluded.sponsor,
      sponsor_class = excluded.sponsor_class,
      study_type = excluded.study_type,
      phase = excluded.phase,
      status = excluded.status,
      enrollment = excluded.enrollment,
      primary_completion_date = excluded.primary_completion_date,
      interventions = excluded.interventions,
      conditions = excluded.conditions,
      countries = excluded.countries,
      raw = excluded.raw,
      last_updated = @now,
      dropped_at = NULL
  `);
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseParams = buildBaseParams(args);
  console.log(`Query params: ${baseParams.toString()}`);
  if (args.dryRun) console.log("DRY RUN — not writing to DB.");

  const db = args.dryRun ? null : openDb();
  if (db) db.exec("DELETE FROM rejected"); // per-run audit log
  const upsert = db ? makeUpsert(db) : null;
  const insertReject = db
    ? db.prepare(`INSERT INTO rejected (nct_id, reasons, seen_at) VALUES (?, ?, ?)`)
    : null;
  const getExisting = db
    ? db.prepare(
        `SELECT enrollment, status, phase, primary_completion_date FROM trials WHERE nct_id = ?`
      )
    : null;
  const insertAlert = db
    ? db.prepare(`
        INSERT INTO alerts
          (workspace_id, nct_id, sponsor, type, severity, title, summary,
           field, old_value, new_value, created_at, read)
        VALUES
          (@workspace_id, @nct_id, @sponsor, @type, @severity, @title, @summary,
           @field, @old_value, @new_value, @created_at, 0)
      `)
    : null;

  // First-ever scrape into an empty DB is a baseline — don't emit "new trial"
  // alerts for the initial population.
  const isBaseline = db
    ? db.prepare(`SELECT COUNT(*) c FROM trials`).get().c === 0
    : true;
  if (db && isBaseline) console.log("Baseline run (empty DB) — seeding without alerts.");

  // Snapshot of what we were tracking before this run — drives disappearance
  // detection after the fetch loop.
  const trackedBefore = db
    ? db.prepare(`SELECT nct_id, sponsor, status, dropped_at FROM trials`).all()
    : [];
  const acceptedIds = new Set(); // NCT ids that passed the gate this run
  const rejectedStatusById = new Map(); // NCT id -> raw status, for rejected trials

  let seen = 0;
  let accepted = 0;
  let rejected = 0;
  let alertsCreated = 0;
  const alertCounts = {};
  const rejectReasons = {};

  function recordAlert(a) {
    if (!insertAlert) return;
    insertAlert.run({
      workspace_id: args.workspace,
      created_at: new Date().toISOString(),
      field: null,
      old_value: null,
      new_value: null,
      ...a,
    });
    alertsCreated++;
    alertCounts[a.type] = (alertCounts[a.type] ?? 0) + 1;
  }

  for await (const study of fetchAllStudies(baseParams, args.maxPages)) {
    seen++;
    const trial = mapStudy(study);
    if (!trial.nctId) continue;

    const { ok, reasons } = meetsCriteria(trial);
    if (!ok) {
      rejected++;
      if (trial.nctId) rejectedStatusById.set(trial.nctId, trial.status);
      for (const r of reasons) {
        const key = normalizeReason(r);
        rejectReasons[key] = (rejectReasons[key] ?? 0) + 1;
      }
      if (insertReject) {
        insertReject.run(trial.nctId, reasons.join("; "), new Date().toISOString());
      }
      continue;
    }

    accepted++;
    acceptedIds.add(trial.nctId);
    if (db) {
      // --- change detection: compare incoming vs stored BEFORE upserting ---
      const prev = getExisting.get(trial.nctId);
      const newPhase = phaseLabel(trial.phases);

      const changeAlerts = detectChanges(
        prev,
        {
          nctId: trial.nctId,
          sponsor: trial.sponsor,
          title: trial.title,
          enrollment: trial.enrollment,
          status: trial.status,
          phase: newPhase,
          primaryCompletionDate: trial.primaryCompletionDate,
        },
        { isBaseline }
      );
      for (const a of changeAlerts) recordAlert(a);

      upsert.run({
        nct_id: trial.nctId,
        title: trial.title,
        sponsor: trial.sponsor,
        sponsor_class: trial.sponsorClass,
        study_type: trial.studyType,
        phase: newPhase,
        status: trial.status,
        enrollment: trial.enrollment,
        primary_completion_date: trial.primaryCompletionDate,
        interventions: JSON.stringify(trial.interventions),
        conditions: JSON.stringify(trial.conditions),
        countries: JSON.stringify(trial.countries),
        raw: JSON.stringify(trial.raw),
        now: new Date().toISOString(),
      });
    }
  }

  // --- disappearance detection: tracked trials no longer accepted this run ---
  // A previously-tracked trial that didn't pass the gate this run has either gone
  // terminal (terminated/withdrawn/suspended → still in results, now rejected) or
  // vanished from results entirely. We only trust "vanished" on a full run, since
  // a --max-pages-capped run legitimately doesn't see every trial.
  if (db && !isBaseline) {
    const markDropped = db.prepare(
      `UPDATE trials SET dropped_at = @now, status = COALESCE(@status, status) WHERE nct_id = @nct_id`
    );
    const fullRun = args.maxPages === 0;
    for (const row of trackedBefore) {
      if (acceptedIds.has(row.nct_id)) continue; // still active
      if (row.dropped_at) continue; // already alerted on a prior run
      const rejectedStatus = rejectedStatusById.get(row.nct_id) ?? null;
      const observation = rejectedStatus ? { rejectedStatus } : null;
      if (!observation && !fullRun) continue; // can't trust "vanished" on a partial run
      const alert = detectDropped(row, observation);
      if (!alert) continue; // non-terminal rejection — not a real drop
      recordAlert(alert);
      markDropped.run({
        nct_id: row.nct_id,
        now: new Date().toISOString(),
        status: observation ? observation.rejectedStatus : null,
      });
    }
  }

  if (db) db.close();

  // Refresh the JSON snapshot the web app reads.
  if (db) {
    const snap = writeSnapshot();
    console.log(`Snapshot: ${snap.trials} trials, ${snap.alerts} alerts → ${snap.path}`);
  }

  console.log("\n──────── Summary ────────");
  console.log(`Fetched:  ${seen}`);
  console.log(`Accepted: ${accepted}${db ? " (upserted into DB)" : ""}`);
  console.log(`Rejected: ${rejected}`);
  if (rejected > 0) {
    console.log("Rejections by reason:");
    for (const [reason, count] of Object.entries(rejectReasons).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${count.toString().padStart(4)}  ${reason}`);
    }
  }
  if (db) {
    console.log(`\nAlerts created this run: ${alertsCreated}`);
    for (const [type, count] of Object.entries(alertCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${count.toString().padStart(4)}  ${type}`);
    }
    console.log(`\nDB: ${DB_PATH}`);
  }
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});
