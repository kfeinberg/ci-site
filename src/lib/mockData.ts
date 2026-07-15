// Mock data for the P0 skeleton. Replace with CT.gov ingestion + a database.
// The ovarian workspace is the fleshed-out demo path; NSCLC is a lighter second
// workspace to show the list view.

import type {
  Alert,
  PortfolioAsset,
  Trial,
  Workspace,
} from "./types";

export const workspaces: Workspace[] = [
  {
    id: "ws_ovarian",
    name: "Ovarian Cancer Landscape",
    indication: "Ovarian cancer",
    ctgovQuery: "ovarian cancer",
    createdAt: "2026-05-02",
    lastSyncedAt: "2026-07-14T08:00:00Z",
  },
  {
    id: "ws_nsclc",
    name: "NSCLC — EGFR",
    indication: "EGFR-mutant NSCLC",
    ctgovQuery: "EGFR-mutant non-small cell lung cancer",
    createdAt: "2026-06-11",
    lastSyncedAt: "2026-07-14T08:00:00Z",
  },
];

export const trials: Trial[] = [
  // --- Ovarian workspace ---
  {
    nctId: "NCT05012345",
    workspaceId: "ws_ovarian",
    title:
      "Phase 3 Study of MK-2870 Plus Chemotherapy in Platinum-Resistant Ovarian Cancer",
    sponsor: "Merck",
    intervention: "MK-2870",
    mechanism: "Anti-TROP2 ADC",
    indication: "Platinum-resistant ovarian cancer",
    phase: "Phase 3",
    status: "Recruiting",
    enrollmentCount: 540,
    primaryCompletionDate: "2027-06-30",
    lastUpdated: "2026-07-10",
  },
  {
    nctId: "NCT04998877",
    workspaceId: "ws_ovarian",
    title:
      "Maintenance PARP Inhibitor in Newly Diagnosed Advanced Ovarian Cancer",
    sponsor: "AstraZeneca",
    intervention: "AZD5305",
    mechanism: "PARP1 inhibitor",
    indication: "Ovarian cancer",
    phase: "Phase 3",
    status: "Enrollment complete",
    enrollmentCount: 620,
    primaryCompletionDate: "2026-12-15",
    lastUpdated: "2026-07-08",
  },
  {
    nctId: "NCT05445100",
    workspaceId: "ws_ovarian",
    title:
      "Phase 3 Trial of a Folate Receptor-alpha ADC in Platinum-Resistant Ovarian Cancer",
    sponsor: "AbbVie",
    intervention: "Mirvetuximab soravtansine",
    mechanism: "Anti-FRα ADC",
    indication: "Platinum-resistant ovarian cancer",
    phase: "Phase 3",
    status: "Recruiting",
    enrollmentCount: 430,
    primaryCompletionDate: "2027-01-31",
    lastUpdated: "2026-07-13",
  },
  {
    nctId: "NCT05330000",
    workspaceId: "ws_ovarian",
    title: "Niraparib Combination in Recurrent Ovarian Cancer",
    sponsor: "GSK",
    intervention: "Niraparib + investigational agent",
    mechanism: "PARP inhibitor",
    indication: "Ovarian cancer",
    phase: "Phase 2",
    status: "Active, not recruiting",
    enrollmentCount: 210,
    primaryCompletionDate: "2027-01-15",
    lastUpdated: "2026-07-11",
  },
  {
    nctId: "NCT05600000",
    workspaceId: "ws_ovarian",
    title: "First-in-Human Bispecific in Advanced Ovarian Cancer",
    sponsor: "Genmab",
    intervention: "GEN-1046",
    mechanism: "CD3xFRα bispecific",
    indication: "Ovarian cancer",
    phase: "Phase 1/2",
    status: "Recruiting",
    enrollmentCount: 90,
    primaryCompletionDate: "2028-03-01",
    lastUpdated: "2026-07-02",
  },

  // --- NSCLC workspace ---
  {
    nctId: "NCT05224466",
    workspaceId: "ws_nsclc",
    title: "Phase 2 Study of Novel ADC in EGFR-Mutant NSCLC",
    sponsor: "J&J",
    intervention: "JNJ-ZZZZ",
    mechanism: "EGFR-MET bispecific ADC",
    indication: "EGFR-mutant NSCLC",
    phase: "Phase 2",
    status: "Recruiting",
    enrollmentCount: 180,
    primaryCompletionDate: "2027-03-01",
    lastUpdated: "2026-07-12",
  },
  {
    nctId: "NCT05119900",
    workspaceId: "ws_nsclc",
    title: "Third-Generation EGFR TKI in First-Line EGFR-Mutant NSCLC",
    sponsor: "AstraZeneca",
    intervention: "Osimertinib next-gen",
    mechanism: "EGFR TKI",
    indication: "EGFR-mutant NSCLC",
    phase: "Phase 3",
    status: "Active, not recruiting",
    enrollmentCount: 680,
    primaryCompletionDate: "2026-11-30",
    lastUpdated: "2026-07-09",
  },
];

