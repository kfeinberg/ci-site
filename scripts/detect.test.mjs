// Fixture-based regression tests for the pure detection functions.
// Run with: npm test   (node --test, no external deps)

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectChanges, detectDropped } from "./detect.mjs";

// A representative "current" trial (normalized shape from scrape.mjs mapStudy).
const incoming = {
  nctId: "NCT05012345",
  sponsor: "Merck",
  title: "Phase 3 study of MK-2870 in ovarian cancer",
  enrollment: 540,
  status: "RECRUITING",
  phase: "Phase 3",
  primaryCompletionDate: "2027-06-30",
};

// The matching stored row (DB shape: labelled phase, raw status code).
const prev = {
  enrollment: 540,
  status: "RECRUITING",
  phase: "Phase 3",
  primary_completion_date: "2027-06-30",
};

test("no changes → no alerts", () => {
  assert.deepEqual(detectChanges(prev, incoming), []);
});

test("baseline suppresses new_trial alerts", () => {
  assert.deepEqual(detectChanges(null, incoming, { isBaseline: true }), []);
});

test("new trial (non-baseline) emits one watch alert", () => {
  const alerts = detectChanges(null, incoming, { isBaseline: false });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "new_trial");
  assert.equal(alerts[0].severity, "watch");
});

test("enrollment change → info alert with old/new", () => {
  const alerts = detectChanges({ ...prev, enrollment: 450 }, incoming);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "enrollment_change");
  assert.equal(alerts[0].severity, "info");
  assert.equal(alerts[0].old_value, "450");
  assert.equal(alerts[0].new_value, "540");
});

test("status change → watch alert with human labels", () => {
  const alerts = detectChanges({ ...prev, status: "ACTIVE_NOT_RECRUITING" }, incoming);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "phase_status_change");
  assert.equal(alerts[0].severity, "watch");
  assert.equal(alerts[0].old_value, "Active, not recruiting");
  assert.equal(alerts[0].new_value, "Recruiting");
});

test("phase change → high-severity alert", () => {
  const alerts = detectChanges({ ...prev, phase: "Phase 2" }, incoming);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "phase_status_change");
  assert.equal(alerts[0].severity, "high");
});

test("completion date change → info alert", () => {
  const alerts = detectChanges({ ...prev, primary_completion_date: "2026-12-31" }, incoming);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "date_change");
});

test("multiple simultaneous changes each emit an alert", () => {
  const alerts = detectChanges(
    { enrollment: 450, status: "ACTIVE_NOT_RECRUITING", phase: "Phase 2", primary_completion_date: "2026-12-31" },
    incoming
  );
  assert.equal(alerts.length, 4);
});

test("null enrollment on either side is not treated as a change", () => {
  assert.deepEqual(detectChanges({ ...prev, enrollment: null }, { ...incoming, enrollment: null }), []);
  assert.deepEqual(detectChanges({ ...prev, enrollment: null }, incoming), []);
});

// ── disappearance detection ────────────────────────────────────────────────

const dropped = { nct_id: "NCT05012345", sponsor: "Merck", status: "RECRUITING" };

test("terminal-status drop → high-severity trial_dropped", () => {
  const alert = detectDropped(dropped, { rejectedStatus: "TERMINATED" });
  assert.equal(alert.type, "trial_dropped");
  assert.equal(alert.severity, "high");
  assert.equal(alert.new_value, "Terminated");
  assert.equal(alert.old_value, "Recruiting");
});

test("non-terminal rejection does NOT emit a drop alert", () => {
  // e.g. still recruiting but failed some other criterion this run — transient.
  assert.equal(detectDropped(dropped, { rejectedStatus: "RECRUITING" }), null);
});

test("vanished-entirely → watch-severity trial_dropped", () => {
  const alert = detectDropped(dropped, null);
  assert.equal(alert.type, "trial_dropped");
  assert.equal(alert.severity, "watch");
  assert.equal(alert.new_value, "Removed");
});
