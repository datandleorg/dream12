import type { SupabaseClient } from "@supabase/supabase-js";
import { sportmonksToken } from "@/lib/sportmonks/client";
import {
  fetchFixturePrematchRaw,
  fetchFixtureScoreboardRaw,
} from "@/lib/sportmonks/fixture-scoreboard";
import { buildLiveSnapshotFromFixture } from "@/lib/sportmonks/normalize-live-snapshot";
import { pickScoreboardRaw } from "@/lib/pick-scoreboard-raw";
import type { SmFixture } from "@/lib/sportmonks/client";
import { applyLineupFromFixturePayload } from "@/lib/sportmonks/sync-lineup";
import { normalizeSportmonksToss } from "@/lib/sportmonks/toss";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { mapMatchStatusFromSmFixture } from "@/lib/sportmonks/match-status-from-sm";
import { updateUserTeamsPointsForMatch } from "@/lib/update-user-teams-for-match";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import {
  extractScoreboardRawToLiveMap,
  mergeFieldingFromBattingRows,
} from "@/lib/extract-scoreboard-raw-to-live-map";

/** Max explicit ids per request (single id or array). */
export const BACKFILL_MAX_EXPLICIT_MATCH_IDS = 50;

const LOG = "[dream12-backfill]";

function tossPayloadSummary(v: unknown): string {
  if (v == null) return "absent";
  if (Array.isArray(v)) return `array(len=${v.length})`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("data" in o && o.data != null && typeof o.data === "object") {
      return `wrapped.data keys=${Object.keys(o.data as object).join(",") || "empty"}`;
    }
    return `object keys=${Object.keys(o).join(",") || "empty"}`;
  }
  return typeof v;
}

function mergedTossLine(m: Record<string, unknown>): string {
  const bits: string[] = [];
  if (m.toss_won_team_id != null) bits.push(`toss_won_team_id=${String(m.toss_won_team_id)}`);
  if (typeof m.elected === "string" && m.elected) bits.push(`elected=${m.elected}`);
  if (m.tosswon != null) bits.push(`tosswon=${tossPayloadSummary(m.tosswon)}`);
  if (m.toss != null) bits.push(`legacy_toss=${tossPayloadSummary(m.toss)}`);
  return bits.length ? bits.join(" ") : "no_toss_fields";
}

function hasTosswonPayload(m: Record<string, unknown>): boolean {
  return m.toss_won_team_id != null || m.tosswon != null;
}

export type BackfillMatchesOpts = {
  limit?: number;
  cursor?: number | null;
  includeBalls?: boolean;
  recomputePoints?: boolean;
  seasonId?: number | null;
  /** One SportMonks fixture id; combined with `matchIds` if both sent. */
  matchId?: number | null;
  /** Explicit ids (max {@link BACKFILL_MAX_EXPLICIT_MATCH_IDS}); skips DB selection. */
  matchIds?: number[] | null;
};

export type BackfillMatchesBatchResult = {
  processed: number;
  matchIds: number[];
  errors: { matchId: number; message: string }[];
  nextCursor: number | null;
  done: boolean;
};

/**
 * Batched refresh from SportMonks: **always** fetches API data and **overwrites** hydrated columns on
 * each selected row. DB selection is **not** limited to null scoreboard/snapshot — use `cursor` +
 * `limit` to page; optional `seasonId` scopes the batch.
 */
