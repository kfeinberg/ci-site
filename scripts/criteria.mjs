// Criteria gate — decides whether a scraped trial is allowed into the DB.
//
// Rules are defined in ../criteria.jsonc (edit that file). This module loads it,
// merges it over the built-in defaults below, and exposes meetsCriteria().
//
// meetsCriteria(trial) returns { ok, reasons } where `reasons` lists why a
// trial was REJECTED (empty when ok === true). Rejections are logged for audit
// rather than silently dropped.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRITERIA_FILE =
  process.env.CRITERIA_FILE || resolve(__dirname, "..", "criteria.jsonc");

// EU-27 country names as CT.gov reports them (full English). "United Kingdom"
// and "Switzerland" are intentionally NOT included (not EU) — add them to
// criteria.jsonc's siteCountriesAnyOf if you want them.
export const EU_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia",
  "Czech Republic", "Denmark", "Estonia", "Finland", "France", "Germany",
  "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia",
  "Slovenia", "Spain", "Sweden",
];

// Built-in defaults — used for any key not set in criteria.jsonc, or if the
// file is missing entirely.
const DEFAULT_CRITERIA = {
  interventionalOnly: true,
  indicationIncludes: ["ovarian"],
  allowedPhases: ["PHASE3"],
  // "Active or planned" — excludes completed/terminated/withdrawn/etc.
  allowedStatuses: [
    "NOT_YET_RECRUITING",
    "RECRUITING",
    "ENROLLING_BY_INVITATION",
    "ACTIVE_NOT_RECRUITING",
  ],
  excludedStatuses: [],
  minEnrollment: 0,
  requirePrimaryCompletionDate: false,
  // Reject trials whose primary completion date is more than this many months
  // in the past (stale "active" trials that have effectively read out).
  // Undated / future trials are kept. 0 = disabled.
  maxMonthsPastCompletion: 6,
  // Industry-sponsored only (lead sponsor class).
  sponsorClassAnyOf: ["INDUSTRY"],
  // At least one trial site must be in one of these countries.
  siteCountriesAnyOf: ["United States", ...EU_COUNTRIES],
};

// Strip // line comments and /* */ block comments so we can parse JSONC.
function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function loadCriteria() {
  let fileConfig = {};
  try {
    const raw = readFileSync(CRITERIA_FILE, "utf8");
    fileConfig = JSON.parse(stripJsonComments(raw));
    console.log(`Loaded criteria from ${CRITERIA_FILE}`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log("No criteria.jsonc found — using built-in defaults.");
    } else {
      console.warn(
        `Could not parse ${CRITERIA_FILE} (${err.message}); using defaults.`
      );
    }
  }
  return { ...DEFAULT_CRITERIA, ...fileConfig };
}

export const CRITERIA = loadCriteria();

/**
 * @param {object} trial - mapped trial (see mapStudy in scrape.mjs)
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function meetsCriteria(trial) {
  const reasons = [];

  if (CRITERIA.interventionalOnly && trial.studyType !== "INTERVENTIONAL") {
    reasons.push(`not interventional (studyType=${trial.studyType ?? "unknown"})`);
  }

  if (CRITERIA.indicationIncludes?.length > 0) {
    const hay = (trial.conditions ?? []).join(" | ").toLowerCase();
    const match = CRITERIA.indicationIncludes.some((k) =>
      hay.includes(k.toLowerCase())
    );
    if (!match) {
      reasons.push(
        `indication does not include any of [${CRITERIA.indicationIncludes.join(", ")}]`
      );
    }
  }

  if (CRITERIA.allowedPhases?.length > 0) {
    const phases = trial.phases ?? [];
    const match = phases.some((p) => CRITERIA.allowedPhases.includes(p));
    if (!match) {
      reasons.push(`phase [${phases.join(", ") || "none"}] not in allowed set`);
    }
  }

  // Active-or-planned: include-list takes precedence when set.
  if (CRITERIA.allowedStatuses?.length > 0) {
    if (!CRITERIA.allowedStatuses.includes(trial.status)) {
      reasons.push(`status ${trial.status} not in active/planned set`);
    }
  } else if (CRITERIA.excludedStatuses?.includes(trial.status)) {
    reasons.push(`status is ${trial.status}`);
  }

  // Industry-sponsored (lead sponsor class).
  if (CRITERIA.sponsorClassAnyOf?.length > 0) {
    if (!CRITERIA.sponsorClassAnyOf.includes(trial.sponsorClass)) {
      reasons.push(
        `sponsor class ${trial.sponsorClass ?? "unknown"} not in [${CRITERIA.sponsorClassAnyOf.join(", ")}]`
      );
    }
  }

  // Geography: at least one site in an allowed country (e.g. US/EU).
  if (CRITERIA.siteCountriesAnyOf?.length > 0) {
    const allow = new Set(CRITERIA.siteCountriesAnyOf);
    const hasAllowed = (trial.countries ?? []).some((c) => allow.has(c));
    if (!hasAllowed) {
      const list = (trial.countries ?? []).join(", ") || "none listed";
      reasons.push(`no US/EU site (countries: ${list})`);
    }
  }

  if (CRITERIA.minEnrollment > 0) {
    const n = trial.enrollment ?? 0;
    if (n < CRITERIA.minEnrollment) {
      reasons.push(`enrollment ${n} < ${CRITERIA.minEnrollment}`);
    }
  }

  if (CRITERIA.requirePrimaryCompletionDate && !trial.primaryCompletionDate) {
    reasons.push("missing primary completion date");
  }

  // Stale completion: PCD too far in the past. Keeps undated/future trials.
  if (CRITERIA.maxMonthsPastCompletion > 0 && trial.primaryCompletionDate) {
    const pcd = new Date(trial.primaryCompletionDate); // handles YYYY-MM and YYYY-MM-DD
    if (!Number.isNaN(pcd.getTime())) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - CRITERIA.maxMonthsPastCompletion);
      if (pcd < cutoff) {
        reasons.push(
          `primary completion ${trial.primaryCompletionDate} > ${CRITERIA.maxMonthsPastCompletion} months ago`
        );
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}
