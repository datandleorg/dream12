import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SQUAD_SIZE } from "@/lib/fantasy/rules";
import { countRosterNotInPlayingXi } from "@/lib/lineup-conflict";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";

export type TeamFlowPlayerRow = {
  id: string;
  sportmonks_id: number | null;
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
  /** DB `matches.status` — team lock when not `upcoming` */
  status: string;
  tournament_name: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_logo_url: string | null;
  team_b_logo_url: string | null;
  season_id: number | null;
  match_format: string | null;
  venue_label: string | null;
  stage_label: string | null;
  localteam_id: number | null;
  visitorteam_id: number | null;
  toss_winner_team_id: number | null;
  toss_decision: string | null;
};

export type TeamFlowContestSummary = {
  id: string;
  name: string | null;
  match_id: number;
  entry_fee: number;
  prize_pool: number;
};

const PLAYERS_SELECT =
  "id,sportmonks_id,name,team,role,credit_value,season_points,selection_pct,played_last_match,photo_url,in_playing_xi" as const;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type ContestTeamBuildPathOptions = {
  /**
   * Resume / "My team" / edit: always open the squad picker first instead of
   * deep-linking to captain or preview when the XI is already complete.
   */
  startAtSquad?: boolean;
};

/** Deep link for this user’s progress: squad vs captain vs preview. */
export function contestTeamBuildPath(
  matchId: number,
  contestId: string,
  rosterPlayerCount: number,
  captainId: string | null,
  viceCaptainId: string | null,
  options?: ContestTeamBuildPathOptions,
): string {
  const base = `/matches/${matchId}/contests/${contestId}`;
  if (options?.startAtSquad) {
    return `${base}/squad`;
  }
  const capVcOk =
    Boolean(captainId) &&
    Boolean(viceCaptainId) &&
    captainId !== viceCaptainId;
  if (rosterPlayerCount === SQUAD_SIZE && !capVcOk) return `${base}/captain`;
  if (rosterPlayerCount === SQUAD_SIZE && capVcOk) return `${base}/preview`;
  return `${base}/squad`;
}

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

function venueStageLabels(
  venue: { name?: string | null; city?: string | null } | null,
  stage: { name?: string | null; code?: string | null } | null,
): { venue_label: string | null; stage_label: string | null } {
  const vname = venue?.name?.trim();
  const vcity = venue?.city?.trim();
  const venue_label =
    vname && vcity ? `${vname}, ${vcity}` : vname ?? vcity ?? null;
  const sname = stage?.name?.trim();
  const scode = stage?.code?.trim();
  const stage_label =
    sname && scode ? `${sname} (${scode})` : sname ?? scode ?? null;
  return { venue_label, stage_label };
}

export async function loadTeamFlowData(
  matchId: number,
  contestId: string,
  options?: { resetContestDraft?: boolean; skipSportmonksRefresh?: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (
    isSportmonksFixtureId(matchId) &&
    !options?.skipSportmonksRefresh
  ) {
    await refreshMatchFromSportmonks(matchId);
  }

  if (options?.resetContestDraft) {
    const { data: draftTeam } = await supabase
      .from("user_teams")
      .select("id")
      .eq("user_id", user.id)
      .eq("contest_id", contestId)
      .maybeSingle();

    if (draftTeam?.id) {
      const tid = draftTeam.id as string;
      const { error: rosterErr } = await supabase
        .from("team_roster")
        .delete()
        .eq("team_id", tid);
      if (rosterErr) {
        console.error("reset contest draft roster:", rosterErr.message);
      }
      const { error: teamErr } = await supabase
        .from("user_teams")
        .update({
          captain_id: null,
          vice_captain_id: null,
          source_saved_match_team_id: null,
        })
        .eq("id", tid)
        .eq("user_id", user.id);
      if (teamErr) {
        console.error("reset contest draft user_teams:", teamErr.message);
      }
    }
  }

  const { data: matchRaw } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b,team_a_logo_url,team_b_logo_url,season_id,venue_id,stage_id,match_format,localteam_id,visitorteam_id,toss_winner_team_id,toss_decision",
    )
    .eq("id", matchId)
    .single();

  let venueRow: { name: string | null; city: string | null } | null = null;
  let stageRow: { name: string | null; code: string | null } | null = null;
  if (matchRaw?.venue_id != null) {
    const { data: v } = await supabase
      .from("sm_venues")
      .select("name,city")
      .eq("id", matchRaw.venue_id)
      .maybeSingle();
    venueRow = v;
  }
  if (matchRaw?.stage_id != null) {
    const { data: s } = await supabase
      .from("sm_stages")
      .select("name,code")
      .eq("id", matchRaw.stage_id)
      .maybeSingle();
    stageRow = s;
  }

  const { venue_label, stage_label } = venueStageLabels(venueRow, stageRow);

  const match: TeamFlowMatchRow | null = matchRaw
    ? {
        id: Number(matchRaw.id),
        name: matchRaw.name,
        start_time: matchRaw.start_time,
        status: String(matchRaw.status ?? "upcoming"),
        tournament_name: matchRaw.tournament_name ?? null,
        team_a: matchRaw.team_a ?? null,
        team_b: matchRaw.team_b ?? null,
        team_a_logo_url: matchRaw.team_a_logo_url ?? null,
        team_b_logo_url: matchRaw.team_b_logo_url ?? null,
        season_id: matchRaw.season_id ?? null,
        match_format: matchRaw.match_format ?? null,
        venue_label,
        stage_label,
        localteam_id:
          matchRaw.localteam_id != null ? Number(matchRaw.localteam_id) : null,
        visitorteam_id:
          matchRaw.visitorteam_id != null
            ? Number(matchRaw.visitorteam_id)
            : null,
        toss_winner_team_id:
          matchRaw.toss_winner_team_id != null
            ? Number(matchRaw.toss_winner_team_id)
            : null,
        toss_decision:
          typeof matchRaw.toss_decision === "string"
            ? matchRaw.toss_decision
            : null,
      }
    : null;

  const { data: contest } = await supabase
    .from("contests")
    .select("id,name,match_id,entry_fee,prize_pool")
    .eq("id", contestId)
    .maybeSingle();

  if (!match || !contest || contest.match_id !== matchId) notFound();

  const players = await loadPlayersForMatch(supabase, matchId);

  const { data: team } = await supabase
    .from("user_teams")
    .select("id,captain_id,vice_captain_id,entry_fee_paid_at")
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

  const initialCaptainId = (team?.captain_id as string) ?? null;
  const initialViceId = (team?.vice_captain_id as string) ?? null;

  return {
    user,
    match,
    contest: contestSummary,
    hasExistingTeam: Boolean(team?.id),
    hasPaidEntry: team?.entry_fee_paid_at != null,
    players,
    initialRoster,
    initialCaptainId,
    initialViceId,
    lineupConflictCount,
    teamBuildPath: contestTeamBuildPath(
      matchId,
      contestId,
      initialRoster.length,
      initialCaptainId,
      initialViceId,
    ),
  };
}
