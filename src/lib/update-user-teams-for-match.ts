import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { aggregateTeamPoints, type RosterRow } from "@/lib/live-scoring";

/** Recompute and persist `user_teams.total_points` for every team on this match. */
export async function updateUserTeamsPointsForMatch(
  supabase: SupabaseClient,
  matchId: number,
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
): Promise<number> {
  let updated = 0;
  const { data: teams } = await supabase
    .from("user_teams")
    .select("id,user_id,captain_id,vice_captain_id")
    .eq("match_id", matchId)
    .not("entry_fee_paid_at", "is", null);

  if (!teams?.length) return 0;

  for (const team of teams) {
    const { data: rosterJoin } = await supabase
      .from("team_roster")
      .select("player_id, players ( sportmonks_id, role, in_playing_xi )")
      .eq("team_id", team.id);

    const roster: RosterRow[] =
      rosterJoin?.map((r) => {
        const p = r.players as unknown;
        const row =
          p && typeof p === "object" && !Array.isArray(p)
            ? (p as {
                sportmonks_id?: number | null;
                role?: string;
                in_playing_xi?: boolean | null;
              })
            : null;
        return {
          player_id: r.player_id as string,
          sportmonks_id: row?.sportmonks_id ?? null,
          role: row?.role ?? "BAT",
          in_playing_xi: row?.in_playing_xi ?? null,
        };
      }) ?? [];

    if (!roster.length) continue;

    const points = aggregateTeamPoints(
      roster,
      team.captain_id as string,
      team.vice_captain_id as string,
      liveMap,
    );

    const { error } = await supabase
      .from("user_teams")
      .update({ total_points: points, updated_at: new Date().toISOString() })
      .eq("id", team.id);
    if (!error) updated += 1;
  }

  return updated;
}
