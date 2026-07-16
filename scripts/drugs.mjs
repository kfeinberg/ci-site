// Shared drug-name extraction — the single source of truth for turning a trial's
// messy CT.gov intervention list into distinctive investigational drug names.
// Used by edgar.mjs (which filings to search for) and classify.mjs (what to
// classify). Keep the filtering here so both stay in sync.

// Non-drug / non-distinctive intervention terms — generic backbones, comparators,
// procedures. Matching on these surfaces noise, not the program of interest.
export const SKIP_TERMS = new Set([
  "placebo", "chemotherapy", "chemo", "standard of care", "best supportive care",
  "saline", "normal saline", "observation", "no intervention", "investigational agent",
  "combination", "supportive care", "surgery", "radiation", "radiotherapy",
  // generic chemo backbones
  "carboplatin", "paclitaxel", "cisplatin", "doxorubicin", "gemcitabine",
  "pegylated liposomal doxorubicin", "docetaxel", "topotecan", "pemetrexed",
  // generic hormonal / comparator agents used as control arms
  "letrozole", "anastrozole", "tamoxifen", "exemestane", "fulvestrant",
  "axitinib", "bevacizumab",
  // marketed backbone/comparator antibodies
  "avelumab", "pembrolizumab", "nivolumab", "atezolizumab", "durvalumab",
  "ipilimumab", "cetuximab", "rituximab",
]);

// Any term containing one of these substrings is a procedure, premedication, or
// generic category — not the investigational asset.
export const NOISE_SUBSTRINGS = [
  "receptor", "antagonist", "tomography", "medication", "mouthwash", "equivalent",
  "investigator", "choice", "imaging", "scan", "positron", "acetaminophen",
  "dexamethasone", "steroid", "antiemetic", "premedication", "rescue", "biopsy",
  "questionnaire", "procedure", "sugar pill", "vehicle",
];

/**
 * Extract distinctive drug names from a trial's intervention list.
 * Splits combinations, strips parentheticals, and drops generic/noise terms.
 * @param {string[]} interventions
 * @returns {string[]} distinct drug names (original casing, deduped case-insensitively)
 */
export function drugTerms(interventions) {
  const out = new Map(); // lowercased -> original casing
  for (const raw of interventions ?? []) {
    for (const piece of String(raw).split(/[+/,]| plus | and /i)) {
      // Drop parenthetical asides and stray parens before matching.
      const term = piece.replace(/\([^)]*\)/g, "").replace(/[()]/g, "").trim();
      const low = term.toLowerCase();
      if (term.length < 4) continue;
      if (SKIP_TERMS.has(low)) continue;
      if (NOISE_SUBSTRINGS.some((n) => low.includes(n))) continue;
      if (/^(dose|arm|cohort|part [a-z]|group)\b/i.test(low)) continue;
      // Ambiguous short space-codes like "CMP 001" match unrelated names.
      if (/^[a-z]{2,4}\s+\d{1,4}$/i.test(term)) continue;
      if (!out.has(low)) out.set(low, term);
    }
  }
  return [...out.values()];
}

/**
 * The lead investigational drug for a trial — the first distinctive term.
 * CT.gov generally lists the investigational agent first; good enough for
 * overlap/classification at MVP scope.
 * @param {string[]} interventions
 * @returns {string|null}
 */
export function primaryDrug(interventions) {
  return drugTerms(interventions)[0] ?? null;
}
