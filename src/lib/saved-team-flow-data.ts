import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import type { TeamFlowMatchRow, TeamFlowPlayerRow } from "@/lib/team-flow-data";

const PLAYERS_SELECT =
  "id,sportmonks_id,name,team,role,credit_value,season_points,selection_pct,played_last_match,photo_url,in_playing_xi" as const;

/** Zustand isolation key for saved-team create flow (per match). */
export function savedTeamStoreContestIdCreate(matchId: number): string {
  return `saved-create-${matchId}`;
}

/** Zustand isolation key for editing one saved template. */
export function savedTeamStoreContestIdEdit(savedTeamId: string): string {
  return `saved-edit-${savedTeamId}`;
}

export type SavedMatchTeamListRow = {
  id: string;
  slot: number;
};

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

export async function listSavedMatchTeamsForUser(
  matchId: number,
): Promise<SavedMatchTeamListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("user_saved_match_teams")
    .select("id,slot")
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .order("slot", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    slot: Number(r.slot),
  }));
}

export async function loadSavedTeamFlowData(
  matchId: number,
  mode: { type: "create" } | { type: "edit"; savedTeamId: string },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (isSportmonksFixtureId(matchId)) {
    await refreshMatchFromSportmonks(matchId);
  }

  const { data: matchRaw } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,tournament_name,team_a,team_b,team_a_logo_url,team_b_logo_url,season_id,venue_id,stage_id,match_format,localteam_id,visitorteam_id,toss_winner_team_id,toss_decision",
    )
    .eq("id", matchId)
    .single();

  if (!matchRaw) notFound();

  let venueRow: { name: string | null; city: string | null } | null = null;
  let stageRow: { name: string | null; code: string | null } | null = null;
  if (matchRaw.venue_id != null) {
    const { data: v } = await supabase
      .from("sm_venues")
      .select("name,city")
      .eq("id", matchRaw.venue_id)
      .maybeSingle();
    venueRow = v;
  }
  if (matchRaw.stage_id != null) {
    const { data: s } = await supabase
      .from("sm_stages")
      .select("name,code")
      .eq("id", matchRaw.stage_id)
      .maybeSingle();
    stageRow = s;
  }

  const { venue_label, stage_label } = venueStageLabels(venueRow, stageRow);

  const match: TeamFlowMatchRow = {
    id: Number(matchRaw.id),
    name: matchRaw.name,
    start_time: matchRaw.start_time,
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
      matchRaw.visitorteam_id != null ? Number(matchRaw.visitorteam_id) : null,
    toss_winner_team_id:
      matchRaw.toss_winner_team_id != null
        ? Number(matchRaw.toss_winner_team_id)
        : null,
    toss_decision:
      typeof matchRaw.toss_decision === "string"
        ? matchRaw.toss_decision
        : null,
  };

  const { data: playersRaw } = await supabase
    .from("players")
    .select(PLAYERS_SELECT)
    .eq("match_id", matchId)
    .order("credit_value", { ascending: false });

  const players = (playersRaw ?? []).map((p) => ({
    ...p,
    in_playing_xi:
      p.in_playing_xi === true ? true : p.in_playing_xi === false ? false : null,
  })) as TeamFlowPlayerRow[];

  let initialRoster: string[] = [];
  let initialCaptainId: string | null = null;
  let initialViceId: string | null = null;
  let savedTeamId: string | undefined;
  let slot: number | undefined;

  const storeContestId =
    mode.type === "create"
      ? savedTeamStoreContestIdCreate(matchId)
      : savedTeamStoreContestIdEdit(mode.savedTeamId);

  if (mode.type === "edit") {
    savedTeamId = mode.savedTeamId;
    const { data: st } = await supabase
      .from("user_saved_match_teams")
      .select("id,slot,captain_id,vice_captain_id")
      .eq("id", mode.savedTeamId)
      .eq("user_id", user.id)
      .eq("match_id", matchId)
      .maybeSingle();

    if (!st) notFound();

    slot = Number(st.slot);
    initialCaptainId = (st.captain_id as string) ?? null;
    initialViceId = (st.vice_captain_id as string) ?? null;

    const { data: roster } = await supabase
      .from("user_saved_match_team_roster")
      .select("player_id")
      .eq("saved_team_id", mode.savedTeamId);

    initialRoster = (roster ?? []).map((r) => r.player_id as string);
  }

  return {
    user,
    match,
    players,
    initialRoster,
    initialCaptainId,
    initialViceId,
    storeContestId,
    savedTeamId,
    slot,
  };
}
