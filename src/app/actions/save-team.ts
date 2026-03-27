"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateSquad, type PickPlayer } from "@/lib/fantasy/validate-squad";

export type SaveTeamResult =
  | { ok: true }
  | { ok: false; message: string };

function mapRpcError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("insufficient wallet")) {
    return "Not enough wallet balance for this contest. Add money and try again.";
  }
  if (m.includes("deadline")) return "Team lock deadline has passed.";
  if (m.includes("not authenticated")) return "Sign in again to save your team.";
  if (
    m.includes("duplicate key") ||
    m.includes("unique constraint") ||
    m.includes("user_teams_user_id_contest_id")
  ) {
    return "You already have a team in this contest.";
  }
  return msg;
}

export async function saveTeamAction(input: {
  contestId: string;
  matchId: number;
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
}): Promise<SaveTeamResult> {
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

  const { data: teamId, error } = await supabase.rpc("save_fantasy_team", {
    p_match_id: input.matchId,
    p_contest_id: input.contestId,
    p_player_ids: input.playerIds,
    p_captain_id: input.captainId,
    p_vice_captain_id: input.viceCaptainId,
  });

  if (error) {
    return { ok: false, message: mapRpcError(error.message) };
  }
  if (!teamId) {
    return { ok: false, message: "Could not save team." };
  }

  revalidatePath(`/matches/${input.matchId}`);
  revalidatePath(`/matches/${input.matchId}/build`);
  revalidatePath(`/matches/${input.matchId}/contests/${input.contestId}/squad`);
  revalidatePath(`/matches/${input.matchId}/contests/${input.contestId}/captain`);
  revalidatePath(`/matches/${input.matchId}/contests/${input.contestId}/preview`);
  revalidatePath(`/contests/${input.contestId}`);
  revalidatePath("/contests");
  revalidatePath("/wallet");
  revalidatePath("/");
  return { ok: true };
}
