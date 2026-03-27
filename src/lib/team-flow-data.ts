import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countRosterNotInPlayingXi } from "@/lib/lineup-conflict";

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
  /** null = lineup not synced; false = known not in official XI; true = in XI */
  in_playing_xi: boolean | null;
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

const PLAYERS_SELECT =
  "id,name,team,role,credit_value,season_points,selection_pct,played_last_match,photo_url,in_playing_xi" as const;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function loadPlayersForMatch(
  supabase: ServerSupabase,
  matchId: number,
): Promise<TeamFlowPlayerRow[]> {
  const { data: players } = await supabase
    .from("players")
    .select(PLAYERS_SELECT)
    .eq("match_id", matchId)
    .order("credit_value", { ascending: false });
  return (players ?? []).map((p) => ({
    ...p,
    in_playing_xi:
      p.in_playing_xi === true ? true : p.in_playing_xi === false ? false : null,
  })) as TeamFlowPlayerRow[];
}

/** Re-fetch players for a match (e.g. after SportMonks sync). */
export async function fetchPlayersForMatch(matchId: number) {
  const supabase = await createClient();
  return loadPlayersForMatch(supabase, matchId);
}

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

  const players = await loadPlayersForMatch(supabase, matchId);

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

  const xiMap = new Map<string, boolean | null>(
    players.map((p) => [p.id, p.in_playing_xi]),
  );
  const lineupConflictCount = countRosterNotInPlayingXi(initialRoster, xiMap);

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
    players,
    initialRoster,
    initialCaptainId: (team?.captain_id as string) ?? null,
    initialViceId: (team?.vice_captain_id as string) ?? null,
    lineupConflictCount,
  };
}
