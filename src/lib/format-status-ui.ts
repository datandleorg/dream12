/**
 * Display helper for status enums / API strings in the UI (ALL CAPS, underscores as spaces).
 */
export function formatStatusLabel(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/_/g, " ").toUpperCase();
}
