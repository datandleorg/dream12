import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture } from "./client";
import { SM_FIXTURE_LIST_INCLUDE, sportmonksFetch, sportmonksToken } from "./client";
import { isSportmonksFixtureId } from "./sportmonks-ids";
import { upsertSingleSmFixture } from "./sync-fixture-upsert";

/**
 * Fetch fixture detail (no lineup) for display or targeted DB refresh.
 */
export async function getFixtureDetail(matchId: number): Promise<SmFixture | null> {
  if (!sportmonksToken() || !isSportmonksFixtureId(matchId)) return null;
  try {
    const json = await sportmonksFetch<{ data?: SmFixture }>(`/fixtures/${matchId}`, {
      include: SM_FIXTURE_LIST_INCLUDE,
    });
    return json.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert `matches` + reference rows from SportMonks for this fixture id.
 */
export async function refreshMatchFromSportmonks(matchId: number): Promise<boolean> {
  const f = await getFixtureDetail(matchId);
  if (!f?.starting_at) return false;
  const supabase = createServiceClient();
  const r = await upsertSingleSmFixture(supabase, f);
  return r.ok;
}
