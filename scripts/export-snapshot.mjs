// Regenerate the app's JSON snapshot from the current SQLite DB, without
// re-scraping. Useful after manual DB edits or to refresh the committed file.
//   npm run snapshot

import { writeSnapshot } from "./snapshot.mjs";

try {
  const r = writeSnapshot();
  console.log(`Snapshot written: ${r.trials} trials, ${r.alerts} alerts → ${r.path}`);
} catch (err) {
  console.error("Snapshot failed:", err.message);
  process.exit(1);
}
