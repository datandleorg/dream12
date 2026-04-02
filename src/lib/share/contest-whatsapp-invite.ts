export function formatInrWhole(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export type ContestWhatsAppInviteInput = {
  contestTitle: string;
  matchLabel: string;
  entryFee: number;
  prizePool: number;
  /** Absolute URL to the contest leaderboard page */
  contestUrl: string;
};

/** Strip whitespace/newlines so WhatsApp parses a single clean https URL. */
export function normalizeContestUrlForShare(raw: string): string {
  const u = raw.trim().replace(/[\s\u200b\uFEFF]+/g, "");
  if (!u) return raw.trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

export function matchLabelFromMatchCard(card: {
  team_a: string | null;
  team_b: string | null;
  name: string;
}): string {
  const a = card.team_a?.trim();
  const b = card.team_b?.trim();
  if (a && b) return `${a} vs ${b}`;
  const parts = card.name.split(/\s+vs\s+/i);
  if (parts.length >= 2) {
    const left = parts[0]?.trim();
    const right = parts[1]?.trim();
    if (left && right) return `${left} vs ${right}`;
  }
  const fallback = card.name.trim();
  return fallback.length > 0 ? fallback : "this match";
}

/**
 * Pre-filled body for WhatsApp (plain text). Put the bare https URL on the **first line**:
 * WhatsApp reliably turns that into a tappable link (URLs after emoji/₹ blocks often stay plain text).
 * Repeat the same URL once at the end so a long preview still exposes a link.
 */
export function buildContestWhatsAppInviteMessage(
  input: ContestWhatsAppInviteInput,
): string {
  const link = normalizeContestUrlForShare(input.contestUrl);
  const fee = formatInrWhole(input.entryFee);
  const pool = formatInrWhole(input.prizePool);
  return [
    link,
    "",
    "🔥 Join my Dream12 contest — think you can beat me?",
    "",
    `Contest: "${input.contestTitle}"`,
    "",
    "Match:",
    input.matchLabel,
    "",
    `Entry: ${fee}`,
    `Prize pool: ${pool}`,
    "",
    "Tap a link to open Dream12 in your browser.",
    "",
    link,
  ].join("\n");
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
