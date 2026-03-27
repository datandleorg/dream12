import { createServiceClient } from "@/lib/supabase/service";
import { sportmonksToken, type SmFixture } from "./client";
import { mapMatchStatusFromSmFixture } from "./match-status-from-sm";
import { fetchFixtureScoreboardRaw } from "./fixture-scoreboard";
import {
  buildLiveSnapshotFromFixture,
  parseLiveSnapshot,
  type LiveSnapshot,
} from "./normalize-live-snapshot";
import { isSportmonksFixtureId } from "./sportmonks-ids";

const STALE_MS = 3 * 60 * 1000;

export async function resolveLiveSnapshotForPage(
  matchId: number,
  row: {
    live_snapshot: unknown;
    live_snapshot_at: string | null;
  },
): Promise<LiveSnapshot> {
  let snap = parseLiveSnapshot(row.live_snapshot);
  const at = row.live_snapshot_at
    ? new Date(row.live_snapshot_at).getTime()
    : 0;
  const stale = !snap || !at || Date.now() - at > STALE_MS;

  if (!sportmonksToken() || !isSportmonksFixtureId(matchId) || !stale) {
    return snap ?? buildLiveSnapshotFromFixture(null);
  }

  const raw = await fetchFixtureScoreboardRaw(matchId);
  if (!raw) {
    return snap ?? buildLiveSnapshotFromFixture(null);
  }

  const built = buildLiveSnapshotFromFixture(raw);
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {
    live_snapshot: built as unknown as Record<string, unknown>,
    live_snapshot_at: new Date().toISOString(),
  };
  const st = raw.status;
  if (typeof st === "string" && st.trim()) {
    patch.sm_fixture_status = st.trim();
  }
  if (raw.starting_at) {
    patch.status = mapMatchStatusFromSmFixture({ ...raw, id: matchId } as SmFixture);
  }
  await supabase.from("matches").update(patch).eq("id", matchId);

  return built;
}
