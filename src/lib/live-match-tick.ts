import type { SupabaseClient } from "@supabase/supabase-js";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import { extractScoreboardRawToLiveMap } from "@/lib/extract-scoreboard-raw-to-live-map";
import { pickScoreboardRaw } from "@/lib/pick-scoreboard-raw";
import type { SmFixture } from "@/lib/sportmonks/client";
import { sportmonksToken } from "@/lib/sportmonks/client";
import {
  fetchFixtureScoreboardRaw,
  fetchLivescoresNowByFixtureId,
} from "@/lib/sportmonks/fixture-scoreboard";
import { mapMatchStatusFromSmFixture } from "@/lib/sportmonks/match-status-from-sm";
import { buildLiveSnapshotFromFixture } from "@/lib/sportmonks/normalize-live-snapshot";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { updateUserTeamsPointsForMatch } from "@/lib/update-user-teams-for-match";

const MAX_MATCHES_PER_RUN = 25;

export type LiveMatchTickResult = {
  updatedMatches: number;
  teamsUpdated: number;
  skipped: number;
  errors: number;
  ids: number[];
  note?: string;
};

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
    .select("id")
    .eq("status", "live")
    .order("start_time", { ascending: true })
    .limit(MAX_MATCHES_PER_RUN);

  const ids = (liveRows ?? [])
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

  for (const matchId of ids) {
    try {
      const fromNow = nowMap.get(matchId);
      const full = await fetchFixtureScoreboardRaw(matchId);
      const merged =
        full && fromNow
          ? ({ ...fromNow, ...full } as Record<string, unknown>)
          : ((full ?? fromNow) as Record<string, unknown> | null);
      if (!merged) {
        skipped += 1;
        continue;
      }

      const picked = pickScoreboardRaw(merged);
      let liveMap = extractScoreboardRawToLiveMap(picked);
      if (Object.keys(liveMap).length === 0) {
        liveMap = extractLiveStatsByPlayer(merged);
      }

      const snapshot = buildLiveSnapshotFromFixture(merged);
      const nowIso = new Date().toISOString();
      const payload: Record<string, unknown> = {
        fixture_scoreboard_raw: picked,
        fixture_scoreboard_raw_at: nowIso,
        live_snapshot: snapshot as unknown as Record<string, unknown>,
        live_snapshot_at: nowIso,
      };

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

      const { error: upErr } = await supabase
        .from("matches")
        .update(payload)
        .eq("id", matchId);
      if (upErr) {
        errors += 1;
        continue;
      }

      updatedMatches += 1;
      teamsUpdated += await updateUserTeamsPointsForMatch(
        supabase,
        matchId,
        liveMap,
      );
    } catch {
      errors += 1;
    }
  }

  return { updatedMatches, teamsUpdated, skipped, errors, ids };
}
