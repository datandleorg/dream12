import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import { extractScoreboardRawToLiveMap } from "@/lib/extract-scoreboard-raw-to-live-map";
import { mergeLiveStatsFromStoredSnapshot } from "@/lib/live-stats-from-snapshot";
import {
  teamPointsBreakdown,
  type TeamBreakdownLine,
  type TeamBreakdownRosterRow,
} from "@/lib/live-scoring";
import { MAX_CREDITS } from "@/lib/fantasy/rules";
import {
  fetchFixtureScoreboardRaw,
  fetchLivescoresNowByFixtureId,
} from "@/lib/sportmonks/fixture-scoreboard";
import { mapRowToBuilderPlayer, type BuilderPlayer } from "@/stores/team-builder";

export type ContestTeamPitchPayload = {
  teamA: string;
  teamB: string;
  selected: BuilderPlayer[];
  captainId: string;
  viceCaptainId: string;
  fantasyPointsByPlayerId: Record<string, number>;
  creditsLeft: number;
};

export type ContestTeamBreakdownOk = {
  lines: TeamBreakdownLine[];
  computedTotal: number;
  storedTotal: number;
  statsAvailable: boolean;
  pitch: ContestTeamPitchPayload;
};

export type RawUserTeamForParse = {
  captain_id: unknown;
  vice_captain_id: unknown;
  user_id: unknown;
  total_points: unknown;
  team_roster: unknown;
};

export type ParsedContestTeam = {
  roster: TeamBreakdownRosterRow[];
  rawRows: unknown[];
  captainId: string;
  viceCaptainId: string;
  storedTotal: number;
  user_id: string;
};

function rosterRowsFromJoin(team_roster: unknown): unknown[] {
  return Array.isArray(team_roster) ? team_roster : [];
}

export function parseContestUserTeam(
  team: RawUserTeamForParse,
): ParsedContestTeam | { error: string } {
  const cap = team.captain_id as string | null;
  const vc = team.vice_captain_id as string | null;
  if (!cap || !vc) {
    return { error: "Team is incomplete." };
  }
  const rows = rosterRowsFromJoin(team.team_roster);
  const roster: TeamBreakdownRosterRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as {
      player_id?: string;
      players?: unknown;
    };
    const pid = row.player_id;
    if (!pid) continue;
    const p = row.players;
    const pl =
      p && typeof p === "object" && !Array.isArray(p)
        ? (p as {
            name?: string;
            team?: string;
            role?: string;
            sportmonks_id?: number | null;
            in_playing_xi?: boolean | null;
            credit_value?: number | string | null;
            season_points?: number | null;
            selection_pct?: number | null;
            played_last_match?: boolean | null;
            photo_url?: string | null;
          })
        : null;
    roster.push({
      player_id: String(pid),
      sportmonks_id: pl?.sportmonks_id ?? null,
      role: pl?.role ?? "BAT",
      in_playing_xi: pl?.in_playing_xi ?? null,
      player_name: pl?.name?.trim() || "Player",
      team_label: pl?.team?.trim() || "—",
    });
  }
  return {
    roster,
    rawRows: rows,
    captainId: String(cap),
    viceCaptainId: String(vc),
    storedTotal: Math.round(Number(team.total_points) * 100) / 100,
    user_id: String(team.user_id),
  };
}

export function matchTeamLabels(matchMeta: {
  team_a?: string | null;
  team_b?: string | null;
  name?: string | null;
}): { teamA: string; teamB: string } {
  const matchName = matchMeta?.name?.trim() ?? "";
  const parts = matchName.split(/\s+vs\s+/i);
  const teamA =
    matchMeta?.team_a?.trim() || parts[0]?.trim() || "Team A";
  const teamB =
    matchMeta?.team_b?.trim() || parts[1]?.trim() || "Team B";
  return { teamA, teamB };
}

/** Merge rosters for snapshot/live-map enrichment so both squads' players are covered. */
export function mergeRostersForLiveMap(
  a: TeamBreakdownRosterRow[],
  b: TeamBreakdownRosterRow[],
): TeamBreakdownRosterRow[] {
  const byId = new Map<string, TeamBreakdownRosterRow>();
  for (const r of a) byId.set(String(r.player_id), r);
  for (const r of b) {
    const id = String(r.player_id);
    if (!byId.has(id)) byId.set(id, r);
  }
  return [...byId.values()];
}

export async function buildLiveMapForMatch(
  matchMeta: {
    live_snapshot?: unknown;
    fixture_scoreboard_raw?: unknown;
  },
  matchId: number,
  rosterForMerge: TeamBreakdownRosterRow[],
): Promise<{
  liveMap: Record<string, Partial<NormalizedPlayerStats>>;
  statsAvailable: boolean;
}> {
  let liveMap: Record<string, Partial<NormalizedPlayerStats>> =
    extractScoreboardRawToLiveMap(matchMeta?.fixture_scoreboard_raw);

  if (Object.keys(liveMap).length === 0) {
    const rawFixture = await fetchFixtureScoreboardRaw(matchId);
    const livescoresByFixture = await fetchLivescoresNowByFixtureId();
    const rawNow = livescoresByFixture.get(matchId);
    const mergedRaw: Record<string, unknown> =
      rawFixture && rawNow
        ? ({ ...rawNow, ...rawFixture } as Record<string, unknown>)
        : ((rawFixture ?? rawNow) as Record<string, unknown> | null) ?? {};
    const apiLiveMap = extractLiveStatsByPlayer(mergedRaw);
    liveMap = mergeLiveStatsFromStoredSnapshot(
      matchMeta?.live_snapshot,
      rosterForMerge,
      apiLiveMap,
    );
  }

  const statsAvailable = Object.keys(liveMap).length > 0;
  return { liveMap, statsAvailable };
}

