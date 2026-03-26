import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type TeamFlowPlayerRow = {
  id: string;
  name: string;
  team: string;
  role: string;
  credit_value: number;
  season_points: number | null;
  selection_pct: number | null;
  played_last_match: boolean | null;
  photo_url: string | null;
};

export type TeamFlowMatchRow = {
  id: number;
  name: string;
  start_time: string;
  tournament_name: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_logo_url: string | null;
  team_b_logo_url: string | null;
};

export type TeamFlowContestSummary = {
  id: string;
  name: string | null;
  match_id: number;
  entry_fee: number;
  prize_pool: number;
};

export async function loadTeamFlowData(matchId: number, contestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,tournament_name,team_a,team_b,team_a_logo_url,team_b_logo_url",
    )
    .eq("id", matchId)
    .single();

  const { data: contest } = await supabase
    .from("contests")
    .select("id,name,match_id,entry_fee,prize_pool")
    .eq("id", contestId)
    .maybeSingle();

  if (!match || !contest || contest.match_id !== matchId) notFound();

  const { data: players } = await supabase
    .from("players")
    .select(
      "id,name,team,role,credit_value,season_points,selection_pct,played_last_match,photo_url",
    )
    .eq("match_id", matchId)
    .order("credit_value", { ascending: false });

  const { data: team } = await supabase
    .from("user_teams")
    .select("id,captain_id,vice_captain_id")
    .eq("user_id", user.id)
    .eq("contest_id", contestId)
    .maybeSingle();

  let initialRoster: string[] = [];
  if (team?.id) {
    const { data: roster } = await supabase
      .from("team_roster")
      .select("player_id")
      .eq("team_id", team.id);
    initialRoster = roster?.map((r) => r.player_id as string) ?? [];
  }

  const contestSummary: TeamFlowContestSummary = {
    id: contest.id,
    name: contest.name,
    match_id: contest.match_id,
    entry_fee: Number(contest.entry_fee ?? 0),
    prize_pool: Number(contest.prize_pool ?? 0),
  };

  return {
    user,
    match: match as TeamFlowMatchRow,
    contest: contestSummary,
    hasExistingTeam: Boolean(team?.id),
    players: (players ?? []) as TeamFlowPlayerRow[],
    initialRoster,
    initialCaptainId: (team?.captain_id as string) ?? null,
    initialViceId: (team?.vice_captain_id as string) ?? null,
  };
}
