"use server";

import { createClient } from "@/lib/supabase/server";
import { isContestVisibleToUser } from "@/lib/contest-visibility";
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
import { canViewOthersContestTeamPreview } from "@/lib/opponent-team-preview-policy";
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

export type ContestTeamBreakdownResult =
  | {
      ok: true;
      lines: TeamBreakdownLine[];
      computedTotal: number;
      storedTotal: number;
      statsAvailable: boolean;
      pitch: ContestTeamPitchPayload;
    }
  | { ok: false; message: string };

export async function getContestTeamBreakdown(input: {
  contestId: string;
  userTeamId: string;
}): Promise<ContestTeamBreakdownResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in to view team breakdown." };
  }

  const { data: team, error: teamErr } = await supabase
    .from("user_teams")
    .select(
      `
      id,
      user_id,
      captain_id,
      vice_captain_id,
      match_id,
      contest_id,
      total_points,
      team_roster (
        player_id,
        players (
          name,
          team,
          role,
          sportmonks_id,
          in_playing_xi,
          credit_value,
          season_points,
          selection_pct,
          played_last_match,
          photo_url
        )
      )
    `,
    )
    .eq("id", input.userTeamId)
    .eq("contest_id", input.contestId)
    .maybeSingle();

  if (teamErr || !team) {
    return { ok: false, message: "Team not found for this contest." };
  }

  const { data: contest } = await supabase
    .from("contests")
    .select("created_by, creator_joined_at")
    .eq("id", input.contestId)
    .single();

  if (
    !contest ||
    !isContestVisibleToUser(
      {
        created_by: contest.created_by as string | null,
        creator_joined_at: contest.creator_joined_at as string | null,
      },
      user.id,
    )
  ) {
    return { ok: false, message: "Contest not available." };
  }

  const { data: matchMeta, error: matchErr } = await supabase
    .from("matches")
    .select("team_a, team_b, name, live_snapshot, fixture_scoreboard_raw, status")
    .eq("id", team.match_id)
    .maybeSingle();

  if (matchErr || !matchMeta) {
    return { ok: false, message: "Match not found." };
  }

  const teamOwnerId = String(team.user_id);
  const matchStatus = String(matchMeta.status ?? "");
  if (
    !canViewOthersContestTeamPreview({
      matchStatus,
      viewerUserId: user.id,
      teamOwnerUserId: teamOwnerId,
    })
  ) {
    return {
      ok: false,
      message: "Opponent teams are visible once the match goes live.",
    };
  }

  const cap = team.captain_id as string | null;
  const vc = team.vice_captain_id as string | null;
  if (!cap || !vc) {
    return { ok: false, message: "Team is incomplete." };
  }

  const rosterJoin = team.team_roster as unknown;
  const rows = Array.isArray(rosterJoin) ? rosterJoin : [];
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

  const matchName = matchMeta?.name?.trim() ?? "";
  const parts = matchName.split(/\s+vs\s+/i);
  const teamA =
    matchMeta?.team_a?.trim() || parts[0]?.trim() || "Team A";
  const teamB =
    matchMeta?.team_b?.trim() || parts[1]?.trim() || "Team B";

  const matchId = Number(team.match_id);
  let liveMap = extractScoreboardRawToLiveMap(matchMeta?.fixture_scoreboard_raw);

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
      roster,
      apiLiveMap,
    );
  }

  const statsAvailable = Object.keys(liveMap).length > 0;

  const { lines, computedTotal } = teamPointsBreakdown(
    roster,
    String(cap),
    String(vc),
    liveMap,
  );
  const storedTotal = Math.round(Number(team.total_points) * 100) / 100;

  const selected: BuilderPlayer[] = [];
  let creditsUsed = 0;
  for (const r of rows) {
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
    ok: true,
    lines,
    computedTotal,
    storedTotal,
    statsAvailable,
    pitch: {
      teamA,
      teamB,
      selected,
      captainId: String(cap),
      viceCaptainId: String(vc),
      fantasyPointsByPlayerId: pitchPoints,
      creditsLeft,
    },
  };
}
