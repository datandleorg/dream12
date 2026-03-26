/** Allow only same-origin relative paths (no protocol-relative or external URLs). */
export function safeInternalPath(
  raw: string | string[] | undefined | null,
): string | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  return t;
}
