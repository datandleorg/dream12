import { createServiceClient } from "@/lib/supabase/service";

/**
 * One-shot: notify users who have a team in any contest for this match that the XI is out.
 */
export async function notifyLineupPublishedOnce(matchId: number): Promise<void> {
  const supabase = createServiceClient();

  const { data: matchRow } = await supabase
    .from("matches")
    .select("lineup_notified_at,team_a,team_b,name")
    .eq("id", matchId)
    .maybeSingle();

  if (!matchRow || matchRow.lineup_notified_at) return;

  const { data: teams } = await supabase
    .from("user_teams")
    .select("user_id")
    .eq("match_id", matchId);

  const userIds = [...new Set((teams ?? []).map((t) => t.user_id as string))];
  if (!userIds.length) {
    await supabase
      .from("matches")
      .update({ lineup_notified_at: new Date().toISOString() })
      .eq("id", matchId);
    return;
  }

  const subtitle =
    matchRow.team_a && matchRow.team_b
      ? `${matchRow.team_a} vs ${matchRow.team_b}`
      : (matchRow.name as string) || "Match";

  const rows = userIds.map((user_id) => ({
    user_id,
    type: "lineup_out",
    title: "Playing XI is out",
    body: `Final XI published for ${subtitle}. Review your fantasy picks.`,
    payload: {
      match_id: matchId,
      href: `/matches/${matchId}`,
    },
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) return;

  await supabase
    .from("matches")
    .update({ lineup_notified_at: new Date().toISOString() })
    .eq("id", matchId);
}
