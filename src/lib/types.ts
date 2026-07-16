// Domain model for Clarion — P0 (Core MVP).
// Concept: a consultant creates a WORKSPACE scoped to one indication
// (e.g. "ovarian cancer"). We ingest matching trials from ClinicalTrials.gov,
// summarize the baseline landscape, and poll for changes. Each change becomes an
// ALERT. The client's private PortfolioAsset list drives competitive-overlap flags.

export type TrialPhase =
  | "Preclinical"
  | "Phase 1"
  | "Phase 1/2"
  | "Phase 2"
  | "Phase 2/3"
  | "Phase 3"
  | "Phase 4";

// Rough ordering used to compute "who's furthest along".
export const PHASE_RANK: Record<TrialPhase, number> = {
  Preclinical: 0,
  "Phase 1": 1,
  "Phase 1/2": 2,
  "Phase 2": 3,
  "Phase 2/3": 4,
  "Phase 3": 5,
  "Phase 4": 6,
};

export type TrialStatus =
  | "Not yet recruiting"
  | "Recruiting"
  | "Active, not recruiting"
  | "Enrollment complete"
  | "Completed"
  | "Terminated"
  | "Suspended"
  | "Withdrawn";

// A workspace = one engagement scoped to a disease/indication.
export interface Workspace {
  id: string;
  name: string;
  indication: string;
  ctgovQuery: string; // the CT.gov search expression driving ingestion
  createdAt: string; // ISO
  lastSyncedAt: string; // ISO — last CT.gov poll
}

// A clinical trial ingested from CT.gov, scoped to a workspace.
export interface Trial {
  nctId: string; // e.g. "NCT05012345"
  workspaceId: string;
  title: string;
  sponsor: string;
  intervention: string; // asset / drug name
  mechanism: string; // MoA — used for overlap matching
  indication: string;
  phase: TrialPhase;
  status: TrialStatus;
  enrollmentCount: number; // current/target enrollment
  primaryCompletionDate?: string; // ISO — key readout-timing input
  lastUpdated: string; // ISO — CT.gov last change
  droppedAt?: string; // ISO — set when the trial terminated/withdrew or left results
}

// The client's private, per-workspace list of assets to track.
// This is the "secret sauce" input that personalizes overlap/threat flagging.
export interface PortfolioAsset {
  id: string;
  workspaceId: string;
  name: string;
  mechanism: string;
  phase: TrialPhase;
  notes?: string;
}

// P0 alert taxonomy — one per detectable change class.
export type AlertType =
  | "new_trial" // new trial posted for the indication
  | "enrollment_change" // enrollment count changed
  | "date_change" // completion/readout date changed
  | "phase_status_change" // phase or status changed
  | "trial_dropped"; // trial terminated/withdrawn or vanished from results

export type AlertSeverity = "info" | "watch" | "high";

// The specific field-level change that triggered the alert (old -> new).
export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

// Competitive-overlap flag: set when a new/changed trial overlaps a client asset.
export interface OverlapFlag {
  matchedAsset: string; // client PortfolioAsset.name
  reason: string; // why it's flagged (indication + similar mechanism/phase)
}

export interface Alert {
  id: string;
  workspaceId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  summary: string; // what happened
  nctId: string;
  sponsor: string;
  change?: FieldChange; // old -> new for change alerts
  overlap?: OverlapFlag; // present when it overlaps a client asset
  implication?: string; // analyst/LLM "so what" — why this matters (populated later)
  createdAt: string; // ISO
  read: boolean;
}

// A "company communication" — an SEC/EDGAR filing that mentions a trial's drug.
// Linked to a trial by nctId; attributed to whoever actually filed it (which may
// differ from the CT.gov sponsor after M&A / licensing).
export interface Comm {
  nctId: string;
  matchedTerm: string; // the drug name the filing matched on
  source: string; // "edgar"
  cik: string;
  company: string; // the filer
  form: string; // 8-K, 10-Q, 6-K, ...
  filedDate: string; // ISO date
  itemCodes: string; // 8-K item numbers (e.g. "2.02, 9.01")
  accession: string;
  docUrl: string; // direct link to the filing document on sec.gov
  description: string;
  summary: string; // extracted lede from press-release filings ("" if none)
}

// Baseline "current landscape" summary computed on workspace creation.
export interface Landscape {
  headline: string;
  totalTrials: number;
  phase3Count: number;
  furthestAlong?: { nctId: string; sponsor: string; phase: TrialPhase };
  largestTrial?: { nctId: string; sponsor: string; enrollmentCount: number };
  bullets: string[];
}
