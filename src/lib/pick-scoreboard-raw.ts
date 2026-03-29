/** Top-level keys kept when persisting fixture scoreboard JSONB (omit `balls` by default for size). */
const SCOREBOARD_RAW_KEYS = [
  "localteam",
  "visitorteam",
  "batting",
  "bowling",
  "runs",
  "scoreboards",
] as const;

export function pickScoreboardRaw(
  merged: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SCOREBOARD_RAW_KEYS) {
    if (Object.prototype.hasOwnProperty.call(merged, k) && merged[k] !== undefined) {
      out[k] = merged[k];
    }
  }
  return out;
}
