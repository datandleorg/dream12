import type { SmFixture } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { mapMatchStatusFromSmFixture } from "./match-status-from-sm";
import {
  buildLiveSnapshotFromFixture,
  isLiveSnapshotMissing,
} from "./normalize-live-snapshot";
import { fetchFixtureScoreboardRaw, fetchLivescoresNowByFixtureId } from "./fixture-scoreboard";
import { isSportmonksFixtureId } from "./sportmonks-ids";

const MAX_FIXTURES_PER_RUN = 25;
const FETCH_WINDOW = 80;

function scoreboardCompletedLookbackDays(): number {
  const n = Number(process.env.SPORTMONKS_SCOREBOARD_COMPLETED_DAYS);
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 90);
  return 7;
}

export type SyncScoreboardsResult = {
  updated: number;
  skipped: number;
  errors: number;
  ids: number[];
};

/**
 * Build fixture id list: live first, then recently completed matches still missing a stored scorecard (one-shot until success).
 * Upcoming matches are omitted — fixture metadata is refreshed by sync-fixtures; scoreboard payloads are not useful until live.
 */
async function collectScoreboardCandidateIds(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number[]> {
  const cap = MAX_FIXTURES_PER_RUN;
  const seen = new Set<number>();
  const out: number[] = [];

  const pushUnique = (ids: number[]) => {
    for (const id of ids) {
      if (!Number.isFinite(id) || !isSportmonksFixtureId(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= cap) return;
    }
  };

  const { data: liveRows } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "live")
    .order("start_time", { ascending: true })
    .limit(FETCH_WINDOW);
  pushUnique((liveRows ?? []).map((r) => Number(r.id)));
  if (out.length >= cap) return out;

  const days = scoreboardCompletedLookbackDays();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const { data: completedRows } = await supabase
    .from("matches")
    .select("id,live_snapshot")
    .eq("status", "completed")
    .gte("start_time", cutoff.toISOString())
    .order("start_time", { ascending: false })
    .limit(FETCH_WINDOW);

  const completedNeedingSnapshot = (completedRows ?? [])
    .filter((r) => isLiveSnapshotMissing(r.live_snapshot))
    .map((r) => Number(r.id));

  pushUnique(completedNeedingSnapshot);
  return out;
}

/**
 * Upsert `live_snapshot` + `live_snapshot_at` for live matches each run, and one-shot final snapshots for recently completed matches that still lack scorecard data.
 */
export async function syncScoreboardSnapshots(): Promise<SyncScoreboardsResult> {
  const supabase = createServiceClient();
  const candidates = await collectScoreboardCandidateIds(supabase);

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
