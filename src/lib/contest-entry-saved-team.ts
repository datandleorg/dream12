import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve `user_saved_match_teams.slot` for the viewer’s template ids (RLS-safe). */
export async function mapSavedTemplateIdsToSlots(
  supabase: SupabaseClient,
  userId: string,
  templateIds: (string | null | undefined)[],
): Promise<Map<string, number>> {
  const ids = [...new Set(templateIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("user_saved_match_teams")
    .select("id, slot")
    .eq("user_id", userId)
    .in("id", ids);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.id as string, Number(row.slot));
  }
  return map;
}
