import { createServiceClient } from "@/lib/supabase/service";
import { formatMatchTossSummary } from "@/lib/match-toss-summary";

/**
 * One-shot: notify users who have a paid team in any contest for this match that toss info is available.
 * Idempotent via `matches.toss_notified_at` (same pattern as {@link notifyLineupPublishedOnce}).
 */
export async function notifyTossPublishedOnce(matchId: number): Promise<void> {
  const supabase = createServiceClient();

  const { data: matchRow } = await supabase
    .from("matches")
    .select(
      "toss_notified_at,toss_winner_team_id,toss_decision,team_a,team_b,name,localteam_id,visitorteam_id",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!matchRow || matchRow.toss_notified_at) return;

  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const { tossLine, battingFirstLine } = formatMatchTossSummary({
    team_a: typeof matchRow.team_a === "string" ? matchRow.team_a : null,
    team_b: typeof matchRow.team_b === "string" ? matchRow.team_b : null,
    localteam_id: num(matchRow.localteam_id),
    visitorteam_id: num(matchRow.visitorteam_id),
    toss_winner_team_id: num(matchRow.toss_winner_team_id),
    toss_decision: typeof matchRow.toss_decision === "string" ? matchRow.toss_decision : null,
  });

  if (!tossLine && !battingFirstLine) return;

  const body = [tossLine, battingFirstLine].filter(Boolean).join(" · ");

  const { data: teams } = await supabase
    .from("user_teams")
    .select("user_id")
    .eq("match_id", matchId)
    .not("entry_fee_paid_at", "is", null);

  const userIds = [...new Set((teams ?? []).map((t) => t.user_id as string))];
  if (!userIds.length) {
    await supabase
      .from("matches")
      .update({ toss_notified_at: new Date().toISOString() })
      .eq("id", matchId);
    return;
  }

  const subtitle =
    matchRow.team_a && matchRow.team_b
      ? `${matchRow.team_a} vs ${matchRow.team_b}`
      : (matchRow.name as string) || "Match";

  const rows = userIds.map((user_id) => ({
    user_id,
    type: "toss_result",
    title: "Toss",
    body: `${subtitle}: ${body}`,
    payload: {
      match_id: matchId,
      href: `/matches/${matchId}`,
    },
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) return;

  await supabase
    .from("matches")
    .update({ toss_notified_at: new Date().toISOString() })
    .eq("id", matchId);
}
