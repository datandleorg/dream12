import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import { extractScoreboardRawToLiveMap } from "@/lib/extract-scoreboard-raw-to-live-map";
import { pickScoreboardRaw } from "@/lib/pick-scoreboard-raw";
import { fetchFixtureScoreboardRaw } from "@/lib/sportmonks/fixture-scoreboard";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { sportmonksToken } from "@/lib/sportmonks/client";
import { updateUserTeamsPointsForMatch } from "@/lib/update-user-teams-for-match";

/**
 * One completed match: recompute fantasy points from stored scoreboard JSON or SportMonks fixture, then mark scoring finalized.
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

  const { data: matchRow } = await supabase
    .from("matches")
    .select("fixture_scoreboard_raw")
    .eq("id", matchId)
    .maybeSingle();

  let liveMap: Record<string, Partial<NormalizedPlayerStats>> = {};
  const storedRaw = matchRow?.fixture_scoreboard_raw;
  if (storedRaw != null) {
    liveMap = extractScoreboardRawToLiveMap(storedRaw);
  }

  if (Object.keys(liveMap).length === 0) {
    const raw = await fetchFixtureScoreboardRaw(matchId);
    if (!raw) {
      return { ok: false, updatedTeams: 0, skippedAwaitingData: true };
    }
    liveMap = extractScoreboardRawToLiveMap(pickScoreboardRaw(raw));
    if (Object.keys(liveMap).length === 0) {
      liveMap = extractLiveStatsByPlayer(raw);
    }
  }

  let n = 0;
  if (Object.keys(liveMap).length > 0) {
    n = await updateUserTeamsPointsForMatch(supabase, matchId, liveMap);
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
