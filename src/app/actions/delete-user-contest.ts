"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMatchUpcomingForUserContests } from "@/lib/fantasy/team-lock";

export type DeleteUserContestResult =
  | { ok: true; matchId: number }
  | { ok: false; message: string };

function parseMatchIdFromRpc(data: unknown): number | null {
  if (data == null || typeof data !== "object") return null;
  const raw = (data as { match_id?: unknown }).match_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function mapRpcError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("not authenticated")) return "Sign in again to manage this contest.";
  if (m.includes("contest not found")) return "This contest no longer exists.";
  if (m.includes("only user-created")) return "Only contests you created can be removed this way.";
  if (m.includes("only the contest creator")) return "Only the contest host can delete it.";
  if (m.includes("already settled")) return "This contest can’t be deleted — it’s already finished or voided.";
  if (m.includes("finished")) return "This match has finished — this contest can’t be deleted.";
  if (m.includes("deadline") || m.includes("lock")) return "Team lock has passed — this contest can’t be deleted.";
  if (m.includes("match not found")) return "Match not found. Refresh and try again.";
  if (m.includes("not open for contest") || m.includes("contest changes")) {
    return "Contests can’t be changed after the match has started or finished.";
  }
  return msg;
}

export async function deleteUserContestAction(contestId: string): Promise<DeleteUserContestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { data: contestRow } = await supabase
    .from("contests")
    .select("match_id")
    .eq("id", contestId)
    .maybeSingle();
  if (!contestRow?.match_id) {
    return { ok: false, message: "This contest no longer exists." };
  }
  const { data: matchRow } = await supabase
    .from("matches")
    .select("status")
    .eq("id", contestRow.match_id as number)
    .maybeSingle();
  if (!matchRow) {
    return { ok: false, message: "Match not found. Refresh and try again." };
  }
  if (!isMatchUpcomingForUserContests(matchRow.status as string)) {
    return {
      ok: false,
      message:
        "You can’t delete a contest after the match has started or finished.",
    };
  }

  const { data, error } = await supabase.rpc("delete_user_contest", {
    p_contest_id: contestId,
  });

  if (error) {
    return { ok: false, message: mapRpcError(error.message) };
  }

  const matchId = parseMatchIdFromRpc(data);
  if (matchId == null) {
    return { ok: false, message: "Could not delete contest. Try again." };
  }

  revalidatePath("/");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/contests/${contestId}`);
  return { ok: true, matchId };
}
