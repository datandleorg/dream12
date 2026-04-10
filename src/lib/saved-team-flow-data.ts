import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import type { TeamFlowMatchRow, TeamFlowPlayerRow } from "@/lib/team-flow-data";
import {
  mapRowToBuilderPlayer,
  type BuilderPlayer,
} from "@/stores/team-builder";

const PLAYERS_SELECT =
  "id,sportmonks_id,name,team,role,credit_value,season_points,selection_pct,played_last_match,photo_url,in_playing_xi" as const;

/** Zustand isolation key for saved-team create flow (per match). */
export function savedTeamStoreIdCreate(matchId: number): string {
  return `saved-create-${matchId}`;
}

/** Zustand isolation key for editing one saved template. */
export function savedTeamStoreIdEdit(savedTeamId: string): string {
  return `saved-edit-${savedTeamId}`;
}

export type SavedMatchTeamListRow = {
  id: string;
  slot: number;
};

export type SavedMatchTeamCardRow = {
  id: string;
  slot: number;
  updated_at: string;
  captain: { name: string; photo_url: string | null };
  viceCaptain: { name: string; photo_url: string | null };
  captainId: string;
  viceCaptainId: string;
  /** Full XI for pitch preview on My teams list. */
  previewPlayers: BuilderPlayer[];
  countA: number;
  countB: number;
  rosterCount: number;
};

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

/** My teams hub: C/VC + franchise split for list cards. */
export async function listSavedMatchTeamsWithSummary(
  matchId: number,
  teamA: string | null,
  teamB: string | null,
): Promise<SavedMatchTeamCardRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: teams } = await supabase
    .from("user_saved_match_teams")
    .select("id,slot,captain_id,vice_captain_id,updated_at")
    .eq("user_id", user.id)
    .eq("match_id", matchId)
    .order("slot", { ascending: true });

  if (!teams?.length) return [];

  const savedIds = teams.map((t) => t.id as string);

  const { data: rosterRows } = await supabase
    .from("user_saved_match_team_roster")
    .select("saved_team_id,player_id")
    .in("saved_team_id", savedIds);

  const rosterBySaved = new Map<string, string[]>();
  for (const row of rosterRows ?? []) {
    const sid = row.saved_team_id as string;
    const pid = row.player_id as string;
    const list = rosterBySaved.get(sid) ?? [];
    list.push(pid);
    rosterBySaved.set(sid, list);
  }

  const allPlayerIds = new Set<string>();
  for (const pids of rosterBySaved.values()) {
    for (const id of pids) allPlayerIds.add(id);
  }
  for (const t of teams) {
    allPlayerIds.add(t.captain_id as string);
    allPlayerIds.add(t.vice_captain_id as string);
  }

  const ids = [...allPlayerIds];
  const playerById = new Map<
    string,
    {
      id: string;
      name: string;
      team: string;
      role: string;
      credit_value: number;
      season_points: number | null;
      selection_pct: number | null;
      played_last_match: boolean | null;
      photo_url: string | null;
      in_playing_xi: boolean | null;
    }
  >();

  if (ids.length > 0) {
    const { data: playerRows } = await supabase
      .from("players")
      .select(
        "id,name,team,role,credit_value,season_points,selection_pct,played_last_match,photo_url,in_playing_xi",
      )
      .eq("match_id", matchId)
      .in("id", ids);

    for (const p of playerRows ?? []) {
      playerById.set(p.id as string, {
        id: p.id as string,
        name: p.name as string,
        team: p.team as string,
        role: p.role as string,
        credit_value: Number(p.credit_value),
        season_points: p.season_points as number | null,
        selection_pct: p.selection_pct as number | null,
        played_last_match: p.played_last_match as boolean | null,
        photo_url: (p.photo_url as string | null) ?? null,
        in_playing_xi:
          p.in_playing_xi === true ? true : p.in_playing_xi === false ? false : null,
      });
    }
  }

  const aLabel = teamA?.trim() ?? "";
  const bLabel = teamB?.trim() ?? "";

  return teams.map((t) => {
    const sid = t.id as string;
    const roster = rosterBySaved.get(sid) ?? [];
    let countA = 0;
    let countB = 0;
    for (const pid of roster) {
      const p = playerById.get(pid);
      if (!p?.team) continue;
      const team = String(p.team).trim();
      if (aLabel && team === aLabel) countA += 1;
      else if (bLabel && team === bLabel) countB += 1;
    }

    const capId = t.captain_id as string;
    const vcId = t.vice_captain_id as string;
    const capRow = playerById.get(capId);
    const vcRow = playerById.get(vcId);

    const previewPlayers: BuilderPlayer[] = [];
    for (const pid of roster) {
      const row = playerById.get(pid);
      if (!row) continue;
      previewPlayers.push(mapRowToBuilderPlayer(row));
    }

    return {
      id: sid,
      slot: Number(t.slot),
      updated_at: t.updated_at as string,
      captain: {
        name: capRow?.name?.trim() || "Captain",
        photo_url: capRow?.photo_url ?? null,
      },
      viceCaptain: {
        name: vcRow?.name?.trim() || "Vice-captain",
        photo_url: vcRow?.photo_url ?? null,
      },
      captainId: capId,
      viceCaptainId: vcId,
      previewPlayers,
      countA,
      countB,
      rosterCount: roster.length,
    };
  });
}

export function savedTeamBuildPath(
  matchId: number,
  savedTeamId: string | undefined,
  rosterCount: number,
  captainId: string | null,
  viceCaptainId: string | null,
): string {
  const base = savedTeamId
    ? `/matches/${matchId}/teams/${savedTeamId}`
    : `/matches/${matchId}/teams/create`;
  const capVcOk =
    Boolean(captainId) &&
    Boolean(viceCaptainId) &&
    captainId !== viceCaptainId;
  if (rosterCount === 11 && !capVcOk) return `${base}/captain`;
  if (rosterCount === 11 && capVcOk) return `${base}/preview`;
  return `${base}/squad`;
}

export async function loadSavedTeamFlowData(
  matchId: number,
  mode: { type: "create" } | { type: "edit"; savedTeamId: string },
  options?: { skipSportmonksRefresh?: boolean },
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

  const { data: matchRaw } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b,team_a_logo_url,team_b_logo_url,season_id,venue_id,stage_id,match_format,localteam_id,visitorteam_id,toss_winner_team_id,toss_decision",
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

  const vname = venueRow?.name?.trim();
  const vcity = venueRow?.city?.trim();
  const venue_label =
    vname && vcity ? `${vname}, ${vcity}` : vname ?? vcity ?? null;
  const sname = stageRow?.name?.trim();
  const scode = stageRow?.code?.trim();
  const stage_label =
    sname && scode ? `${sname} (${scode})` : sname ?? scode ?? null;

  const match: TeamFlowMatchRow = {
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
      ? savedTeamStoreIdCreate(matchId)
      : savedTeamStoreIdEdit(mode.savedTeamId);

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
