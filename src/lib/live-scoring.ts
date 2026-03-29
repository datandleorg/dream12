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
    const stats: NormalizedPlayerStats = {
      runs: raw.runs ?? 0,
      ballsFaced: raw.ballsFaced ?? 0,
      fours: raw.fours ?? 0,
      sixes: raw.sixes ?? 0,
      isDismissed: raw.isDismissed ?? false,
      wickets: raw.wickets ?? 0,
      bowledLbwDismissals: raw.bowledLbwDismissals,
      oversBowled: raw.oversBowled ?? 0,
      runsConceded: raw.runsConceded ?? 0,
      maidens: raw.maidens ?? 0,
      catches: raw.catches ?? 0,
      stumpings: raw.stumpings ?? 0,
      runOutDirect: raw.runOutDirect,
      runOutIndirect: raw.runOutIndirect,
      runOuts: raw.runOuts ?? 0,
    };
    const perf = pointsForPlayer(kind, stats);
    const xi = row.in_playing_xi === true ? XI_BONUS : 0;
    const playerTotal = perf + xi;
    const mult = applyCaptainMultipliers(
      playerTotal,
      row.player_id === captainPlayerId,
      row.player_id === viceCaptainPlayerId,
    );
    total += mult;
  }
  return Math.round(total * 100) / 100;
}
