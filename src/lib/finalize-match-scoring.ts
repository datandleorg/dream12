import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateTeamPoints, type RosterRow } from "@/lib/live-scoring";
import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import { fetchFixtureScoreboardRaw } from "@/lib/sportmonks/fixture-scoreboard";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { sportmonksToken } from "@/lib/sportmonks/client";

async function updateTeamsForMatch(
  supabase: SupabaseClient,
  matchId: number,
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
): Promise<number> {
  let updated = 0;
  const { data: teams } = await supabase
    .from("user_teams")
    .select("id,user_id,captain_id,vice_captain_id")
    .eq("match_id", matchId);

  if (!teams?.length) return 0;

  for (const team of teams) {
    const { data: rosterJoin } = await supabase
      .from("team_roster")
      .select("player_id, players ( sportmonks_id, role, in_playing_xi )")
      .eq("team_id", team.id);

    const roster: RosterRow[] =
      rosterJoin?.map((r) => {
        const p = r.players as unknown;
        const row =
          p && typeof p === "object" && !Array.isArray(p)
            ? (p as {
                sportmonks_id?: number | null;
                role?: string;
                in_playing_xi?: boolean | null;
              })
            : null;
        return {
          player_id: r.player_id as string,
          sportmonks_id: row?.sportmonks_id ?? null,
          role: row?.role ?? "BAT",
          in_playing_xi: row?.in_playing_xi ?? null,
        };
      }) ?? [];

    if (!roster.length) continue;

    const points = aggregateTeamPoints(
      roster,
      team.captain_id as string,
      team.vice_captain_id as string,
      liveMap,
    );

    const { error } = await supabase
      .from("user_teams")
      .update({ total_points: points, updated_at: new Date().toISOString() })
      .eq("id", team.id);
    if (!error) updated += 1;
  }

  return updated;
}

/**
 * One completed match: recompute fantasy points from SportMonks fixture (if available), then mark scoring finalized.
 * Non–SportMonks matches: mark finalized without changing totals.
 * SportMonks: skips marking finalized if token+fetched raw is null (retry next cron).
 */
export async function finalizeScoringForMatch(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ ok: boolean; updatedTeams: number; skippedAwaitingData?: boolean }> {
  if (!isSportmonksFixtureId(matchId)) {
    await supabase
      .from("matches")
      .update({ scoring_finalized_at: new Date().toISOString() })
      .eq("id", matchId);
    return { ok: true, updatedTeams: 0 };
  }

  if (!sportmonksToken()) {
    return { ok: false, updatedTeams: 0, skippedAwaitingData: true };
  }

  const raw = await fetchFixtureScoreboardRaw(matchId);
  if (!raw) {
    return { ok: false, updatedTeams: 0, skippedAwaitingData: true };
  }

  const liveMap = extractLiveStatsByPlayer(raw);

  let n = 0;
  if (Object.keys(liveMap).length > 0) {
    n = await updateTeamsForMatch(supabase, matchId, liveMap);
  }

  await supabase
    .from("matches")
    .update({ scoring_finalized_at: new Date().toISOString() })
    .eq("id", matchId);

  return { ok: true, updatedTeams: n };
}

export async function runFinalizeScoringBatch(
  supabase: SupabaseClient,
  limit = 15,
): Promise<{
  matchesProcessed: number;
  teamsUpdated: number;
  awaitingData: number;
}> {
  const { data: rows } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "completed")
    .is("scoring_finalized_at", null)
    .order("start_time", { ascending: true })
    .limit(limit);

  let matchesProcessed = 0;
  let teamsUpdated = 0;
  let awaitingData = 0;

  for (const r of rows ?? []) {
    const matchId = Number(r.id);
    if (!Number.isFinite(matchId)) continue;
    const res = await finalizeScoringForMatch(supabase, matchId);
    if (res.skippedAwaitingData) {
      awaitingData += 1;
      continue;
    }
    if (res.ok) {
      matchesProcessed += 1;
      teamsUpdated += res.updatedTeams;
    }
  }

  return { matchesProcessed, teamsUpdated, awaitingData };
}
