import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmFixture } from "@/lib/sportmonks/client";
import { smFixtureNoteFromPayload, sportmonksToken } from "@/lib/sportmonks/client";
import { fetchFixtureMetaRaw } from "@/lib/sportmonks/fixture-scoreboard";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";

const HORIZON_MS = 24 * 60 * 60 * 1000;
const MAX_PER_RUN = 40;

export type TodayScheduleMonitorResult = {
  checked: number;
  updated: number;
  errors: number;
  note?: string;
};

/**
 * Hourly: refresh `start_time` and `sm_fixture_status` for near-term matches without overwriting
 * lifecycle `status` (live / in_review / completed) managed by the minutely pipeline and finalize.
 */
export async function runTodayScheduleMonitor(
  supabase: SupabaseClient,
): Promise<TodayScheduleMonitorResult> {
  if (!sportmonksToken()) {
    return { checked: 0, updated: 0, errors: 0, note: "SPORTMONKS_TOKEN missing" };
  }

  const now = Date.now();
  const horizon = new Date(now + HORIZON_MS).toISOString();
  const from = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("matches")
    .select("id, start_time")
    .gte("start_time", from)
    .lte("start_time", horizon)
    .order("start_time", { ascending: true })
    .limit(MAX_PER_RUN);

  let checked = 0;
  let updated = 0;
  let errors = 0;

  for (const r of rows ?? []) {
    const id = Number(r.id);
    if (!isSportmonksFixtureId(id)) continue;
    checked += 1;
    try {
      const meta = await fetchFixtureMetaRaw(id);
      if (!meta) continue;
      const asF = meta as Partial<SmFixture>;
      const patch: Record<string, unknown> = {
        schedule_checked_at: new Date().toISOString(),
      };
      if (asF.starting_at) patch.start_time = asF.starting_at;
      const st = meta.status;
      if (typeof st === "string" && st.trim()) {
        patch.sm_fixture_status = st.trim();
      }
      const notePersist = smFixtureNoteFromPayload(
        (meta as Record<string, unknown>).note,
      );
      if (notePersist) {
        patch.sm_fixture_note = notePersist;
      }

      const { error } = await supabase.from("matches").update(patch).eq("id", id);
      if (error) errors += 1;
      else updated += 1;
    } catch {
      errors += 1;
    }
  }

  return { checked, updated, errors };
}
