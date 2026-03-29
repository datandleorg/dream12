import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import {
  extractScoreboardRawToLiveMap,
  mergeFieldingFromBattingRows,
} from "@/lib/extract-scoreboard-raw-to-live-map";
import { pickScoreboardRaw } from "@/lib/pick-scoreboard-raw";
import type { SmFixture } from "@/lib/sportmonks/client";
import { sportmonksToken } from "@/lib/sportmonks/client";
import {
  fetchFixtureScoreboardRaw,
  fetchLivescoresNowByFixtureId,
} from "@/lib/sportmonks/fixture-scoreboard";
import { mapMatchStatusFromSmFixture } from "@/lib/sportmonks/match-status-from-sm";
import { buildLiveSnapshotFromFixture } from "@/lib/sportmonks/normalize-live-snapshot";
import { applyLineupFromFixturePayload } from "@/lib/sportmonks/sync-lineup";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { updateUserTeamsPointsForMatch } from "@/lib/update-user-teams-for-match";

export const MAX_MATCHES_PER_RUN = 25;

/** Minimum time between applying `lineup` from the live fixture payload (per match). */
const LINEUP_SYNC_MIN_MS = 3 * 60 * 1000;

export type LiveMatchTickResult = {
  updatedMatches: number;
  teamsUpdated: number;
  skipped: number;
  errors: number;
  ids: number[];
  note?: string;
};

export type LiveMatchTickOneResult = {
  updated: boolean;
  teamsUpdated: number;
  skipped: boolean;
  error: boolean;
  note?: string;
};

function lineupPresentOnPayload(merged: Record<string, unknown>): boolean {
  const lu = merged.lineup;
  if (lu == null) return false;
  if (Array.isArray(lu)) return lu.length > 0;
  if (typeof lu === "object" && lu !== null && "data" in lu) {
    const d = (lu as { data?: unknown }).data;
    return Array.isArray(d) && d.length > 0;
  }
  return false;
}

function shouldRunLineupSync(
  lastLineupSyncAt: string | null | undefined,
  force: boolean | undefined,
): boolean {
  if (force) return true;
  if (lastLineupSyncAt == null || lastLineupSyncAt === "") return true;
  const t = new Date(lastLineupSyncAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= LINEUP_SYNC_MIN_MS;
}

/**
 * One live match: merge livescores + fixture, persist, optional lineup/balls, recompute points.
 */
export async function runLiveMatchTickForMatch(
  supabase: SupabaseClient,
  matchId: number,
  nowMap: Map<number, Record<string, unknown>>,
  opts?: {
    lastLineupSyncAt?: string | null;
    /** Admin refresh — bypass lineup throttle */
    forceLineup?: boolean;
  },
): Promise<LiveMatchTickOneResult> {
  try {
    const fromNow = nowMap.get(matchId);
    const full = await fetchFixtureScoreboardRaw(matchId);
    const merged =
      full && fromNow
        ? ({ ...fromNow, ...full } as Record<string, unknown>)
        : ((full ?? fromNow) as Record<string, unknown> | null);
    if (!merged) {
      return { updated: false, teamsUpdated: 0, skipped: true, error: false };
    }

    const picked = pickScoreboardRaw(merged);
    let liveMap = extractScoreboardRawToLiveMap(picked);
    if (Object.keys(liveMap).length === 0) {
      liveMap = extractLiveStatsByPlayer(merged);
      mergeFieldingFromBattingRows(liveMap, picked);
    }

    const snapshot = buildLiveSnapshotFromFixture(merged);
    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      fixture_scoreboard_raw: picked,
      fixture_scoreboard_raw_at: nowIso,
      live_snapshot: snapshot as unknown as Record<string, unknown>,
      live_snapshot_at: nowIso,
    };

    if (merged.balls != null) {
      payload.fixture_balls_raw = merged.balls;
      payload.fixture_balls_raw_at = nowIso;
    }

    const st = merged.status;
    if (typeof st === "string" && st.trim()) {
      payload.sm_fixture_status = st.trim();
    }

    const asF = merged as Partial<SmFixture>;
    if (asF.starting_at && (asF.id === matchId || asF.id == null)) {
      payload.status = mapMatchStatusFromSmFixture({
        ...asF,
        id: matchId,
      } as SmFixture);
    }

    if (
      lineupPresentOnPayload(merged) &&
      shouldRunLineupSync(opts?.lastLineupSyncAt, opts?.forceLineup)
    ) {
      const lr = await applyLineupFromFixturePayload(
        supabase,
        matchId,
        merged as unknown as SmFixture & { lineup?: unknown },
        { skipNotify: true },
      );
      if (lr.inserted > 0) {
        payload.last_lineup_sync_at = nowIso;
      }
    }

    const { error: upErr } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", matchId);
    if (upErr) {
      return {
        updated: false,
        teamsUpdated: 0,
        skipped: false,
        error: true,
        note: upErr.message,
      };
    }

    const teamsUpdated = await updateUserTeamsPointsForMatch(
      supabase,
      matchId,
      liveMap,
    );
    return {
      updated: true,
      teamsUpdated,
      skipped: false,
      error: false,
    };
  } catch (e) {
    return {
      updated: false,
      teamsUpdated: 0,
      skipped: false,
      error: true,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Every-minute pipeline: live matches only — merge fixture + livescores/now, persist raw + snapshot,
 * recompute fantasy points from shared scoreboard extractor (fallback: full-tree extract).
 */
export async function runLiveMatchTick(
  supabase: SupabaseClient,
): Promise<LiveMatchTickResult> {
  if (!sportmonksToken()) {
    return {
      updatedMatches: 0,
      teamsUpdated: 0,
      skipped: 0,
      errors: 0,
      ids: [],
      note: "SPORTMONKS_TOKEN missing",
    };
  }

  const { data: liveRows } = await supabase
    .from("matches")
    .select("id,last_lineup_sync_at")
    .eq("status", "live")
    .order("start_time", { ascending: true })
    .limit(MAX_MATCHES_PER_RUN);

  const rows = liveRows ?? [];
  const ids = rows
    .map((r) => Number(r.id))
    .filter((id) => Number.isFinite(id) && isSportmonksFixtureId(id));

  if (!ids.length) {
    return {
      updatedMatches: 0,
      teamsUpdated: 0,
      skipped: 0,
      errors: 0,
      ids: [],
      note: "No live matches",
    };
  }

  let nowMap: Map<number, Record<string, unknown>> = new Map();
  try {
    nowMap = await fetchLivescoresNowByFixtureId();
  } catch {
    nowMap = new Map();
  }

  let updatedMatches = 0;
  let teamsUpdated = 0;
  let skipped = 0;
  let errors = 0;

  const byId = new Map(
    rows.map((r) => [Number(r.id), r.last_lineup_sync_at as string | null]),
  );

  for (const matchId of ids) {
    const r = await runLiveMatchTickForMatch(supabase, matchId, nowMap, {
      lastLineupSyncAt: byId.get(matchId),
    });
    if (r.error) errors += 1;
    else if (r.skipped) skipped += 1;
    else if (r.updated) {
      updatedMatches += 1;
      teamsUpdated += r.teamsUpdated;
    }
  }

  return { updatedMatches, teamsUpdated, skipped, errors, ids };
}
