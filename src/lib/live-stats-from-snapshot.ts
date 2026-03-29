import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import type { TeamBreakdownRosterRow } from "@/lib/live-scoring";
import type {
  LiveBattingRow,
  LiveBowlingRow,
  LiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";
import { parseLiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";

/** "15.4" → 15 + 4/6 overs (decimal for economy math). */
export function parseCricketOversToDecimal(overs: string | null | undefined): number {
  if (overs == null) return 0;
  const t = String(overs).trim();
  if (!t) return 0;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) {
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  const whole = Number(m[1]);
  const balls = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(balls) || balls < 0 || balls > 5) return whole;
  return whole + balls / 6;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function namesMatchRosterToSnapshot(
  rosterName: string,
  snapshotName: string,
): boolean {
  const a = normalizeName(rosterName);
  const b = normalizeName(snapshotName);
  if (!a || !b) return false;
  if (a === b) return true;
  const aLast = a.split(" ").pop() ?? "";
  const bLast = b.split(" ").pop() ?? "";
  if (aLast.length >= 4 && bLast.length >= 4 && aLast === bLast) return true;
  return false;
}

function teamRoughMatch(teamLabel: string, battingTeamName: string): boolean {
  const a = normalizeName(teamLabel);
  const b = normalizeName(battingTeamName);
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return true;
  return a.includes(b.slice(0, 6)) || b.includes(a.slice(0, 6));
}

export function flattenSnapshotScorecardRows(snap: LiveSnapshot): {
  batting: LiveBattingRow[];
  bowling: LiveBowlingRow[];
} {
  const batting: LiveBattingRow[] = [];
  const bowling: LiveBowlingRow[] = [];
  if (snap.inningsCards?.length) {
    for (const c of snap.inningsCards) {
      if (c.battingRows?.length) batting.push(...c.battingRows);
      if (c.bowlingRows?.length) bowling.push(...c.bowlingRows);
    }
  }
  if (snap.battingRows?.length) batting.push(...snap.battingRows);
  if (snap.bowlingRows?.length) bowling.push(...snap.bowlingRows);
  return { batting, bowling };
}

function findSnapshotBatting(
  snap: LiveSnapshot,
  playerName: string,
  teamLabel: string,
): LiveBattingRow | null {
  const cards = snap.inningsCards;
  if (cards?.length) {
    for (const c of cards) {
      if (!teamRoughMatch(teamLabel, c.battingTeamName)) continue;
      const row = c.battingRows?.find((r) =>
        namesMatchRosterToSnapshot(playerName, r.name),
      );
      if (row) return row;
    }
  }
  const { batting } = flattenSnapshotScorecardRows(snap);
  return batting.find((r) => namesMatchRosterToSnapshot(playerName, r.name)) ?? null;
}

function findSnapshotBowling(
  snap: LiveSnapshot,
  playerName: string,
  teamLabel: string,
): LiveBowlingRow | null {
  const cards = snap.inningsCards;
  if (cards?.length) {
    for (const c of cards) {
      if (teamRoughMatch(teamLabel, c.battingTeamName)) continue;
      const row = c.bowlingRows?.find((r) =>
        namesMatchRosterToSnapshot(playerName, r.name),
      );
      if (row) return row;
    }
  }
  const { bowling } = flattenSnapshotScorecardRows(snap);
  return bowling.find((r) => namesMatchRosterToSnapshot(playerName, r.name)) ?? null;
}

function battingRowToStats(row: LiveBattingRow): Partial<NormalizedPlayerStats> {
  const d = row.dismissal;
  const isDismissed =
    d != null && String(d).trim().length > 0 && String(d).toLowerCase() !== "not out";
  return {
    runs: row.runs ?? 0,
    ballsFaced: row.balls ?? 0,
    fours: row.fours ?? 0,
    sixes: row.sixes ?? 0,
    isDismissed,
  };
}

function bowlingRowToStats(row: LiveBowlingRow): Partial<NormalizedPlayerStats> {
  return {
    wickets: row.wickets ?? 0,
    oversBowled: parseCricketOversToDecimal(row.overs),
    runsConceded: row.runs ?? 0,
    maidens: row.maidens ?? 0,
  };
}

/** Prefer API stats when they already carry performance; otherwise fill from snapshot scorecard. */
function mergeApiAndSnapshotStats(
  api: Partial<NormalizedPlayerStats>,
  snap: Partial<NormalizedPlayerStats>,
): Partial<NormalizedPlayerStats> {
  const apiBat = (api.runs ?? 0) > 0 || (api.ballsFaced ?? 0) > 0;
  const apiBowl = (api.wickets ?? 0) > 0 || (api.oversBowled ?? 0) > 0;
  return {
    runs: apiBat ? (api.runs ?? 0) : (snap.runs ?? api.runs ?? 0),
    ballsFaced: apiBat
      ? (api.ballsFaced ?? 0)
      : (snap.ballsFaced ?? api.ballsFaced ?? 0),
    fours: apiBat ? (api.fours ?? 0) : (snap.fours ?? api.fours ?? 0),
    sixes: apiBat ? (api.sixes ?? 0) : (snap.sixes ?? api.sixes ?? 0),
    isDismissed: apiBat
      ? Boolean(api.isDismissed)
      : Boolean(snap.isDismissed ?? api.isDismissed),
    wickets: apiBowl ? (api.wickets ?? 0) : (snap.wickets ?? api.wickets ?? 0),
    oversBowled: apiBowl
      ? (api.oversBowled ?? 0)
      : (snap.oversBowled ?? api.oversBowled ?? 0),
    runsConceded: apiBowl
      ? (api.runsConceded ?? 0)
      : (snap.runsConceded ?? api.runsConceded ?? 0),
    maidens: apiBowl ? (api.maidens ?? 0) : (snap.maidens ?? api.maidens ?? 0),
    catches:
      (api.catches ?? 0) > 0 ? (api.catches ?? 0) : (snap.catches ?? api.catches ?? 0),
    stumpings:
      (api.stumpings ?? 0) > 0
        ? (api.stumpings ?? 0)
        : (snap.stumpings ?? api.stumpings ?? 0),
    bowledLbwDismissals: api.bowledLbwDismissals ?? snap.bowledLbwDismissals,
    runOutDirect: api.runOutDirect ?? snap.runOutDirect,
    runOutIndirect: api.runOutIndirect ?? snap.runOutIndirect,
    runOuts:
      (api.runOuts ?? 0) > 0 ? (api.runOuts ?? 0) : (snap.runOuts ?? api.runOuts ?? 0),
  };
}

/**
 * Build per–sportmonks-id stats from stored `matches.live_snapshot` (normalized scorecard with names).
 * Merges with API-derived `liveMap` so SportMonks IDs stay the lookup key for `teamPointsBreakdown`.
 */
export function mergeLiveStatsFromStoredSnapshot(
  snapshotJson: unknown,
  roster: TeamBreakdownRosterRow[],
  apiLiveMap: Record<string, Partial<NormalizedPlayerStats>>,
): Record<string, Partial<NormalizedPlayerStats>> {
  const snap = parseLiveSnapshot(snapshotJson);
  if (!snap) return apiLiveMap;

  const snapBySmId: Record<string, Partial<NormalizedPlayerStats>> = {};
  for (const row of roster) {
    if (row.sportmonks_id == null) continue;
    const key = String(row.sportmonks_id);
    const bat = findSnapshotBatting(snap, row.player_name, row.team_label);
    const bowl = findSnapshotBowling(snap, row.player_name, row.team_label);
    const parts: Partial<NormalizedPlayerStats>[] = [];
    if (bat) parts.push(battingRowToStats(bat));
    if (bowl) parts.push(bowlingRowToStats(bowl));
    if (parts.length === 0) continue;
    snapBySmId[key] = parts.reduce(
      (acc, p) => ({ ...acc, ...p }),
      {} as Partial<NormalizedPlayerStats>,
    );
  }

  const out: Record<string, Partial<NormalizedPlayerStats>> = { ...apiLiveMap };
  for (const row of roster) {
    if (row.sportmonks_id == null) continue;
    const key = String(row.sportmonks_id);
    const api = apiLiveMap[key] ?? {};
    const snapStats = snapBySmId[key];
    if (!snapStats) continue;
    out[key] = mergeApiAndSnapshotStats(api, snapStats);
  }
  return out;
}
