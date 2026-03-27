import type { SmFixture } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { mapMatchStatusFromSmFixture } from "./match-status-from-sm";
import { buildLiveSnapshotFromFixture } from "./normalize-live-snapshot";
import { fetchFixtureScoreboardRaw, fetchLivescoresNowByFixtureId } from "./fixture-scoreboard";
import { isSportmonksFixtureId } from "./sportmonks-ids";

const MAX_FIXTURES_PER_RUN = 25;

export type SyncScoreboardsResult = {
  updated: number;
  skipped: number;
  errors: number;
  ids: number[];
};

/**
 * Upsert `live_snapshot` + `live_snapshot_at` for live/upcoming SportMonks fixtures.
 */
export async function syncScoreboardSnapshots(): Promise<SyncScoreboardsResult> {
  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("matches")
    .select("id,status")
    .in("status", ["live", "upcoming"])
    .order("start_time", { ascending: true })
    .limit(80);

  const candidates = (rows ?? [])
    .map((r) => Number(r.id))
    .filter((id) => Number.isFinite(id) && isSportmonksFixtureId(id))
    .slice(0, MAX_FIXTURES_PER_RUN);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  let nowMap: Map<number, Record<string, unknown>> = new Map();
  try {
    nowMap = await fetchLivescoresNowByFixtureId();
  } catch {
    nowMap = new Map();
  }

  for (const matchId of candidates) {
    try {
      const fromNow = nowMap.get(matchId);
      const full = await fetchFixtureScoreboardRaw(matchId);
      const merged =
        full && fromNow
          ? ({ ...fromNow, ...full } as Record<string, unknown>)
          : full ?? fromNow;
      if (!merged) {
        skipped += 1;
        continue;
      }
      const snapshot = buildLiveSnapshotFromFixture(merged);
      const payload: Record<string, unknown> = {
        live_snapshot: snapshot as unknown as Record<string, unknown>,
        live_snapshot_at: new Date().toISOString(),
      };
      const st = merged.status;
      if (typeof st === "string" && st.trim()) {
        payload.sm_fixture_status = st.trim();
      }
      const asF = merged as Partial<SmFixture>;
      if (
        asF.starting_at &&
        (asF.id === matchId || asF.id == null)
      ) {
        payload.status = mapMatchStatusFromSmFixture({
          ...asF,
          id: matchId,
        } as SmFixture);
      }

      const { error } = await supabase.from("matches").update(payload).eq("id", matchId);
      if (error) {
        errors += 1;
      } else {
        updated += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { updated, skipped, errors, ids: candidates };
}
