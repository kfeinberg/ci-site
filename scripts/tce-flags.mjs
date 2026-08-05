// Shared, pure helpers for the T-cell engager (TCE) tracker — kept together so the
// scraper, snapshot exporter, and unit tests all use identical logic.
//
// A TCE is a bispecific antibody with one T-cell-recruiting arm (CD3 or CD28) and
// one tumor-antigen arm (e.g. MUC16, FOLR1, CLDN6). ct.gov has no structured field
// for any of this, so:
//   - flags (ovarian / US sites) are derived from the structured fields we do get;
//   - the arm pair is primarily extracted by the LLM (tce-classify.mjs), with the
//     regex here as a fallback for trials whose brief summary states it explicitly.

import { SKIP_TERMS, NOISE_SUBSTRINGS } from "./drugs.mjs";

// The net keywords we search ct.gov with; used to tag which term(s) matched a trial.
export const NET_TERMS = ["T cell engager", "bispecific", "CD3", "CD28"];

// Ovarian-cancer trials are clinically grouped with fallopian-tube and primary-
// peritoneal cancers (same trials enroll all three), so we flag any of them.
const OVARIAN_RE = /ovarian|fallopian tube|primary peritoneal|peritoneal cavity/i;

/**
 * Does this trial enroll ovarian (incl. fallopian-tube / primary-peritoneal)
 * cancer patients? Checks conditions, keywords, and the title.
 * @param {{conditions?: string[], keywords?: string[], title?: string|null}} t
 */
export function enrollsOvarian({ conditions = [], keywords = [], title = "" } = {}) {
  const hay = [...conditions, ...keywords, title ?? ""].join(" ");
  return OVARIAN_RE.test(hay);
}

/**
 * Does this trial have at least one site in the United States?
 * @param {string[]} countries
 */
export function hasUsSites(countries = []) {
  return countries.some((c) => /^united states$/i.test(String(c).trim()));
}

/**
 * Which net keywords appear in the trial's text — a cheap signal for triage.
 * "engager"/"bispecific" are high-signal; a lone "CD3"/"CD28" is often noise.
 * @param {{title?: string|null, briefSummary?: string|null, interventions?: string[], keywords?: string[]}} t
 * @returns {string[]} subset of NET_TERMS (canonical labels)
 */
export function matchedTerms({
  title = "",
  briefSummary = "",
  interventions = [],
  keywords = [],
} = {}) {
  const hay = [title ?? "", briefSummary ?? "", ...interventions, ...keywords]
    .join(" ")
    .toLowerCase();
  const hits = [];
  if (/\bt[\s-]?cell engager|\btce\b/.test(hay)) hits.push("T cell engager");
  if (/bispecific/.test(hay)) hits.push("bispecific");
  // Word-boundary CD3/CD28 so we don't match "CD38", "CD30", etc.
  if (/\bcd3\b/.test(hay)) hits.push("CD3");
  if (/\bcd28\b/.test(hay)) hits.push("CD28");
  return hits;
}

// CT.gov intervention-type prefixes ("Drug:", "Biological:", …) that some sponsors
// prepend, sometimes doubled ("Drug: Drug: …").
const TYPE_PREFIX_RE = /^\s*(drug|biological|biologic|procedure|device|other|dietary supplement|radiation|genetic|combination product)\s*:\s*/i;
// Dosing / schedule / route noise that fragments one drug into many "distinct" ones.
// mg/kg first (so the "/kg" doesn't survive), then bare doses (no leading \b, to
// catch glued forms like "Cisplatin50mg"), AUC, schedules, stray "/kg", routes.
const PERKG_RE = /\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ug|ng|g|ml)\s*\/\s*kg/gi;
const DOSE_RE = /\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ug|ng|g|ml|kg|iu|units?)\b/gi;
const AUC_RE = /\bauc\s*\d+(?:\.\d+)?/gi;
const SCHED_RE = /\bq\d?w\b|\bq\d+d\b|\bbid\b|\btid\b|\bqd\b|\bqw\b|\bd\d+\b/gi;
const KG_RE = /\/?\s*\bkg\b/gi;
const ROUTE_RE = /\b(?:i\.?v\.?|p\.?o\.?|s\.?c\.?|iv\s?drip|drip|infusion|injection|oral|intravenous|subcutaneous)\b/gi;

// Whole-word tokens that mark a piece as a dosing/protocol phrase, not a drug name.
const PHRASE_NOISE = new Set([
  "dose", "doses", "dosing", "escalating", "escalation", "expansion", "mtd",
  "rp2d", "cohort", "cycle", "week", "day", "surveillance", "followup", "targeting",
  "and", "or", "at", "the", "with", "for", "then", "off", "kg", "mg", "ml", "part",
]);

/**
 * Extract distinctive investigational drug names from a TCE trial's intervention
 * list. Like drugs.mjs's drugTerms but tuned for this dataset: strips CT.gov type
 * prefixes and dosing/schedule/route noise, and KEEPS spaced drug codes such as
 * "AMG 160" / "ISB 1302" (which drugs.mjs deliberately drops for the ovarian pull).
 * @param {string[]} interventions
 * @returns {string[]} distinct drug names (original casing, deduped case-insensitively)
 */
