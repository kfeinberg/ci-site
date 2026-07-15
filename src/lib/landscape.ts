// Computes the baseline "current landscape" summary for a workspace.
// P0: derived deterministically from the trial list. Later this can be replaced
// or augmented by an LLM narrative.

import { PHASE_RANK, type Landscape, type Trial } from "./types";

export function computeLandscape(indication: string, trials: Trial[]): Landscape {
  const totalTrials = trials.length;
  const phase3Count = trials.filter((t) => t.phase.includes("Phase 3")).length;

  const rank = (p: Trial["phase"]) => PHASE_RANK[p] ?? 0;
  const furthest = trials
    .slice()
    .sort((a, b) => rank(b.phase) - rank(a.phase))[0];

  const largest = trials
    .slice()
    .sort((a, b) => b.enrollmentCount - a.enrollmentCount)[0];

  const sponsors = Array.from(new Set(trials.map((t) => t.sponsor)));
  const mechanisms = Array.from(new Set(trials.map((t) => t.mechanism)));

  const bullets: string[] = [];
  if (furthest) {
    bullets.push(
      `Furthest along: ${furthest.sponsor}'s ${furthest.intervention} (${furthest.phase}, ${furthest.status}).`
    );
  }
  if (largest) {
    bullets.push(
      `Largest study: ${largest.sponsor} at ${largest.enrollmentCount} patients (${largest.nctId}).`
    );
  }
  bullets.push(
    `${sponsors.length} sponsors active across ${mechanisms.length} mechanism classes.`
  );

  return {
    headline: `${totalTrials} trials tracked in ${indication}; ${phase3Count} in Phase 3.`,
    totalTrials,
    phase3Count,
    furthestAlong: furthest
      ? { nctId: furthest.nctId, sponsor: furthest.sponsor, phase: furthest.phase }
      : undefined,
    largestTrial: largest
      ? {
          nctId: largest.nctId,
          sponsor: largest.sponsor,
          enrollmentCount: largest.enrollmentCount,
        }
      : undefined,
    bullets,
  };
}
