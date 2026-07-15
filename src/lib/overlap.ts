// Competitive-overlap detection: a trial overlaps a client asset when it shares
// the same mechanism class (P0 heuristic: case-insensitive mechanism match).
// Later this can broaden to fuzzy mechanism families, indication/line-of-therapy,
// and phase proximity.

import type { PortfolioAsset, Trial } from "./types";

export function overlappingTrialIds(
  trials: Trial[],
  assets: PortfolioAsset[]
): Set<string> {
  const assetMechanisms = new Set(
    assets.map((a) => a.mechanism.trim().toLowerCase())
  );
  const ids = new Set<string>();
  for (const t of trials) {
    if (assetMechanisms.has(t.mechanism.trim().toLowerCase())) {
      ids.add(t.nctId);
    }
  }
  return ids;
}
