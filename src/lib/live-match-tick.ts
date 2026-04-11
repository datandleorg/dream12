import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import {
  extractScoreboardRawToLiveMap,
  mergeFieldingFromBattingRows,
} from "@/lib/extract-scoreboard-raw-to-live-map";
import { pickScoreboardRaw } from "@/lib/pick-scoreboard-raw";
import type { SmFixture } from "@/lib/sportmonks/client";
import { smFixtureNoteFromPayload } from "@/lib/sportmonks/client";
import { sportmonksToken } from "@/lib/sportmonks/client";
import {
  fetchFixtureMetaRaw,
  fetchFixturePrematchRaw,
  fetchFixtureScoreboardRaw,
  fetchLivescoresNowByFixtureId,
} from "@/lib/sportmonks/fixture-scoreboard";
import {
  mapMatchStatusFromSmFixture,
  resolveDbStatusAfterLiveTick,
  type DbMatchStatus,
} from "@/lib/sportmonks/match-status-from-sm";
import { buildLiveSnapshotFromFixture } from "@/lib/sportmonks/normalize-live-snapshot";
import { applyLineupFromFixturePayload } from "@/lib/sportmonks/sync-lineup";
import { upsertSingleSmFixture } from "@/lib/sportmonks/sync-fixture-upsert";
import { normalizeSportmonksToss } from "@/lib/sportmonks/toss";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { notifyTossPublishedOnce } from "@/lib/notifications/toss-notify";
import { updateUserTeamsPointsForMatch } from "@/lib/update-user-teams-for-match";

export const MAX_MATCHES_PER_RUN = 25;

/**
 * Fixture IDs to exclude from the automated live pipeline (cron `/api/cron/live-match-tick`).
 * Comma- or whitespace-separated positive integers. Does not apply to admin
 * `POST /api/admin/sync-match` with a single `matchId` (manual tick still runs).
 */
function livePipelineSkipMatchIds(): Set<number> {
  const raw = process.env.LIVE_MATCH_TICK_SKIP_MATCH_IDS?.trim();
  if (!raw) return new Set();
  const out = new Set<number>();
  for (const part of raw.split(/[\s,]+/)) {
    const t = part.trim();
    if (!t) continue;
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) out.add(Math.trunc(n));
  }
  return out;
}

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

function isDbMatchStatus(s: string): s is DbMatchStatus {
  return (
    s === "upcoming" ||
    s === "live" ||
    s === "completed" ||
    s === "in_review"
  );
}

/**
 * Build a minimal `SmFixture` from a livescores "now" row so `mapMatchStatusFromSmFixture`
 * can classify (e.g. Delayed → upcoming). Returns null if there is nothing to map.
 */
function smFixtureFromLivescoreNow(
  id: number,
  merged: Record<string, unknown> | undefined,
): SmFixture | null {
  if (!merged || typeof merged !== "object") return null;
  const nested = merged.fixture;
  const startFromNested =
    nested && typeof nested === "object" && nested !== null
      ? (nested as { starting_at?: string }).starting_at
      : undefined;
  const asF = merged as Partial<SmFixture>;
  const starting_at =
    typeof asF.starting_at === "string" && asF.starting_at
      ? asF.starting_at
      : typeof startFromNested === "string" && startFromNested
        ? startFromNested
        : undefined;
  const status =
    typeof asF.status === "string" && asF.status.trim()
      ? asF.status.trim()
      : undefined;
  const live = asF.live;
  if (!starting_at && !status && live == null) return null;
  return { id, starting_at, status, live } as SmFixture;
}

/**
 * One match: merge livescores + fixture, persist, optional lineup/balls/toss, recompute points.
 * `previousDbStatus` must match the row in DB before this update (for live → in_review).
 */
