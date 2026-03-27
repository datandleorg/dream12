/**
 * Maps SportMonks Cricket position strings (`position.name`, squad `position_label`)
 * to fantasy `players.role` codes used in tabs / rules.
 *
 * Observed `sm_season_squad.position_label` values include: Batsman, Bowler,
 * Wicketkeeper, Allrounder, Batting Allrounder, Bowling Allrounder,
 * Middle Order Batter (and similar *batter* batting roles).
 */
export type FantasyRole = "BAT" | "BOWL" | "AR" | "WK";

function normalizePositionLabel(pos: string): string {
  return pos
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

const EXACT_POSITION_ROLE: Record<string, FantasyRole> = {
  wicketkeeper: "WK",
  "wicketkeeper batsman": "WK",
  "wicketkeeper batter": "WK",
  batsman: "BAT",
  bowler: "BOWL",
  allrounder: "AR",
  "batting allrounder": "AR",
  "bowling allrounder": "AR",
  /** Hyphen or extra spacing in API strings */
  "batting all rounder": "AR",
  "bowling all rounder": "AR",
  /** SportMonks batting variants (see sm_season_squad audit) */
  "middle order batter": "BAT",
  "opening batter": "BAT",
};

export function inferRoleFromPositionLabel(pos?: string | null): FantasyRole {
  if (pos == null || !String(pos).trim()) return "BAT";
  const k = normalizePositionLabel(String(pos));

  const direct = EXACT_POSITION_ROLE[k];
  if (direct) return direct;

  // Compounds before generic substrings (e.g. "bowling allrounder" contains "bowler").
  if (
    k.includes("batting allrounder") ||
    k.includes("bowling allrounder") ||
    k.includes("batting all rounder") ||
    k.includes("bowling all rounder")
  ) {
    return "AR";
  }

  if (
    k.includes("wicketkeeper") ||
    k.includes("wicket-keeper") ||
    k.includes("wicket keeper")
  ) {
    return "WK";
  }

  if (k.includes("allrounder") || k.includes("all-rounder") || k.includes("all rounder")) {
    return "AR";
  }

  if (k.includes("bowler")) return "BOWL";
  if (k.includes("batsman")) return "BAT";
  /** "Middle Order Batter", "Opening Batter", etc. — after WK / AR / BOWL checks */
  if (k.includes("batter")) return "BAT";

  if (k.includes("wk")) return "WK";

  return "BAT";
}

/**
 * SportMonks sometimes sends `position: { name }` or `position: { data: { name } }`.
 */
export function extractSportmonksPositionName(
  position: string | { name?: string; data?: unknown } | undefined | null,
): string | undefined {
  if (position == null) return undefined;
  if (typeof position === "string") {
    const t = position.trim();
    return t || undefined;
  }
  if (typeof position !== "object") return undefined;
  const o = position as { name?: string; data?: unknown };
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  const inner = o.data;
  if (inner && typeof inner === "object" && inner !== null && "name" in inner) {
    const n = (inner as { name?: string }).name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  return undefined;
}
