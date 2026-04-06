"use server";

import { createClient } from "@/lib/supabase/server";
import { isContestVisibleToUser } from "@/lib/contest-visibility";
import {
  buildBreakdownOk,
  buildLiveMapForMatch,
  matchTeamLabels,
  parseContestUserTeam,
} from "@/lib/contest-team-breakdown-core";
import type { ContestTeamPitchPayload } from "@/lib/contest-team-breakdown-core";
import { canViewOthersContestTeamPreview } from "@/lib/opponent-team-preview-policy";
import type { TeamBreakdownLine } from "@/lib/live-scoring";

export type ContestTeamBreakdownResult =
  | {
      ok: true;
      lines: TeamBreakdownLine[];
      computedTotal: number;
      storedTotal: number;
      statsAvailable: boolean;
      pitch: ContestTeamPitchPayload;
    }
  | { ok: false; message: string };

export async function getContestTeamBreakdown(input: {
  contestId: string;
  userTeamId: string;
}): Promise<ContestTeamBreakdownResult> {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in to view team breakdown." };
  }

  const { data: team, error: teamErr } = await supabase
    .from("user_teams")
    .select(
      `
      id,
      user_id,
      captain_id,
      vice_captain_id,
      match_id,
      contest_id,
      total_points,
      team_roster (
        player_id,
        players (
          name,
          team,
          role,
          sportmonks_id,
          in_playing_xi,
          credit_value,
          season_points,
          selection_pct,
          played_last_match,
          photo_url
        )
      )
    `,
    )
    .eq("id", input.userTeamId)
    .eq("contest_id", input.contestId)
    .not("entry_fee_paid_at", "is", null)
    .maybeSingle();

  if (teamErr || !team) {
    return { ok: false, message: "Team not found for this contest." };
  }

  const { data: contest } = await supabase
    .from("contests")
    .select("created_by, creator_joined_at")
    .eq("id", input.contestId)
    .single();

  if (
    !contest ||
    !isContestVisibleToUser(
      {
        created_by: contest.created_by as string | null,
        creator_joined_at: contest.creator_joined_at as string | null,
      },
      user.id,
    )
  ) {
    return { ok: false, message: "Contest not available." };
  }

  const { data: matchMeta, error: matchErr } = await supabase
    .from("matches")
    .select("team_a, team_b, name, live_snapshot, fixture_scoreboard_raw, status")
    .eq("id", team.match_id)
    .maybeSingle();

  if (matchErr || !matchMeta) {
    return { ok: false, message: "Match not found." };
  }

  const teamOwnerId = String(team.user_id);
  const matchStatus = String(matchMeta.status ?? "");
  if (
    !canViewOthersContestTeamPreview({
      matchStatus,
      viewerUserId: user.id,
      teamOwnerUserId: teamOwnerId,
    })
  ) {
    return {
      ok: false,
      message: "Opponent teams are visible once the match goes live.",
    };
  }

  const parsed = parseContestUserTeam(team);
  if ("error" in parsed) {
    return { ok: false, message: parsed.error };
  }

  const { teamA, teamB } = matchTeamLabels(matchMeta);
  const matchId = Number(team.match_id);
  const { liveMap, statsAvailable } = await buildLiveMapForMatch(
    matchMeta,
    matchId,
    parsed.roster,
  );

  const ok = buildBreakdownOk(parsed, liveMap, teamA, teamB, statsAvailable);
  return { ok: true, ...ok };
  } catch (e) {
    console.error("[getContestTeamBreakdown]", e);
    return { ok: false, message: "Unable to load team breakdown. Try again." };
  }
}