export async function runBackfillMatchesBatch(
  supabase: SupabaseClient,
  opts: BackfillMatchesOpts = {},
): Promise<BackfillMatchesBatchResult> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 25));
  const cursor = opts.cursor ?? null;

  const result: BackfillMatchesBatchResult = {
    processed: 0,
    matchIds: [],
    errors: [],
    nextCursor: null,
    done: false,
  };

  if (!sportmonksToken()) {
    result.done = true;
    return result;
  }

  const explicitRaw: number[] = [];
  if (opts.matchId != null && Number.isFinite(opts.matchId)) {
    explicitRaw.push(opts.matchId);
  }
  if (opts.matchIds != null && opts.matchIds.length > 0) {
    for (const n of opts.matchIds) {
      if (typeof n === "number" && Number.isFinite(n)) explicitRaw.push(n);
    }
  }

  let ids: number[] = [];
  let explicitTotalAfterCursor = 0;

  if (explicitRaw.length > 0) {
    const uniq = new Set<number>();
    for (const n of explicitRaw) {
      if (isSportmonksFixtureId(n)) uniq.add(n);
    }
    const sorted = [...uniq].sort((a, b) => a - b);
    if (sorted.length > BACKFILL_MAX_EXPLICIT_MATCH_IDS) {
      result.errors.push({
        matchId: -1,
        message: `At most ${BACKFILL_MAX_EXPLICIT_MATCH_IDS} explicit match ids (got ${sorted.length})`,
      });
      result.done = true;
      return result;
    }
    let afterCursor = sorted;
    if (cursor != null && Number.isFinite(cursor)) {
      afterCursor = sorted.filter((id) => id > cursor);
    }
    explicitTotalAfterCursor = afterCursor.length;
    ids = afterCursor.slice(0, limit);
  } else {
    let q = supabase.from("matches").select("id").order("id", { ascending: true }).limit(limit);

    if (opts.seasonId != null && Number.isFinite(opts.seasonId)) {
      q = q.eq("season_id", opts.seasonId);
    }
    if (cursor != null && Number.isFinite(cursor)) {
      q = q.gt("id", cursor);
    }

    const { data: rows, error: qErr } = await q;
    if (qErr) {
      result.errors.push({ matchId: -1, message: qErr.message });
      result.done = true;
      return result;
    }

    ids = (rows ?? [])
      .map((r) => Number((r as { id: number }).id))
      .filter((id) => isSportmonksFixtureId(id));
  }

  if (!ids.length) {
    result.done = true;
    return result;
  }

  console.log(
    `${LOG} batch start count=${ids.length} cursor=${cursor ?? "null"} seasonId=${opts.seasonId ?? "any"} explicit=${explicitRaw.length > 0}`,
  );

  let lastId: number | null = null;

  for (const matchId of ids) {
    lastId = matchId;
    try {
      console.log(`${LOG} matchId=${matchId} step=fetchFixtureScoreboardRaw`);
      const raw = await fetchFixtureScoreboardRaw(matchId);
      if (!raw) {
        console.warn(`${LOG} matchId=${matchId} scoreboard=no_data`);
        result.errors.push({ matchId, message: "No fixture data from API" });
        continue;
      }

      let merged = { ...(raw as Record<string, unknown>) };
      const lineupOnScoreboard = merged.lineup == null ? "absent" : "present";
      const needsPrematch =
        merged.lineup == null || !hasTosswonPayload(merged);
      console.log(
        `${LOG} matchId=${matchId} after_scoreboard toss=${mergedTossLine(merged)} lineup=${lineupOnScoreboard} needsPrematch=${needsPrematch}`,
      );

      const pre = needsPrematch ? await fetchFixturePrematchRaw(matchId) : null;
      if (needsPrematch) {
        if (pre) {
          const p = pre as Record<string, unknown>;
          const mergedFromPre: string[] = [];
          for (const key of ["lineup", "toss", "tosswon"] as const) {
            if (merged[key] == null && p[key] != null) {
              merged[key] = p[key] as unknown;
              mergedFromPre.push(key);
            }
          }
          if (merged.toss_won_team_id == null && p.toss_won_team_id != null) {
            merged.toss_won_team_id = p.toss_won_team_id;
            mergedFromPre.push("toss_won_team_id");
          }
          if (merged.elected == null && typeof p.elected === "string") {
            merged.elected = p.elected;
            mergedFromPre.push("elected");
          }
          console.log(
            `${LOG} matchId=${matchId} prematch=ok merged_from_prematch=[${mergedFromPre.join(",") || "none"}] toss_after=${mergedTossLine(merged)}`,
          );
        } else {
          console.warn(
            `${LOG} matchId=${matchId} prematch=null_or_failed (still using scoreboard-only merged)`,
          );
        }
      } else {
        console.log(
          `${LOG} matchId=${matchId} prematch=skipped (lineup + tosswon fields already on scoreboard payload)`,
        );
      }

      const picked = pickScoreboardRaw(merged);
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = {
        fixture_scoreboard_raw: picked,
        fixture_scoreboard_raw_at: nowIso,
        live_snapshot: buildLiveSnapshotFromFixture(merged) as unknown as Record<
          string,
          unknown
        >,
        live_snapshot_at: nowIso,
      };

      if (opts.includeBalls && merged.balls != null) {
        patch.fixture_balls_raw = merged.balls;
        patch.fixture_balls_raw_at = nowIso;
      }

      const st = merged.status;
      if (typeof st === "string" && st.trim()) {
        patch.sm_fixture_status = st.trim();
      }

      const tossNorm = normalizeSportmonksToss(
        { ...merged, id: matchId } as unknown as Parameters<typeof normalizeSportmonksToss>[0],
      );
      if (tossNorm?.raw && Object.keys(tossNorm.raw).length > 0) {
        patch.toss_raw = tossNorm.raw;
        patch.toss_recorded_at = nowIso;
      }
      if (tossNorm?.winnerTeamId != null) {
        patch.toss_winner_team_id = tossNorm.winnerTeamId;
      }
      if (tossNorm?.decision != null) {
        patch.toss_decision = tossNorm.decision;
      }
      const rawKeyCount = tossNorm?.raw ? Object.keys(tossNorm.raw).length : 0;
      console.log(
        `${LOG} matchId=${matchId} normalizeSportmonksToss winnerTeamId=${tossNorm?.winnerTeamId ?? "null"} decision=${tossNorm?.decision ?? "null"} rawKeys=${rawKeyCount} will_persist_toss=${rawKeyCount > 0 || tossNorm?.winnerTeamId != null || tossNorm?.decision != null}`,
      );

      const { data: dbRow, error: dbRowErr } = await supabase
        .from("matches")
        .select("status,match_finished_at")
        .eq("id", matchId)
        .maybeSingle();
      if (dbRowErr) {
        result.errors.push({ matchId, message: dbRowErr.message });
        continue;
      }

      patch.schedule_checked_at = nowIso;

      const dbStatus = String(dbRow?.status ?? "").toLowerCase();
      const finishedAt = dbRow?.match_finished_at as string | null | undefined;
      const smBucket = mapMatchStatusFromSmFixture({
        ...(merged as unknown as SmFixture),
        id: matchId,
      });
      if (
        dbStatus === "live" &&
        smBucket === "completed" &&
        (finishedAt == null || finishedAt === "")
      ) {
        patch.status = "in_review";
        patch.match_finished_at = nowIso;
        console.log(
          `${LOG} matchId=${matchId} lifecycle db=live sm=completed -> status=in_review match_finished_at set`,
        );
      }

      const { error: upErr } = await supabase.from("matches").update(patch).eq("id", matchId);
      if (upErr) {
        result.errors.push({ matchId, message: upErr.message });
        continue;
      }

      const lr = await applyLineupFromFixturePayload(
        supabase,
        matchId,
        merged as unknown as SmFixture & { lineup?: unknown },
        { skipNotify: true },
      );
      const lu: Record<string, unknown> = { last_lineup_sync_at: nowIso };
      if (lr.inserted > 0) lu.lineup_synced = true;
      await supabase.from("matches").update(lu).eq("id", matchId);

      if (opts.recomputePoints) {
        let liveMap = extractScoreboardRawToLiveMap(picked);
        if (Object.keys(liveMap).length === 0) {
          liveMap = extractLiveStatsByPlayer(merged);
          mergeFieldingFromBattingRows(liveMap, picked);
        }
        if (Object.keys(liveMap).length > 0) {
          await updateUserTeamsPointsForMatch(supabase, matchId, liveMap);
        }
      }

      result.processed += 1;
      result.matchIds.push(matchId);
      console.log(`${LOG} matchId=${matchId} done processed_ok`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${LOG} matchId=${matchId} error`, msg);
      result.errors.push({
        matchId,
        message: msg,
      });
    }
  }

  result.nextCursor = lastId;
  console.log(
    `${LOG} batch end processed=${result.processed} errors=${result.errors.length} nextCursor=${result.nextCursor} done=${result.done}`,
  );
  result.done =
    explicitRaw.length > 0
      ? ids.length === explicitTotalAfterCursor
      : ids.length < limit;

  return result;
}