export async function runLiveMatchTickForMatch(
  supabase: SupabaseClient,
  matchId: number,
  nowMap: Map<number, Record<string, unknown>>,
  opts?: {
    previousDbStatus: DbMatchStatus;
    lastLineupSyncAt?: string | null;
    /** Admin refresh — bypass lineup throttle */
    forceLineup?: boolean;
    /** Skip user_teams points (e.g. backfill snapshot only) */
    skipPoints?: boolean;
  },
): Promise<LiveMatchTickOneResult> {
  const previousDbStatus = opts?.previousDbStatus ?? "live";
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
    const notePersist = smFixtureNoteFromPayload(merged.note);
    if (notePersist) {
      payload.sm_fixture_note = notePersist;
    }

    const asF = merged as Partial<SmFixture>;
    if (asF.starting_at && (asF.id === matchId || asF.id == null)) {
      const fixtureForMap = { ...asF, id: matchId } as SmFixture;
      if (previousDbStatus === "live" || previousDbStatus === "in_review") {
        const resolved = resolveDbStatusAfterLiveTick(previousDbStatus, fixtureForMap);
        payload.status = resolved.status;
        if (resolved.setMatchFinishedAt) {
          payload.match_finished_at = nowIso;
        }
      } else {
        payload.status = mapMatchStatusFromSmFixture(fixtureForMap);
      }
    }

    const tossNorm = normalizeSportmonksToss(
      { ...merged, id: matchId } as unknown as SmFixture & { toss?: unknown },
    );
    if (tossNorm && (tossNorm.winnerTeamId != null || tossNorm.decision != null)) {
      if (tossNorm.winnerTeamId != null) {
        payload.toss_winner_team_id = tossNorm.winnerTeamId;
      }
      if (tossNorm.decision != null) {
        payload.toss_decision = tossNorm.decision;
      }
      payload.toss_raw = tossNorm.raw;
      payload.toss_recorded_at = nowIso;
    }

    if (
      lineupPresentOnPayload(merged) &&
      shouldRunLineupSync(opts?.lastLineupSyncAt, opts?.forceLineup)
    ) {
      const lr = await applyLineupFromFixturePayload(
        supabase,
        matchId,
        merged as unknown as SmFixture & { lineup?: unknown },
      );
      if (lr.inserted > 0) {
        payload.last_lineup_sync_at = nowIso;
        payload.lineup_synced = true;
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

    if (payload.toss_winner_team_id != null || payload.toss_decision != null) {
      await notifyTossPublishedOnce(matchId);
    }

    if (opts?.skipPoints) {
      return { updated: true, teamsUpdated: 0, skipped: false, error: false };
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

export type MatchPipelineResult = {
  prematch: { processed: number; errors: number };
  promote: { promoted: number; errors: number };
  liveTicks: {
    updatedMatches: number;
    teamsUpdated: number;
    skipped: number;
    errors: number;
    ids: number[];
  };
  /** Fixture IDs bypassed this run (env `LIVE_MATCH_TICK_SKIP_MATCH_IDS`). */
  pipelineSkippedMatchIds?: number[];
  note?: string;
};

const TOSS_WINDOW_MS = 45 * 60 * 1000;
const PROMOTE_BEFORE_MS = 2 * 60 * 60 * 1000;
const PROMOTE_AFTER_MS = 6 * 60 * 60 * 1000;
const PREMATCH_LINEUP_MIN_MS = 60 * 1000;

function shouldRunPrematchLineupSync(lastAt: string | null | undefined): boolean {
  if (lastAt == null || lastAt === "") return true;
  const t = new Date(lastAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= PREMATCH_LINEUP_MIN_MS;
}

function inPrematchWindow(startTimeIso: string, now: number): boolean {
  const start = Date.parse(startTimeIso);
  if (!Number.isFinite(start)) return false;
  return start <= now + TOSS_WINDOW_MS && start >= now - 60 * 60 * 1000;
}

function inPromoteWindow(startTimeIso: string, now: number): boolean {
  const start = Date.parse(startTimeIso);
  if (!Number.isFinite(start)) return false;
  return start <= now + PROMOTE_AFTER_MS && start >= now - PROMOTE_BEFORE_MS;
}

/**
 * Smart minutely router: prematch toss/lineup, upcoming→live promotion, live + in_review scoring.
 */
export async function runMatchPipeline(
  supabase: SupabaseClient,
): Promise<MatchPipelineResult> {
  const prematch = { processed: 0, errors: 0 };
  const promote = { promoted: 0, errors: 0 };
  const liveTicks = {
    updatedMatches: 0,
    teamsUpdated: 0,
    skipped: 0,
    errors: 0,
    ids: [] as number[],
  };

  if (!sportmonksToken()) {
    return {
      prematch,
      promote,
      liveTicks,
      note: "SPORTMONKS_TOKEN missing",
    };
  }

  const skipMatchIds = livePipelineSkipMatchIds();
  const pipelineSkipped = new Set<number>();

  const now = Date.now();
  let nowMap: Map<number, Record<string, unknown>> = new Map();
  try {
    nowMap = await fetchLivescoresNowByFixtureId();
  } catch {
    nowMap = new Map();
  }

  const { data: upcomingPrematch } = await supabase
    .from("matches")
    .select("id, start_time, toss_recorded_at, last_lineup_sync_at, lineup_synced")
    .eq("status", "upcoming")
    .eq("lineup_synced", false)
    .order("start_time", { ascending: true })
    .limit(80);

  for (const row of upcomingPrematch ?? []) {
    const id = Number(row.id);
    if (!isSportmonksFixtureId(id)) continue;
    if (skipMatchIds.has(id)) {
      pipelineSkipped.add(id);
      continue;
    }
    const start = String(row.start_time ?? "");
    const tossAt = row.toss_recorded_at as string | null;
    const inWindow = inPrematchWindow(start, now) || tossAt != null;
    if (!inWindow) continue;
    if (!shouldRunPrematchLineupSync(row.last_lineup_sync_at as string | null)) continue;

    prematch.processed += 1;
    try {
      const raw = await fetchFixturePrematchRaw(id);
      if (!raw) continue;

      const patch: Record<string, unknown> = {};
      const tossNorm = normalizeSportmonksToss(
        { ...raw, id } as unknown as SmFixture & { toss?: unknown },
      );
      if (tossNorm && (tossNorm.winnerTeamId != null || tossNorm.decision != null)) {
        if (tossNorm.winnerTeamId != null) patch.toss_winner_team_id = tossNorm.winnerTeamId;
        if (tossNorm.decision != null) patch.toss_decision = tossNorm.decision;
        patch.toss_raw = tossNorm.raw;
        if (tossAt == null) {
          patch.toss_recorded_at = new Date().toISOString();
        }
      }

      if (Object.keys(patch).length > 0) {
        const { error: patchErr } = await supabase.from("matches").update(patch).eq("id", id);
        if (patchErr) {
          prematch.errors += 1;
        } else if (tossAt == null && patch.toss_recorded_at != null) {
          await notifyTossPublishedOnce(id);
        }
      }

      if (lineupPresentOnPayload(raw)) {
        const lr = await applyLineupFromFixturePayload(
          supabase,
          id,
          raw as unknown as SmFixture & { lineup?: unknown },
        );
        const up: Record<string, unknown> = {
          last_lineup_sync_at: new Date().toISOString(),
        };
        if (lr.inserted > 0) {
          up.lineup_synced = true;
        }
        await supabase.from("matches").update(up).eq("id", id);
      }
    } catch {
      prematch.errors += 1;
    }
  }

  const { data: upcomingPromote } = await supabase
    .from("matches")
    .select("id, start_time")
    .eq("status", "upcoming")
    .order("start_time", { ascending: true })
    .limit(80);

  for (const row of upcomingPromote ?? []) {
    const id = Number(row.id);
    if (!isSportmonksFixtureId(id)) continue;
    if (skipMatchIds.has(id)) {
      pipelineSkipped.add(id);
      continue;
    }
    if (!inPromoteWindow(String(row.start_time ?? ""), now)) continue;

    const merged = nowMap.get(id);
    const fromNow = smFixtureFromLivescoreNow(id, merged);
    let source: SmFixture | null = null;
    let usedLivescoreForLive = false;
    let metaLoaded: SmFixture | null = null;

    if (fromNow) {
      if (mapMatchStatusFromSmFixture(fromNow) === "live") {
        source = fromNow;
        usedLivescoreForLive = true;
      }
    } else {
      try {
        const meta = await fetchFixtureMetaRaw(id);
        if (meta) {
          const asF = { ...(meta as Partial<SmFixture>), id } as SmFixture;
          metaLoaded = asF;
          if (mapMatchStatusFromSmFixture(asF) === "live") {
            source = asF;
          }
        }
      } catch {
        promote.errors += 1;
        continue;
      }
    }

    if (!source) continue;

    try {
      if (!usedLivescoreForLive && metaLoaded) {
        await upsertSingleSmFixture(supabase, metaLoaded);
      }

      const smSt =
        source.status?.trim() ||
        (merged && typeof merged.status === "string" ? merged.status.trim() : null);
      const smNote =
        smFixtureNoteFromPayload(
          merged && typeof merged === "object"
            ? (merged as Record<string, unknown>).note
            : null,
        ) ?? smFixtureNoteFromPayload(source.note);

      await supabase
        .from("matches")
        .update({
          status: "live",
          ...(smSt ? { sm_fixture_status: smSt } : {}),
          ...(smNote ? { sm_fixture_note: smNote } : {}),
        })
        .eq("id", id);
      promote.promoted += 1;
    } catch {
      promote.errors += 1;
    }
  }

  const { data: liveRows } = await supabase
    .from("matches")
    .select("id,last_lineup_sync_at,status")
    .in("status", ["live", "in_review"])
    .order("start_time", { ascending: true })
    .limit(MAX_MATCHES_PER_RUN);

  const rows = liveRows ?? [];
  const ids = rows
    .map((r) => Number(r.id))
    .filter((id) => {
      if (!Number.isFinite(id) || !isSportmonksFixtureId(id)) return false;
      if (skipMatchIds.has(id)) {
        pipelineSkipped.add(id);
        return false;
      }
      return true;
    });

  liveTicks.ids = ids;

  const byId = new Map(
    rows.map((r) => [Number(r.id), r.last_lineup_sync_at as string | null]),
  );
  const statusById = new Map(rows.map((r) => [Number(r.id), String(r.status ?? "live")]));

  for (const matchId of ids) {
    const stRaw = statusById.get(matchId) ?? "live";
    const previousDbStatus = isDbMatchStatus(stRaw) ? stRaw : "live";
    const r = await runLiveMatchTickForMatch(supabase, matchId, nowMap, {
      previousDbStatus,
      lastLineupSyncAt: byId.get(matchId),
    });
    if (r.error) liveTicks.errors += 1;
    else if (r.skipped) liveTicks.skipped += 1;
    else if (r.updated) {
      liveTicks.updatedMatches += 1;
      liveTicks.teamsUpdated += r.teamsUpdated;
    }
  }

  const out: MatchPipelineResult = { prematch, promote, liveTicks };
  if (pipelineSkipped.size > 0) {
    out.pipelineSkippedMatchIds = [...pipelineSkipped].sort((a, b) => a - b);
  }
  return out;
}

/**
 * Full minutely pipeline (prematch, promote, live + in_review ticks).
 * @deprecated Name kept for cron route compatibility — calls `runMatchPipeline`.
 */
export async function runLiveMatchTick(
  supabase: SupabaseClient,
): Promise<LiveMatchTickResult> {
  const r = await runMatchPipeline(supabase);
  return {
    updatedMatches: r.liveTicks.updatedMatches,
    teamsUpdated: r.liveTicks.teamsUpdated,
    skipped: r.liveTicks.skipped,
    errors: r.prematch.errors + r.promote.errors + r.liveTicks.errors,
    ids: r.liveTicks.ids,
    note: r.note,
  };
}