// Client's private tracked assets, per workspace.
export const portfolioAssets: PortfolioAsset[] = [
  {
    id: "pa_1",
    workspaceId: "ws_ovarian",
    name: "ONX-201 (internal)",
    mechanism: "Anti-FRα ADC",
    phase: "Phase 2",
    notes: "Lead asset; platinum-resistant ovarian.",
  },
  {
    id: "pa_2",
    workspaceId: "ws_nsclc",
    name: "ASSET-220 (internal)",
    mechanism: "EGFR-MET bispecific ADC",
    phase: "Phase 1/2",
  },
];

export const alerts: Alert[] = [
  {
    id: "al_001",
    workspaceId: "ws_ovarian",
    type: "new_trial",
    severity: "high",
    title: "New Phase 3 FRα ADC trial posted — overlaps ONX-201",
    summary:
      "AbbVie registered NCT05445100: a Phase 3 anti-FRα ADC in platinum-resistant ovarian cancer, 430 patients across the same setting as your lead asset.",
    nctId: "NCT05445100",
    sponsor: "AbbVie",
    overlap: {
      matchedAsset: "ONX-201 (internal)",
      reason:
        "Same indication (platinum-resistant ovarian) and same mechanism class (anti-FRα ADC); competitor is at Phase 3 vs. your Phase 2.",
    },
    createdAt: "2026-07-13T10:15:00Z",
    read: false,
  },
  {
    id: "al_002",
    workspaceId: "ws_ovarian",
    type: "enrollment_change",
    severity: "watch",
    title: "Merck MK-2870 Phase 3 enrollment raised 450 → 540",
    summary:
      "NCT05012345 increased its enrollment target by 90 patients.",
    nctId: "NCT05012345",
    sponsor: "Merck",
    change: { field: "enrollmentCount", from: "450", to: "540" },
    createdAt: "2026-07-10T14:22:00Z",
    read: false,
  },
  {
    id: "al_003",
    workspaceId: "ws_ovarian",
    type: "phase_status_change",
    severity: "watch",
    title: "AZD5305 Phase 3 status: Recruiting → Enrollment complete",
    summary:
      "NCT04998877 finished enrolling — a leading indicator for a data readout.",
    nctId: "NCT04998877",
    sponsor: "AstraZeneca",
    change: { field: "status", from: "Recruiting", to: "Enrollment complete" },
    createdAt: "2026-07-08T09:05:00Z",
    read: true,
  },
  {
    id: "al_004",
    workspaceId: "ws_ovarian",
    type: "date_change",
    severity: "info",
    title: "GSK niraparib completion date pushed 2026-09-30 → 2027-01-15",
    summary:
      "NCT05330000 primary completion date slipped ~3.5 months.",
    nctId: "NCT05330000",
    sponsor: "GSK",
    change: {
      field: "primaryCompletionDate",
      from: "2026-09-30",
      to: "2027-01-15",
    },
    createdAt: "2026-07-11T12:00:00Z",
    read: true,
  },
  {
    id: "al_101",
    workspaceId: "ws_nsclc",
    type: "new_trial",
    severity: "high",
    title: "New J&J Phase 2 ADC trial posted — overlaps ASSET-220",
    summary:
      "NCT05224466 newly registered: EGFR-MET bispecific ADC in EGFR-mutant NSCLC.",
    nctId: "NCT05224466",
    sponsor: "J&J",
    overlap: {
      matchedAsset: "ASSET-220 (internal)",
      reason:
        "Same indication (EGFR-mutant NSCLC) and same mechanism class (EGFR-MET bispecific ADC).",
    },
    createdAt: "2026-07-12T11:40:00Z",
    read: false,
  },
];

// --- lookups ---

export function workspaceById(id: string): Workspace | undefined {
  return workspaces.find((w) => w.id === id);
}

export function trialsForWorkspace(workspaceId: string): Trial[] {
  return trials.filter((t) => t.workspaceId === workspaceId);
}

export function alertsForWorkspace(workspaceId: string): Alert[] {
  return alerts
    .filter((a) => a.workspaceId === workspaceId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function assetsForWorkspace(workspaceId: string): PortfolioAsset[] {
  return portfolioAssets.filter((p) => p.workspaceId === workspaceId);
}
