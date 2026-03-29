/**
 * Fantasy points from normalized per-player match stats (Sportmonks can be mapped here).
 * Dream11-style T20 matrix + captain (2×) / vice-captain (1.5×).
 * @see docs/dream11-t20-scoring.md
 */

export type PlayerKind = "bat" | "bowl" | "ar" | "wk";

export interface NormalizedPlayerStats {
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isDismissed: boolean;
  /**
   * Bowling wickets excluding run-outs (+25 each).
   * For haul bonuses, this count is used (non–run-out only).
   */
  wickets: number;
  /**
   * Subset of `wickets` taken bowled or LBW (+8 each, stacks with +25).
   */
  bowledLbwDismissals?: number;
  oversBowled: number;
  runsConceded: number;
  maidens: number;
  catches: number;
  stumpings: number;
  /** Direct hit run-out credits (+12 each). */
  runOutDirect?: number;
  /** Indirect run-out involvements (+6 each). */
  runOutIndirect?: number;
  /**
   * Legacy: when `runOutDirect` and `runOutIndirect` are absent/0, each counts as indirect +6.
   */
  runOuts: number;
  /** Payload-only: +4 starting XI in `calculateFantasyPoints`; roster path uses DB `in_playing_xi`. */
  inPlayingXi?: boolean;
}

const DUCK_PENALTY_BAT = -2;
const SR_BONUS_THRESHOLD_BALLS = 10;
const ECONOMY_MIN_OVERS = 2;

function battingMilestoneBonus(runs: number): number {
  if (runs >= 100) return 16;
  if (runs >= 50) return 8;
  if (runs >= 30) return 4;
  return 0;
}

function strikeRateBonus(runs: number, balls: number): number {
  if (balls < SR_BONUS_THRESHOLD_BALLS) return 0;
  const sr = (runs / balls) * 100;
  if (sr > 170) return 6;
  if (sr > 150 && sr <= 170) return 4;
  if (sr >= 130 && sr <= 150) return 2;
  if (sr >= 60 && sr <= 70) return -2;
  if (sr >= 50 && sr < 60) return -4;
  if (sr < 50) return -6;
  return 0;
}

function economyBonus(runsConceded: number, oversBowled: number): number {
  if (oversBowled < ECONOMY_MIN_OVERS) return 0;
  const er = runsConceded / oversBowled;
  if (er < 5) return 6;
  if (er < 6) return 4;
  if (er < 7) return 2;
  if (er >= 10 && er < 11) return -2;
  if (er >= 11 && er <= 12) return -4;
  if (er > 12) return -6;
  return 0;
}

function bowlingHaulBonus(wicketsNonRunOut: number): number {
  if (wicketsNonRunOut >= 5) return 16;
  if (wicketsNonRunOut >= 4) return 8;
  if (wicketsNonRunOut >= 3) return 4;
  return 0;
}

function catchBonus(catches: number): number {
  return catches >= 3 ? 4 : 0;
}

function runOutPoints(s: NormalizedPlayerStats): number {
  const direct = s.runOutDirect ?? 0;
  let indirect = s.runOutIndirect ?? 0;
  if (direct === 0 && indirect === 0 && s.runOuts > 0) {
    indirect = s.runOuts;
  }
  return 12 * direct + 6 * indirect;
}

/**
 * Performance-only fantasy points (no starting XI bonus). Captain / vice and XI are applied in `aggregateTeamPoints`.
 */
export function pointsForPlayer(kind: PlayerKind, s: NormalizedPlayerStats): number {
  let pts = 0;

  // Batting
  pts += s.runs;
  pts += s.fours;
  pts += 2 * s.sixes;
  if (s.isDismissed && s.runs === 0 && (kind === "bat" || kind === "wk" || kind === "ar")) {
    pts += DUCK_PENALTY_BAT;
  }
  pts += battingMilestoneBonus(s.runs);
  pts += strikeRateBonus(s.runs, s.ballsFaced);

  // Bowling
  const wk = Math.max(0, s.wickets);
  const blbw = Math.min(Math.max(0, s.bowledLbwDismissals ?? 0), wk);
  pts += 25 * wk;
  pts += 8 * blbw;
  pts += bowlingHaulBonus(wk);
  pts += 12 * s.maidens;
  pts += economyBonus(s.runsConceded, s.oversBowled);

  // Fielding
  pts += 8 * s.catches;
  pts += catchBonus(s.catches);
  pts += 12 * s.stumpings;
  pts += runOutPoints(s);

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

function normalizeStats(raw: Partial<NormalizedPlayerStats>): NormalizedPlayerStats {
  return {
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
}

export function calculateFantasyPoints(
  payload: SportmonksLivePayload,
  captainPlayerKey: string,
  viceCaptainPlayerKey: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(payload)) {
    const kind: PlayerKind = raw.kind ?? "bat";
    const stats = normalizeStats(raw);
    const xi = raw.inPlayingXi === true ? 4 : 0;
    const base = pointsForPlayer(kind, stats) + xi;
    out[key] = applyCaptainMultipliers(
      base,
      key === captainPlayerKey,
      key === viceCaptainPlayerKey,
    );
  }
  return out;
}
