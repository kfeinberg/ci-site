// Pure change-detection functions — no DB, no network.
//
// They take plain objects and return alert objects, so the fixture tests
// (scripts/detect.test.mjs) can exercise them with zero I/O. This is also the
// seam where severity tuning and competitive-overlap (#2) will later plug in.
//
// Alert objects returned here omit workspace_id / created_at — the orchestrator
// (scrape.mjs) stamps those before insert.

// CT.gov statuses that mean a trial has effectively left active development.
export const TERMINAL_STATUSES = new Set([
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
]);

// Human-friendly status label from CT.gov v2 codes (used in alert text).
export function statusLabel(code) {
  const map = {
    NOT_YET_RECRUITING: "Not yet recruiting",
    RECRUITING: "Recruiting",
    ENROLLING_BY_INVITATION: "Enrolling by invitation",
    ACTIVE_NOT_RECRUITING: "Active, not recruiting",
    COMPLETED: "Completed",
    TERMINATED: "Terminated",
    SUSPENDED: "Suspended",
    WITHDRAWN: "Withdrawn",
  };
  return map[code] ?? code ?? "Unknown";
}

/**
 * Diff a previously-stored trial against the incoming one and return alerts.
 *
 * @param prev      DB row or null: { enrollment, status, phase, primary_completion_date }
 *                  `phase` is a label (e.g. "Phase 3"); `status` is a raw v2 code.
 * @param incoming  normalized trial: { nctId, sponsor, title, enrollment,
 *                  status (raw code), phase (label), primaryCompletionDate }
 * @param opts      { isBaseline } — suppress new_trial alerts on the first-ever run.
 * @returns Alert[] (possibly empty)
 */
export function detectChanges(prev, incoming, { isBaseline = false } = {}) {
  const alerts = [];

  // Brand-new trial (not seen before).
  if (!prev) {
    if (!isBaseline) {
      alerts.push({
        nct_id: incoming.nctId,
        sponsor: incoming.sponsor,
        type: "new_trial",
        severity: "watch",
        title: `New ${incoming.phase} trial — ${incoming.sponsor}`,
        summary: incoming.title,
      });
    }
    return alerts;
  }

  // Enrollment target changed.
  if (
    incoming.enrollment != null &&
    prev.enrollment != null &&
    prev.enrollment !== incoming.enrollment
  ) {
    alerts.push({
      nct_id: incoming.nctId,
      sponsor: incoming.sponsor,
      type: "enrollment_change",
      severity: "info",
      title: `${incoming.sponsor} enrollment ${prev.enrollment} → ${incoming.enrollment}`,
      summary: `${incoming.nctId} enrollment count changed.`,
      field: "enrollment",
      old_value: String(prev.enrollment),
      new_value: String(incoming.enrollment),
    });
  }

  // Recruitment status changed (e.g. Recruiting → Active, not recruiting).
  if (prev.status !== incoming.status) {
    alerts.push({
      nct_id: incoming.nctId,
      sponsor: incoming.sponsor,
      type: "phase_status_change",
      severity: "watch",
      title: `${incoming.sponsor} status: ${statusLabel(prev.status)} → ${statusLabel(incoming.status)}`,
      summary: `${incoming.nctId} recruitment status changed.`,
      field: "status",
      old_value: statusLabel(prev.status),
      new_value: statusLabel(incoming.status),
    });
  }

  // Phase changed — the highest-signal advancement event.
  if (prev.phase !== incoming.phase) {
    alerts.push({
      nct_id: incoming.nctId,
      sponsor: incoming.sponsor,
      type: "phase_status_change",
      severity: "high",
      title: `${incoming.sponsor} phase: ${prev.phase} → ${incoming.phase}`,
      summary: `${incoming.nctId} phase changed.`,
      field: "phase",
      old_value: prev.phase,
      new_value: incoming.phase,
    });
  }

  // Primary completion (readout-timing) date changed.
  if ((prev.primary_completion_date ?? "") !== (incoming.primaryCompletionDate ?? "")) {
    alerts.push({
      nct_id: incoming.nctId,
      sponsor: incoming.sponsor,
      type: "date_change",
      severity: "info",
      title: `${incoming.sponsor} completion date ${prev.primary_completion_date ?? "—"} → ${incoming.primaryCompletionDate ?? "—"}`,
      summary: `${incoming.nctId} primary completion date changed.`,
      field: "primary_completion_date",
      old_value: prev.primary_completion_date ?? "—",
      new_value: incoming.primaryCompletionDate ?? "—",
    });
  }

  return alerts;
}

/**
 * A previously-tracked trial that is no longer in the accepted set this run.
 *
 * @param prevTrial   DB row: { nct_id, sponsor, status } (status = last-known raw code)
 * @param observation { rejectedStatus } if it appeared but failed the gate this run,
 *                     or null if it vanished from results entirely.
 * @returns Alert | null. Returns null for non-terminal rejections (transient /
 *          criteria-driven drop-outs we don't want to alert on).
 */
export function detectDropped(prevTrial, observation) {
  // Case 1: still on CT.gov but now terminal (terminated / withdrawn / suspended).
  if (observation && observation.rejectedStatus) {
    if (!TERMINAL_STATUSES.has(observation.rejectedStatus)) return null;
    return {
      nct_id: prevTrial.nct_id,
      sponsor: prevTrial.sponsor,
      type: "trial_dropped",
      severity: "high",
      title: `${prevTrial.sponsor} trial ${statusLabel(observation.rejectedStatus)} — ${prevTrial.nct_id}`,
      summary: `${prevTrial.nct_id} is now ${statusLabel(observation.rejectedStatus)}; dropped from active tracking.`,
      field: "status",
      old_value: statusLabel(prevTrial.status),
      new_value: statusLabel(observation.rejectedStatus),
    };
  }

  // Case 2: vanished from results entirely (removed / no longer matches query).
  return {
    nct_id: prevTrial.nct_id,
    sponsor: prevTrial.sponsor,
    type: "trial_dropped",
    severity: "watch",
    title: `${prevTrial.sponsor} trial no longer listed — ${prevTrial.nct_id}`,
    summary: `${prevTrial.nct_id} no longer appears in CT.gov results for this query.`,
    field: "status",
    old_value: statusLabel(prevTrial.status),
    new_value: "Removed",
  };
}
