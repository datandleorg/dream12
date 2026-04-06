import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import {
  extractScoreboardRawToLiveMap,
  mergeFieldingFromBattingRows,
} from "@/lib/extract-scoreboard-raw-to-live-map";
import { pickScoreboardRaw } from "@/lib/pick-scoreboard-raw";
import { smFixtureNoteFromPayload, sportmonksToken } from "@/lib/sportmonks/client";
import { fetchFixtureScoreboardRaw } from "@/lib/sportmonks/fixture-scoreboard";
import { buildLiveSnapshotFromFixture } from "@/lib/sportmonks/normalize-live-snapshot";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { updateUserTeamsPointsForMatch } from "@/lib/update-user-teams-for-match";

/** Minimum time after `match_finished_at` before finalizing in_review matches (Dream11-style audit buffer). */
export const FINALIZE_IN_REVIEW_BUFFER_MS = 60 * 60 * 1000;

/**
 * One completed match: fetch latest SportMonks fixture when possible, persist scoreboard/snapshot/balls on `matches`,
 * recompute fantasy points, then set `scoring_finalized_at`.
 * Non–SportMonks matches: mark finalized without changing totals.
 * SportMonks: if the API returns nothing and stored scoreboard is empty, skips finalizing (retry next cron).
 */
export async function finalizeScoringForMatch(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ ok: boolean; updatedTeams: number; skippedAwaitingData?: boolean }> {
  if (!isSportmonksFixtureId(matchId)) {
    await supabase
      .from("matches")
      .update({
        scoring_finalized_at: new Date().toISOString(),
        status: "completed",
      })
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

  const nowIso = new Date().toISOString();
  const persist: Record<string, unknown> = {
    scoring_finalized_at: nowIso,
    status: "completed",
  };

  let liveMap: Record<string, Partial<NormalizedPlayerStats>> = {};
  const raw = await fetchFixtureScoreboardRaw(matchId);

  if (raw) {
    const merged = raw as Record<string, unknown>;
    const picked = pickScoreboardRaw(merged);
    liveMap = extractScoreboardRawToLiveMap(picked);
    if (Object.keys(liveMap).length === 0) {
      liveMap = extractLiveStatsByPlayer(merged);
      mergeFieldingFromBattingRows(liveMap, picked);
    }

    const snapshot = buildLiveSnapshotFromFixture(merged);
    persist.fixture_scoreboard_raw = picked;
    persist.fixture_scoreboard_raw_at = nowIso;
    persist.live_snapshot = snapshot as unknown as Record<string, unknown>;
    persist.live_snapshot_at = nowIso;

    if (merged.balls != null) {
      persist.fixture_balls_raw = merged.balls;
      persist.fixture_balls_raw_at = nowIso;
    }

    const st = merged.status;
    if (typeof st === "string" && st.trim()) {
      persist.sm_fixture_status = st.trim();
    }
    const notePersist = smFixtureNoteFromPayload(merged.note);
    if (notePersist) {
      persist.sm_fixture_note = notePersist;
    }
  } else {
    const storedRaw = matchRow?.fixture_scoreboard_raw;
    if (storedRaw != null) {
      liveMap = extractScoreboardRawToLiveMap(storedRaw);
    }
    if (Object.keys(liveMap).length === 0) {
      return { ok: false, updatedTeams: 0, skippedAwaitingData: true };
    }
  }

  let n = 0;
  if (Object.keys(liveMap).length > 0) {
    n = await updateUserTeamsPointsForMatch(supabase, matchId, liveMap);
  }

  await supabase.from("matches").update(persist).eq("id", matchId);

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
  const cutoffIso = new Date(Date.now() - FINALIZE_IN_REVIEW_BUFFER_MS).toISOString();

  const { data: inReview } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "in_review")
    .is("scoring_finalized_at", null)
    .not("match_finished_at", "is", null)
    .lte("match_finished_at", cutoffIso)
    .order("match_finished_at", { ascending: true })
    .limit(limit);

  const remaining = Math.max(0, limit - (inReview?.length ?? 0));
  let legacyA: { id: number }[] = [];
  let legacyB: { id: number }[] = [];
  if (remaining > 0) {
    const { data: a } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "completed")
      .is("scoring_finalized_at", null)
      .is("match_finished_at", null)
      .order("start_time", { ascending: true })
      .limit(remaining);
    legacyA = (a ?? []) as { id: number }[];
    const rem2 = remaining - legacyA.length;
    if (rem2 > 0) {
      const { data: b } = await supabase
        .from("matches")
        .select("id")
        .eq("status", "completed")
        .is("scoring_finalized_at", null)
        .lte("match_finished_at", cutoffIso)
        .order("start_time", { ascending: true })
        .limit(rem2);
      legacyB = (b ?? []) as { id: number }[];
    }
  }

  const seen = new Set<number>();
  const rows: { id: number }[] = [];
  for (const r of [...(inReview ?? []), ...legacyA, ...legacyB]) {
    const id = Number(r.id);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id });
  }

  let matchesProcessed = 0;
  let teamsUpdated = 0;
  let awaitingData = 0;

  for (const r of rows) {
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
