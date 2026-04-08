"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateSquad,
  type PickPlayer,
} from "@/lib/fantasy/validate-squad";

export type SavedMatchTeamActionResult =
  | { ok: true; savedTeamId?: string }
  | { ok: false; message: string };

function mapRpc(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("insufficient wallet")) {
    return "Not enough wallet balance for this contest. Add money and try again.";
  }
  if (m.includes("contest is full")) return "This contest is full — no spots left.";
  if (m.includes("deadline") || m.includes("lock")) {
    return "Team lock is on — the match is no longer upcoming.";
  }
  if (m.includes("finished")) return "This match has finished.";
  if (m.includes("not authenticated")) return "Sign in again.";
  if (m.includes("max saved teams")) return "You already have 10 saved teams for this match.";
  if (m.includes("saved team not found")) return "That saved team was not found.";
  if (m.includes("invalid player")) return "One or more players are no longer valid for this match.";
  if (m.includes("inactive")) return "Your account is inactive.";
  return msg;
}

export async function applySavedTeamToContestAction(input: {
  matchId: number;
  contestId: string;
  savedTeamId: string;
  rosterOnly: boolean;
}): Promise<SavedMatchTeamActionResult & { userTeamId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: teamId, error } = await supabase.rpc("apply_saved_team_to_contest", {
    p_saved_team_id: input.savedTeamId,
    p_contest_id: input.contestId,
    p_roster_only: input.rosterOnly,
  });

  if (error) {
    return { ok: false, message: mapRpc(error.message) };
  }
  if (!teamId) {
    return { ok: false, message: "Could not apply saved team." };
  }

  const mid = input.matchId;
  const cid = input.contestId;
  revalidatePath(`/matches/${mid}`);
  revalidatePath(`/matches/${mid}/contests/${cid}/squad`);
  revalidatePath(`/matches/${mid}/contests/${cid}/captain`);
  revalidatePath(`/matches/${mid}/contests/${cid}/preview`);
  revalidatePath(`/matches/${mid}/contests/${cid}/pick-team`);
  revalidatePath(`/contests/${cid}`);
  revalidatePath("/contests");
  revalidatePath(`/matches/${mid}/teams`);
  return { ok: true, userTeamId: teamId as string };
}

export async function createSavedMatchTeamAction(input: {
  matchId: number;
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
}): Promise<SavedMatchTeamActionResult & { savedTeamId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: rows } = await supabase
    .from("players")
    .select("id,name,team,role,credit_value")
    .eq("match_id", input.matchId)
    .in("id", input.playerIds);

  if (!rows || rows.length !== input.playerIds.length) {
    return { ok: false, message: "One or more players are invalid for this match." };
  }

  const selected: PickPlayer[] = rows.map((r) => ({
    id: r.id,
    team: r.team,
    role: r.role as PickPlayer["role"],
    credit_value: Number(r.credit_value),
  }));

  const v = validateSquad(selected, input.captainId, input.viceCaptainId);
  if (!v.ok) return { ok: false, message: v.message };

  const { data: id, error } = await supabase.rpc("create_user_saved_match_team", {
    p_match_id: input.matchId,
    p_player_ids: input.playerIds,
    p_captain_id: input.captainId,
    p_vice_captain_id: input.viceCaptainId,
  });

  if (error) {
    return { ok: false, message: mapRpc(error.message) };
  }
  if (!id) {
    return { ok: false, message: "Could not save team." };
  }

  const mid = input.matchId;
  revalidatePath(`/matches/${mid}`);
  revalidatePath(`/matches/${mid}/teams`);
  return { ok: true, savedTeamId: id as string };
}

export async function updateSavedMatchTeamAction(input: {
  matchId: number;
  savedTeamId: string;
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
}): Promise<SavedMatchTeamActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: rows } = await supabase
    .from("players")
    .select("id,name,team,role,credit_value")
    .eq("match_id", input.matchId)
    .in("id", input.playerIds);

  if (!rows || rows.length !== input.playerIds.length) {
    return { ok: false, message: "One or more players are invalid for this match." };
  }

  const selected: PickPlayer[] = rows.map((r) => ({
    id: r.id,
    team: r.team,
    role: r.role as PickPlayer["role"],
    credit_value: Number(r.credit_value),
  }));

  const v = validateSquad(selected, input.captainId, input.viceCaptainId);
  if (!v.ok) return { ok: false, message: v.message };

  const { error } = await supabase.rpc("update_user_saved_match_team", {
    p_saved_team_id: input.savedTeamId,
    p_player_ids: input.playerIds,
    p_captain_id: input.captainId,
    p_vice_captain_id: input.viceCaptainId,
  });

  if (error) {
    return { ok: false, message: mapRpc(error.message) };
  }

  const mid = input.matchId;
  const sid = input.savedTeamId;

  const { data: boundRows } = await supabase
    .from("user_teams")
    .select("contest_id")
    .eq("user_id", user.id)
    .eq("source_saved_match_team_id", sid);

  revalidatePath(`/matches/${mid}`);
  revalidatePath(`/matches/${mid}/teams`);
  revalidatePath(`/matches/${mid}/teams/${sid}/squad`);
  revalidatePath(`/matches/${mid}/teams/${sid}/captain`);
  revalidatePath(`/matches/${mid}/teams/${sid}/preview`);

  for (const row of boundRows ?? []) {
    const cid = row.contest_id as string;
    revalidatePath(`/matches/${mid}/contests/${cid}/squad`);
    revalidatePath(`/matches/${mid}/contests/${cid}/captain`);
    revalidatePath(`/matches/${mid}/contests/${cid}/preview`);
    revalidatePath(`/contests/${cid}`);
  }
  revalidatePath("/contests");

  return { ok: true };
}

export async function deleteSavedMatchTeamAction(input: {
  matchId: number;
  savedTeamId: string;
}): Promise<SavedMatchTeamActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase.rpc("delete_user_saved_match_team", {
    p_saved_team_id: input.savedTeamId,
  });

  if (error) {
    return { ok: false, message: mapRpc(error.message) };
  }

  revalidatePath(`/matches/${input.matchId}`);
  revalidatePath(`/matches/${input.matchId}/teams`);
  return { ok: true };
}
