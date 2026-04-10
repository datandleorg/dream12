"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateSquad,
  validateSquadRosterOnly,
  type PickPlayer,
} from "@/lib/fantasy/validate-squad";

export type SaveTeamResult =
  | { ok: true }
  | { ok: false; message: string };

function sortedPlayerKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

function sameFullXi(
  contestPlayerIds: string[],
  contestCap: string,
  contestVc: string,
  templateRoster: string[],
  templateCap: string,
  templateVc: string,
): boolean {
  if (contestCap !== templateCap || contestVc !== templateVc) return false;
  if (templateRoster.length !== 11) return false;
  return sortedPlayerKey(contestPlayerIds) === sortedPlayerKey(templateRoster);
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function bindUserTeamToSavedTemplate(
  supabase: ServerSupabase,
  userId: string,
  userTeamId: string,
  savedTemplateId: string,
  matchId: number,
): Promise<void> {
  const { error } = await supabase
    .from("user_teams")
    .update({ source_saved_match_team_id: savedTemplateId })
    .eq("id", userTeamId)
    .eq("user_id", userId);
  if (error) {
    console.error("bind contest entry to saved template:", error.message);
    return;
  }
  revalidatePath(`/matches/${matchId}/teams`);
}

function mapRpcError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("insufficient wallet")) {
    return "Not enough wallet balance for this contest. Add money and try again.";
  }
  if (m.includes("contest is full")) {
    return "This contest is full — no spots left.";
  }
  if (m.includes("deadline")) return "Team lock deadline has passed.";
  if (m.includes("finished")) return "This match has finished — teams can’t be changed.";
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

  const mid = input.matchId;

  const { data: utAfter } = await supabase
    .from("user_teams")
    .select("source_saved_match_team_id")
    .eq("id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  const boundSource =
    (utAfter?.source_saved_match_team_id as string | null | undefined) ?? null;
  if (boundSource) {
    revalidatePath(`/matches/${mid}/teams`);
  }

  const { count: savedCount, error: countErr } = await supabase
    .from("user_saved_match_teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("match_id", mid);

  const nSaved = savedCount ?? 0;

  if (!countErr && nSaved === 0) {
    const { data: newTplId, error: saveTplErr } = await supabase.rpc(
      "create_user_saved_match_team",
      {
        p_match_id: mid,
        p_player_ids: input.playerIds,
        p_captain_id: input.captainId,
        p_vice_captain_id: input.viceCaptainId,
      },
    );
    if (saveTplErr) {
      console.error("auto-save first match team (T1):", saveTplErr.message);
    } else if (newTplId) {
      await bindUserTeamToSavedTemplate(
        supabase,
        user.id,
        teamId,
        newTplId as string,
        mid,
      );
    }
  } else if (!countErr && !boundSource && nSaved > 0) {
    const { data: savedTeams } = await supabase
      .from("user_saved_match_teams")
      .select("id,captain_id,vice_captain_id")
      .eq("user_id", user.id)
      .eq("match_id", mid);

    const savedIds = (savedTeams ?? []).map((t) => t.id as string);
    let matchedSavedId: string | null = null;

    if (savedIds.length > 0) {
      const { data: rosterRows } = await supabase
        .from("user_saved_match_team_roster")
        .select("saved_team_id,player_id")
        .in("saved_team_id", savedIds);

      const rosterBySaved = new Map<string, string[]>();
      for (const r of rosterRows ?? []) {
        const sid = r.saved_team_id as string;
        const list = rosterBySaved.get(sid) ?? [];
        list.push(r.player_id as string);
        rosterBySaved.set(sid, list);
      }

      for (const st of savedTeams ?? []) {
        const sid = st.id as string;
        const roster = rosterBySaved.get(sid) ?? [];
        if (
          sameFullXi(
            input.playerIds,
            input.captainId,
            input.viceCaptainId,
            roster,
            st.captain_id as string,
            st.vice_captain_id as string,
          )
        ) {
          matchedSavedId = sid;
          break;
        }
      }
    }

    if (matchedSavedId) {
      await bindUserTeamToSavedTemplate(
        supabase,
        user.id,
        teamId,
        matchedSavedId,
        mid,
      );
    } else if (nSaved < 10) {
      const { data: newTplId, error: saveTplErr } = await supabase.rpc(
        "create_user_saved_match_team",
        {
          p_match_id: mid,
          p_player_ids: input.playerIds,
          p_captain_id: input.captainId,
          p_vice_captain_id: input.viceCaptainId,
        },
      );
      if (saveTplErr) {
        console.error("auto-save contest XI as new match team:", saveTplErr.message);
      } else if (newTplId) {
        await bindUserTeamToSavedTemplate(
          supabase,
          user.id,
          teamId,
          newTplId as string,
          mid,
        );
      }
    }
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

/** Persist 11 players with null C/VC so the user can resume on the captain step. */
export async function saveSquadRosterAction(input: {
  contestId: string;
  matchId: number;
  playerIds: string[];
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

  const v = validateSquadRosterOnly(selected);
  if (!v.ok) return { ok: false, message: v.message };

  const { data: teamId, error } = await supabase.rpc("save_fantasy_team", {
    p_match_id: input.matchId,
    p_contest_id: input.contestId,
    p_player_ids: input.playerIds,
    p_captain_id: null,
    p_vice_captain_id: null,
  });

  if (error) {
    return { ok: false, message: mapRpcError(error.message) };
  }
  if (!teamId) {
    return { ok: false, message: "Could not save squad." };
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
