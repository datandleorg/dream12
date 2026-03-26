/**
 * Fantasy points from normalized per-player match stats (Sportmonks can be mapped here).
 * Simplified Dream11-style matrix + C (2x) / VC (1.5x).
 */

export type PlayerKind = "bat" | "bowl" | "ar" | "wk";

export interface NormalizedPlayerStats {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isDismissed: boolean;
  /** Strike rate points bucket already applied in bonus, or use raw for SR milestone */
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  maidens: number;
  catches: number;
  stumpings: number;
  runOuts: number;
}

const DUCK_PENALTY_BAT = -2;
const SR_BONUS_THRESHOLD_BALLS = 10;

function strikeRateBonus(runs: number, balls: number, dismissed: boolean): number {
  if (balls < SR_BONUS_THRESHOLD_BALLS) return 0;
  if (!dismissed && balls === 0) return 0;
  const sr = (runs / balls) * 100;
  if (sr >= 170) return 6;
  if (sr >= 150) return 4;
  if (sr >= 130) return 2;
  if (sr <= 50 && dismissed) return -2;
  return 0;
}

function economyBonus(runs: number, overs: number): number {
  if (overs <= 0) return 0;
  const er = runs / overs;
  if (er < 5) return 6;
  if (er < 6) return 4;
  if (er < 7) return 2;
  if (er > 12) return -2;
  return 0;
}

/**
 * Base fantasy points before captain / vice multipliers.
 */
export function pointsForPlayer(
  kind: PlayerKind,
  s: NormalizedPlayerStats,
): number {
  let pts = 0;

  // Batting (all outfield + WK batting)
  pts += s.runs;
  pts += s.fours;
  pts += 2 * s.sixes;
  if (s.isDismissed && s.runs === 0 && (kind === "bat" || kind === "wk" || kind === "ar")) {
    pts += DUCK_PENALTY_BAT;
  }
  pts += strikeRateBonus(s.runs, s.ballsFaced, s.isDismissed);

  // Bowling
  pts += 25 * s.wickets;
  pts += 8 * s.maidens;
  pts += economyBonus(s.runsConceded, s.oversBowled);

  // Fielding
  pts += 8 * s.catches;
  pts += 12 * s.stumpings;
  pts += 6 * s.runOuts;

  return Math.round(pts * 100) / 100;
}

export interface CaptainMultipliers {
  captain: number;
  viceCaptain: number;
}

export const DEFAULT_MULTIPLIERS: CaptainMultipliers = {
  captain: 2,
  viceCaptain: 1.5,
};

export function applyCaptainMultipliers(
  basePoints: number,
  isCaptain: boolean,
  isViceCaptain: boolean,
  m: CaptainMultipliers = DEFAULT_MULTIPLIERS,
): number {
  if (isCaptain) return Math.round(basePoints * m.captain * 100) / 100;
  if (isViceCaptain) return Math.round(basePoints * m.viceCaptain * 100) / 100;
  return basePoints;
}

/** Aggregate payload shape from Sportmonks live feed → normalized stats map */
export type SportmonksLivePayload = Record<string, Partial<NormalizedPlayerStats> & { kind?: PlayerKind }>;

export function calculateFantasyPoints(
  payload: SportmonksLivePayload,
  captainPlayerKey: string,
  viceCaptainPlayerKey: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(payload)) {
    const kind: PlayerKind = raw.kind ?? "bat";
    const stats: NormalizedPlayerStats = {
      runs: raw.runs ?? 0,
      ballsFaced: raw.ballsFaced ?? 0,
      fours: raw.fours ?? 0,
      sixes: raw.sixes ?? 0,
      isDismissed: raw.isDismissed ?? false,
      wickets: raw.wickets ?? 0,
      oversBowled: raw.oversBowled ?? 0,
      runsConceded: raw.runsConceded ?? 0,
      maidens: raw.maidens ?? 0,
      catches: raw.catches ?? 0,
      stumpings: raw.stumpings ?? 0,
      runOuts: raw.runOuts ?? 0,
    };
    const base = pointsForPlayer(kind, stats);
    out[key] = applyCaptainMultipliers(
      base,
      key === captainPlayerKey,
      key === viceCaptainPlayerKey,
    );
  }
  return out;
}
