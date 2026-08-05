// T-cell engager (TCE) pull from ClinicalTrials.gov — no criteria gate.
//
// Unlike scrape.mjs (which is indication-scoped to ovarian and gated on
// phase/sponsor/location), this pulls EVERY trial whose text hits the TCE
// modality net, across all indications, phases, sponsors, and locations. The
// TCE-vs-not-TCE call and the arm-pair extraction happen later, in
// tce-classify.mjs. Here we just gather candidates + compute two cheap flags.
//
// Usage:
//   node scripts/tce.mjs                 # full pull into data/clarion.db (tce_trials)
//   node scripts/tce.mjs --max-pages 2   # cap pages (100/page) for testing
//   node scripts/tce.mjs --dry-run       # fetch + summarize, don't write DB

import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import {
  enrollsOvarian,
  hasUsSites,
  isQueryableTceDrug,
  matchedTerms,
} from "./tce-flags.mjs";

// Node's built-in fetch ignores http(s)_proxy env vars; route through the proxy
// if one is set (as in this environment). This proxy tunnels to the real origin,
// but Node ships its own CA store and won't trust the chain that curl validates
// via /etc/ssl/cert.pem — so feed that bundle to the ProxyAgent's TLS. No-op if
// no proxy is set.
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY;
if (PROXY) {
  const caPath = process.env.NODE_EXTRA_CA_CERTS || "/etc/ssl/cert.pem";
  const ca = existsSync(caPath) ? readFileSync(caPath) : undefined;
  setGlobalDispatcher(new ProxyAgent(ca ? { uri: PROXY, requestTls: { ca } } : PROXY));
  console.log(`Using proxy: ${PROXY}${ca ? ` (CA: ${caPath})` : ""}`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(ROOT, "data/clarion.db");

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;

// The modality net. "T cell engager" has no structured code, so we cast wide and
// let classification separate true TCEs from other bispecifics / CD3 noise.
const TCE_QUERY =
  '"T cell engager" OR "T-cell engager" OR bispecific OR CD3 OR CD28';

// Extended field set — beyond scrape.mjs we need the free text where arm pairs
// live (BriefSummary, InterventionDescription) plus Keyword for ovarian flagging.
const FIELDS = [
  "NCTId",
  "BriefTitle",
  "BriefSummary",
  "OverallStatus",
  "Phase",
  "LeadSponsorName",
  "LeadSponsorClass",
  "EnrollmentCount",
  "PrimaryCompletionDate",
  "InterventionName",
  "InterventionDescription",
  "Keyword",
  "Condition",
  "StudyType",
  "LocationCountry",
];

function parseArgs(argv) {
  const args = { maxPages: 0, dryRun: false, augment: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-pages") args.maxPages = parseInt(argv[++i], 10) || 0;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--augment") args.augment = true;
  }
  return args;
}

function buildBaseParams(term = TCE_QUERY) {
  const params = new URLSearchParams();
  params.set("pageSize", String(PAGE_SIZE));
  params.set("fields", FIELDS.join(","));
  params.set("countTotal", "true");
  params.set("query.term", term);
  return params;
}

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

function mapStudy(study) {
  const ps = study.protocolSection ?? {};
  const id = ps.identificationModule ?? {};
  const status = ps.statusModule ?? {};
  const design = ps.designModule ?? {};
  const sponsor = ps.sponsorCollaboratorsModule?.leadSponsor ?? {};
  const arms = ps.armsInterventionsModule ?? {};
  const descMod = ps.descriptionModule ?? {};
  const condMod = ps.conditionsModule ?? {};
  const conditions = condMod.conditions ?? [];
  const keywords = condMod.keywords ?? [];
  const interventions = arms.interventions ?? [];
  const locations = ps.contactsLocationsModule?.locations ?? [];
  const countries = Array.from(
    new Set(locations.map((l) => l.country).filter(Boolean))
  );

  return {
    nctId: id.nctId ?? null,
    title: id.briefTitle ?? null,
    briefSummary: descMod.briefSummary ?? null,
    sponsor: sponsor.name ?? null,
    sponsorClass: sponsor.class ?? null,
    studyType: design.studyType ?? null,
    phases: design.phases ?? [],
    status: status.overallStatus ?? null,
    enrollment: design.enrollmentInfo?.count ?? null,
    primaryCompletionDate: status.primaryCompletionDateStruct?.date ?? null,
    interventions: interventions.map((i) => i.name).filter(Boolean),
    interventionDescriptions: interventions
      .map((i) => i.description)
      .filter(Boolean),
    conditions,
    keywords,
    countries,
    raw: study,
  };
}

// Human-friendly phase label from v2 codes (shared shape with scrape.mjs).
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

function openDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tce_trials (
      nct_id TEXT PRIMARY KEY,
      title TEXT,
      brief_summary TEXT,
      sponsor TEXT,
      sponsor_class TEXT,
      study_type TEXT,
      phase TEXT,
      status TEXT,
      enrollment INTEGER,
      primary_completion_date TEXT,
      interventions TEXT,
      intervention_descriptions TEXT,
      conditions TEXT,
      keywords TEXT,
      countries TEXT,
      matched_terms TEXT,
      enrolls_ovarian INTEGER,
      has_us_sites INTEGER,
      raw TEXT,
      first_seen TEXT,
      last_updated TEXT
    );
  `);
  return db;
}

function makeUpsert(db) {
  return db.prepare(`
    INSERT INTO tce_trials
      (nct_id, title, brief_summary, sponsor, sponsor_class, study_type, phase,
       status, enrollment, primary_completion_date, interventions,
       intervention_descriptions, conditions, keywords, countries, matched_terms,
       enrolls_ovarian, has_us_sites, raw, first_seen, last_updated)
    VALUES
      (@nct_id, @title, @brief_summary, @sponsor, @sponsor_class, @study_type, @phase,
       @status, @enrollment, @primary_completion_date, @interventions,
       @intervention_descriptions, @conditions, @keywords, @countries, @matched_terms,
       @enrolls_ovarian, @has_us_sites, @raw, @now, @now)
    ON CONFLICT(nct_id) DO UPDATE SET
      title = excluded.title,
      brief_summary = excluded.brief_summary,
      sponsor = excluded.sponsor,
      sponsor_class = excluded.sponsor_class,
      study_type = excluded.study_type,
      phase = excluded.phase,
      status = excluded.status,
      enrollment = excluded.enrollment,
      primary_completion_date = excluded.primary_completion_date,
      interventions = excluded.interventions,
      intervention_descriptions = excluded.intervention_descriptions,
      conditions = excluded.conditions,
      keywords = excluded.keywords,
      countries = excluded.countries,
      matched_terms = excluded.matched_terms,
      enrolls_ovarian = excluded.enrolls_ovarian,
      has_us_sites = excluded.has_us_sites,
      raw = excluded.raw,
      last_updated = @now
  `);
}

// Map a study, compute flags, and upsert it. Returns the derived flags/terms so
// callers can tally. Shared by the net pull and the by-drug augmentation.
function storeStudy(study, upsert) {
  const t = mapStudy(study);
  if (!t.nctId) return null;
  const terms = matchedTerms({
    title: t.title,
    briefSummary: t.briefSummary,
    interventions: t.interventions,
    keywords: t.keywords,
  });
  const ovarianFlag = enrollsOvarian({
    conditions: t.conditions,
    keywords: t.keywords,
    title: t.title,
  });
  const usFlag = hasUsSites(t.countries);
  if (upsert) {
    upsert.run({
      nct_id: t.nctId,
      title: t.title,
      brief_summary: t.briefSummary,
      sponsor: t.sponsor,
      sponsor_class: t.sponsorClass,
      study_type: t.studyType,
      phase: phaseLabel(t.phases),
      status: t.status,
      enrollment: t.enrollment,
      primary_completion_date: t.primaryCompletionDate,
      interventions: JSON.stringify(t.interventions),
      intervention_descriptions: JSON.stringify(t.interventionDescriptions),
      conditions: JSON.stringify(t.conditions),
      keywords: JSON.stringify(t.keywords),
      countries: JSON.stringify(t.countries),
      matched_terms: JSON.stringify(terms),
      enrolls_ovarian: ovarianFlag ? 1 : 0,
      has_us_sites: usFlag ? 1 : 0,
      raw: JSON.stringify(t.raw),
      now: new Date().toISOString(),
    });
  }
  return { nctId: t.nctId, terms, ovarianFlag, usFlag };
}

// Second pass: pull trials by confirmed-TCE drug NAME. The keyword net misses
// trials that never mention "bispecific/CD3/CD28" (e.g. "Ubamatamab + chemo"),
// so we re-query ct.gov for each queryable TCE drug and fill the gaps. Requires
// tce-classify.mjs to have run first.
async function augment(db) {
  const drugs = db
    .prepare(`SELECT display_name FROM tce_classifications WHERE is_tce = 1`)
    .all()
    .map((r) => r.display_name)
    .filter(isQueryableTceDrug);
  const uniq = [...new Set(drugs)];
  console.log(`Confirmed-TCE queryable drugs: ${uniq.length}`);

  const existing = new Set(
    db.prepare(`SELECT nct_id FROM tce_trials`).all().map((r) => r.nct_id)
  );
  const upsert = makeUpsert(db);

  let added = 0;
  let refreshed = 0;
  for (const drug of uniq) {
    const params = buildBaseParams(`"${drug}"`);
    let found = 0;
    try {
      for await (const study of fetchAllStudies(params, 0)) {
        const r = storeStudy(study, upsert);
        if (!r) continue;
        found++;
        if (existing.has(r.nctId)) refreshed++;
        else {
          added++;
          existing.add(r.nctId);
        }
      }
    } catch (err) {
      console.warn(`  ! "${drug}": ${err.message}`);
      continue;
    }
    console.log(`  ${drug.padEnd(24)} ${found} trial(s)`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`\nAugment: +${added} new trials, ${refreshed} already present.`);
  console.log("Re-run classify (for any new drugs) then snapshot.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.augment) {
    const db = openDb();
    await augment(db);
    db.close();
    return;
  }

  const baseParams = buildBaseParams();
  console.log(`Query params: ${baseParams.toString()}`);
  if (args.dryRun) console.log("DRY RUN — not writing to DB.");

  const db = args.dryRun ? null : openDb();
  const upsert = db ? makeUpsert(db) : null;

  let seen = 0;
  let stored = 0;
  let ovarian = 0;
  let usSites = 0;
  const termTally = {};

  for await (const study of fetchAllStudies(baseParams, args.maxPages)) {
    seen++;
    const r = storeStudy(study, upsert);
    if (!r) continue;

    for (const term of r.terms) termTally[term] = (termTally[term] ?? 0) + 1;
    if (r.ovarianFlag) ovarian++;
    if (r.usFlag) usSites++;
    if (upsert) stored++;
  }

  if (db) db.close();

  console.log("\n──────── Summary ────────");
  console.log(`Fetched: ${seen}`);
  console.log(`Stored:  ${stored}${db ? " (upserted into tce_trials)" : ""}`);
  console.log(`Enroll ovarian: ${ovarian}`);
  console.log(`Has US sites:   ${usSites}`);
  console.log("Matched-term tally:");
  for (const [term, count] of Object.entries(termTally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(5)}  ${term}`);
  }
  if (db) {
    console.log(`\nDB: ${DB_PATH}`);
    console.log("Next: node scripts/tce-classify.mjs   (extract arm pairs + confirm TCE)");
  }
}

main().catch((err) => {
  console.error("TCE pull failed:", err);
  process.exit(1);
});