export function tceDrugTerms(interventions) {
  const out = new Map(); // lowercased -> original casing
  for (const raw of interventions ?? []) {
    let s = String(raw);
    while (TYPE_PREFIX_RE.test(s)) s = s.replace(TYPE_PREFIX_RE, "");
    s = s
      .replace(PERKG_RE, " ")
      .replace(DOSE_RE, " ")
      .replace(AUC_RE, " ")
      .replace(SCHED_RE, " ")
      .replace(KG_RE, " ")
      .replace(ROUTE_RE, " ");
    for (const piece of s.split(/[+/,;]| plus | and /i)) {
      const term = piece.replace(/\([^)]*\)/g, "").replace(/[()]/g, "").replace(/\s+/g, " ").trim();
      const low = term.toLowerCase();
      if (term.length < 3) continue;
      if (SKIP_TERMS.has(low)) continue;
      if (NOISE_SUBSTRINGS.some((n) => low.includes(n))) continue;
      if (/^(dose|arm|cohort|part|group|placebo|cycle|week|day)\b/i.test(low)) continue;
      if (/^\d/.test(term)) continue; // leftover dosing fragment
      if (/\d\s?(?:mg|kg|ml|mcg|µg|ug|ng|g|iu)\b/i.test(low)) continue; // glued dose remnant
      const words = low.split(/\s+/);
      if (words.length > 4) continue; // drug names are short; longer = description
      if (words.some((w) => PHRASE_NOISE.has(w))) continue; // dosing/protocol phrase
      if (!out.has(low)) out.set(low, term);
    }
  }
  return [...out.values()];
}

// Generic / descriptive words that mean a "drug name" is actually a category or
// procedure — never safe to run as a by-name ct.gov query (would pull garbage).
const NON_QUERYABLE = [
  "bispecific", "antibody", "monoclonal", "bite", "therapy", "agent", "treatment",
  "blood", "draw", "administration", "activated", "biological", "vaccine", "cik",
  "car-t", "car t", "cells", "cell ", "on t", "t cell", "t-cell", "fpbmc", "infusion",
  "placebo", "chemo", "combination", "product", "recombinant",
];

/**
 * Is this confirmed-TCE drug name specific enough to pull trials by name from
 * ct.gov (query.term="<name>")? Accepts drug codes (letter+digit, e.g. "REGN4018",
 * "AMG 340") and INN-style names (a single alphabetic token ≥8 chars, e.g.
 * "ubamatamab"); rejects bare targets ("BCMA", "CD3"), category labels
 * ("Bispecific antibody"), and procedures ("Blood draw").
 * @param {string|null} name
 */
export function isQueryableTceDrug(name) {
  if (!name) return false;
  const raw = String(name).trim();
  if (raw.length <= 4) return false; // bare targets / acronyms: CD3, GD2, HER2, PSMA
  if (/[*]/.test(raw)) return false; // odd punctuation breaks queries / is a fragment
  const low = raw.toLowerCase();
  if (NON_QUERYABLE.some((g) => low.includes(g))) return false;
  const hasLetter = /[a-z]/i.test(raw);
  const hasDigit = /\d/.test(raw);
  if (hasLetter && hasDigit) return true; // drug code, e.g. AZD0486, BI 764532
  const tokens = low.split(/\s+/);
  if (tokens.length === 1 && /^[a-z]{8,}$/.test(low)) return true; // INN, e.g. ubamatamab
  return false;
}

// Tokens that look like a target but aren't (so the regex fallback ignores them).
const NOT_A_TARGET = new Set([
  "bispecific", "bispecifics", "antibody", "mab", "mabs", "engager", "engagers",
  "tce", "cd3", "cd28", "based", "targeting", "arm", "the", "an", "a",
]);

/**
 * Fallback: pull an explicit "CD3 × TARGET" (or "TARGET × CD3") arm pair out of a
 * free-text brief summary, for trials the LLM couldn't resolve from a drug name.
 * Handles "x", "×", "/", and "anti-" prefixes; e.g. "B7-H4 x CD3 bispecific mAb".
 * @param {string|null} text
 * @returns {{tCellArm: string, tumorTarget: string, pair: string}|null}
 */
export function extractPairFromText(text) {
  if (!text) return null;
  const TARGET = "(?:anti-?)?([A-Za-z0-9][A-Za-z0-9-]{1,13})";
  const ARM = "(?:anti-?)?(CD3|CD28)";
  const sep = "\\s*[x×/]\\s*";
  const patterns = [
    new RegExp(`\\b${ARM}${sep}${TARGET}`, "i"), // CD3 x TARGET
    new RegExp(`\\b${TARGET}${sep}${ARM}`, "i"), // TARGET x CD3
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    // Group order flips between the two patterns; find the arm vs the target.
    const g1 = m[1];
    const g2 = m[2];
    const arm = /^cd(3|28)$/i.test(g1) ? g1 : g2;
    const target = arm === g1 ? g2 : g1;
    if (!target || NOT_A_TARGET.has(target.toLowerCase())) continue;
    const tCellArm = arm.toUpperCase();
    const tumorTarget = target.toUpperCase();
    return { tCellArm, tumorTarget, pair: `${tCellArm} × ${tumorTarget}` };
  }
  return null;
}
