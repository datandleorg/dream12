import {
  applyCaptainMultipliers,
  pointsForPlayer,
  type NormalizedPlayerStats,
  type PlayerKind,
} from "@/lib/fantasy/scoring";

export type RosterRow = {
  player_id: string;
  sportmonks_id: number | null;
  role: string;
  /** From `players.in_playing_xi`; +4 when true (starting XI bonus). */
  in_playing_xi: boolean | null;
};

/** Roster row plus display fields for leaderboard team preview. */
export type TeamBreakdownRosterRow = RosterRow & {
  player_name: string;
  team_label: string;
};

export type TeamBreakdownLine = {
  player_id: string;
  player_name: string;
  team_label: string;
  role: string;
  points: number;
  perf_points: number;
  xi_bonus: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  in_playing_xi: boolean | null;
  missing_stats: boolean;
};

function roleToKind(role: string): PlayerKind {
  switch (role) {
    case "WK":
      return "wk";
    case "BOWL":
      return "bowl";
    case "AR":
      return "ar";
    default:
      return "bat";
  }
}

const XI_BONUS = 4;

/** Live maps from JSON/API may use numeric strings; coercing avoids NaN totals and broken RSC serialization. */
function statNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function statBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (v === "true" || v === 1) return true;
  return false;
}

function normalizedStatsFromLiveRaw(
  raw: Partial<NormalizedPlayerStats>,
): NormalizedPlayerStats {
  return {
    runs: statNum(raw.runs),
    ballsFaced: statNum(raw.ballsFaced),
    fours: statNum(raw.fours),
    sixes: statNum(raw.sixes),
    isDismissed: statBool(raw.isDismissed),
    wickets: statNum(raw.wickets),
    bowledLbwDismissals:
      raw.bowledLbwDismissals != null ? statNum(raw.bowledLbwDismissals) : undefined,
    oversBowled: statNum(raw.oversBowled),
    runsConceded: statNum(raw.runsConceded),
    maidens: statNum(raw.maidens),
    catches: statNum(raw.catches),
    stumpings: statNum(raw.stumpings),
    runOutDirect: raw.runOutDirect != null ? statNum(raw.runOutDirect) : undefined,
    runOutIndirect: raw.runOutIndirect != null ? statNum(raw.runOutIndirect) : undefined,
    runOuts: statNum(raw.runOuts),
  };
}

/**
 * Sum fantasy points for a saved XI using live stats keyed by Sportmonks player id.
 * Captain / vice apply to each player's (performance + starting XI bonus) subtotal.
 */
export function aggregateTeamPoints(
  roster: RosterRow[],
  captainPlayerId: string,
  viceCaptainPlayerId: string,
  liveBySportmonksId: Record<string, Partial<NormalizedPlayerStats>>,
): number {
  let total = 0;
  for (const row of roster) {
    if (row.sportmonks_id == null) continue;
    const key = String(row.sportmonks_id);
    const raw = liveBySportmonksId[key] ?? {};
    const kind = roleToKind(row.role);
    const stats = normalizedStatsFromLiveRaw(raw);
    const perf = pointsForPlayer(kind, stats);
    const xi = row.in_playing_xi === true ? XI_BONUS : 0;
    const playerTotal = perf + xi;
    const mult = applyCaptainMultipliers(
      playerTotal,
      row.player_id === captainPlayerId,
      row.player_id === viceCaptainPlayerId,
    );
    total += Number.isFinite(mult) ? mult : 0;
  }
  const t = Math.round(total * 100) / 100;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Per-player fantasy points (same math as `aggregateTeamPoints`).
 * Sum of `points` equals `aggregateTeamPoints` when the same `liveMap` is used.
 */
export function teamPointsBreakdown(
  roster: TeamBreakdownRosterRow[],
  captainPlayerId: string,
  viceCaptainPlayerId: string,
  liveBySportmonksId: Record<string, Partial<NormalizedPlayerStats>>,
): { lines: TeamBreakdownLine[]; computedTotal: number } {
  const lines: TeamBreakdownLine[] = [];
  let computedTotal = 0;
  const hasLiveMap = Object.keys(liveBySportmonksId).length > 0;

  for (const row of roster) {
    const isCap = row.player_id === captainPlayerId;
    const isVc = row.player_id === viceCaptainPlayerId;
    const xi = row.in_playing_xi === true ? XI_BONUS : 0;

    if (row.sportmonks_id == null) {
      lines.push({
        player_id: row.player_id,
        player_name: row.player_name,
        team_label: row.team_label,
        role: row.role,
        points: applyCaptainMultipliers(xi, isCap, isVc),
        perf_points: 0,
        xi_bonus: xi,
        is_captain: isCap,
        is_vice_captain: isVc,
        in_playing_xi: row.in_playing_xi,
        missing_stats: true,
      });
      computedTotal += lines[lines.length - 1]!.points;
      continue;
    }

    const key = String(row.sportmonks_id);
    const raw = liveBySportmonksId[key] ?? {};
    const missingStats = !hasLiveMap;
    const kind = roleToKind(row.role);
    const stats = normalizedStatsFromLiveRaw(raw);
    const perf = pointsForPlayer(kind, stats);
    const playerTotal = perf + xi;
    const pts = applyCaptainMultipliers(playerTotal, isCap, isVc);
    const safePts = Number.isFinite(pts) ? Math.round(pts * 100) / 100 : 0;
    const safePerf = Number.isFinite(perf) ? Math.round(perf * 100) / 100 : 0;
    computedTotal += safePts;
    lines.push({
      player_id: row.player_id,
      player_name: row.player_name,
      team_label: row.team_label,
      role: row.role,
      points: safePts,
      perf_points: safePerf,
      xi_bonus: xi,
      is_captain: isCap,
      is_vice_captain: isVc,
      in_playing_xi: row.in_playing_xi,
      missing_stats: missingStats,
    });
  }

  const totalRounded = Math.round(computedTotal * 100) / 100;
  return {
    lines,
    computedTotal: Number.isFinite(totalRounded) ? totalRounded : 0,
  };
}
