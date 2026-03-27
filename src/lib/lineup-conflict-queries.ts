import { createClient } from "@/lib/supabase/server";
import { countRosterNotInPlayingXi } from "@/lib/lineup-conflict";

/**
 * For each contest the user has joined, count roster players with `in_playing_xi = false`
 * (announced lineup excludes them). Contests without a saved team stay at 0.
 */
export async function getLineupConflictCountsByContest(
  matchId: number,
  userId: string,
  contestIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of contestIds) out.set(id, 0);
  if (!contestIds.length) return out;

  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id,in_playing_xi")
    .eq("match_id", matchId);

  const xiMap = new Map<string, boolean | null>();
  for (const p of players ?? []) {
    const id = p.id as string;
    xiMap.set(
      id,
      p.in_playing_xi === true ? true : p.in_playing_xi === false ? false : null,
    );
  }

  const { data: teams } = await supabase
    .from("user_teams")
    .select("id,contest_id")
    .eq("user_id", userId)
    .in("contest_id", contestIds);

  if (!teams?.length) return out;

  const teamIds = teams.map((t) => t.id as string);
  const { data: rosterRows } = await supabase
    .from("team_roster")
    .select("team_id,player_id")
    .in("team_id", teamIds);

  const rosterByTeam = new Map<string, string[]>();
  for (const r of rosterRows ?? []) {
    const tid = r.team_id as string;
    const pid = r.player_id as string;
    if (!rosterByTeam.has(tid)) rosterByTeam.set(tid, []);
    rosterByTeam.get(tid)!.push(pid);
  }

  for (const t of teams) {
    const tid = t.id as string;
    const cid = t.contest_id as string;
    const ids = rosterByTeam.get(tid) ?? [];
    out.set(cid, countRosterNotInPlayingXi(ids, xiMap));
  }

  return out;
}