export function buildBreakdownOk(
  parsed: ParsedContestTeam,
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  teamA: string,
  teamB: string,
  statsAvailable: boolean,
): ContestTeamBreakdownOk {
  const { lines, computedTotal } = teamPointsBreakdown(
    parsed.roster,
    parsed.captainId,
    parsed.viceCaptainId,
    liveMap,
  );

  const selected: BuilderPlayer[] = [];
  let creditsUsed = 0;
  for (const r of parsed.rawRows) {
    if (!r || typeof r !== "object") continue;
    const row = r as { player_id?: string; players?: unknown };
    const pid = row.player_id;
    if (!pid) continue;
    const p = row.players;
    const pl =
      p && typeof p === "object" && !Array.isArray(p)
        ? (p as {
            name?: string;
            team?: string;
            role?: string;
            credit_value?: number | string | null;
            season_points?: number | null;
            selection_pct?: number | null;
            played_last_match?: boolean | null;
            photo_url?: string | null;
            in_playing_xi?: boolean | null;
          })
        : null;
    if (!pl?.name) continue;
    const bp = mapRowToBuilderPlayer({
      id: String(pid),
      name: pl.name,
      team: pl.team ?? "—",
      role: pl.role ?? "BAT",
      credit_value: Number(pl.credit_value ?? 0),
      season_points: pl.season_points ?? 0,
      selection_pct: pl.selection_pct ?? null,
      played_last_match: pl.played_last_match ?? null,
      photo_url: pl.photo_url ?? null,
      in_playing_xi: pl.in_playing_xi ?? null,
    });
    selected.push(bp);
    creditsUsed += bp.credit_value;
  }

  const creditsLeft = Math.round((MAX_CREDITS - creditsUsed) * 10) / 10;

  const pitchPoints: Record<string, number> = {};
  for (const p of selected) {
    const idKey = String(p.id);
    const line =
      lines.find((l) => String(l.player_id) === idKey) ??
      lines.find(
        (l) =>
          l.player_name.trim() === p.name.trim() &&
          l.team_label.trim() === p.team.trim(),
      );
    pitchPoints[idKey] = line?.points ?? 0;
  }

  return {
    lines,
    computedTotal,
    storedTotal: parsed.storedTotal,
    statsAvailable,
    pitch: {
      teamA,
      teamB,
      selected,
      captainId: parsed.captainId,
      viceCaptainId: parsed.viceCaptainId,
      fantasyPointsByPlayerId: pitchPoints,
      creditsLeft,
    },
  };
}

export type TeamCompareCommonRow = {
  player_id: string;
  player_name: string;
  yours: number;
  theirs: number;
  diff: number;
};

export type TeamCompareSoloRow = {
  player_id: string;
  player_name: string;
  points: number;
};

export function buildTeamCompareLists(
  viewerLines: TeamBreakdownLine[],
  opponentLines: TeamBreakdownLine[],
): {
  common: TeamCompareCommonRow[];
  onlyViewer: TeamCompareSoloRow[];
  onlyOpponent: TeamCompareSoloRow[];
} {
  const vMap = new Map(viewerLines.map((l) => [String(l.player_id), l]));
  const oMap = new Map(opponentLines.map((l) => [String(l.player_id), l]));

  const common: TeamCompareCommonRow[] = [];
  for (const [id, vl] of vMap) {
    const ol = oMap.get(id);
    if (ol) {
      common.push({
        player_id: id,
        player_name: vl.player_name,
        yours: vl.points,
        theirs: ol.points,
        diff: vl.points - ol.points,
      });
    }
  }
  common.sort((a, b) => {
    if (Math.abs(b.diff) !== Math.abs(a.diff)) return Math.abs(b.diff) - Math.abs(a.diff);
    return a.player_name.localeCompare(b.player_name, undefined, { sensitivity: "base" });
  });

  const onlyViewer: TeamCompareSoloRow[] = [];
  for (const [id, vl] of vMap) {
    if (!oMap.has(id)) {
      onlyViewer.push({
        player_id: id,
        player_name: vl.player_name,
        points: vl.points,
      });
    }
  }
  onlyViewer.sort((a, b) => b.points - a.points);

  const onlyOpponent: TeamCompareSoloRow[] = [];
  for (const [id, ol] of oMap) {
    if (!vMap.has(id)) {
      onlyOpponent.push({
        player_id: id,
        player_name: ol.player_name,
        points: ol.points,
      });
    }
  }
  onlyOpponent.sort((a, b) => b.points - a.points);

  return { common, onlyViewer, onlyOpponent };
}
