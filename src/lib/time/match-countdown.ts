/** Remaining milliseconds until `startIso`; negative if start is in the past. */
export function msUntilStart(startIso: string): number {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return 0;
  return t - Date.now();
}

/**
 * Human-readable countdown until match start.
 * @param endedLabel - when remaining ms <= 0 (default `"Started"`)
 */
export function formatMatchCountdown(
  remainingMs: number,
  endedLabel = "Started",
): string {
  if (remainingMs <= 0) return endedLabel;
  const s = Math.floor(remainingMs / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${sec}s left`;
  if (h > 0) return `${h}h ${m}m ${sec}s left`;
  return `${m}m ${sec}s left`;
}

/** Compact label for list cards (coarse tick). */
export function formatMatchCountdownCoarse(
  remainingMs: number,
  endedLabel = "Live / started",
): string {
  if (remainingMs <= 0) return endedLabel;
  const s = Math.floor(remainingMs / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
