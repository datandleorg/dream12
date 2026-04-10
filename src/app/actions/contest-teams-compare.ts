"use server";

import { createClient } from "@/lib/supabase/server";
import { isContestVisibleToUser } from "@/lib/contest-visibility";
import {
  buildBreakdownOk,
  buildLiveMapForMatch,
  buildTeamCompareLists,
  matchTeamLabels,
  mergeRostersForLiveMap,
  parseContestUserTeam,
} from "@/lib/contest-team-breakdown-core";
import type {
  ContestTeamBreakdownOk,
  TeamCompareCommonRow,
  TeamCompareSoloRow,
} from "@/lib/contest-team-breakdown-core";
import { canViewOthersContestTeamPreview } from "@/lib/opponent-team-preview-policy";

const USER_TEAM_SELECT = `
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
    `;

function matchAllowsTeamCompare(status: string): boolean {
  const s = status.toLowerCase();
  return s === "live" || s === "completed" || s === "in_review";
}

export type ContestTeamsCompareResult =
  | {
      ok: true;
      viewer: ContestTeamBreakdownOk;
      opponent: ContestTeamBreakdownOk;
      common: TeamCompareCommonRow[];
      onlyViewer: TeamCompareSoloRow[];
      onlyOpponent: TeamCompareSoloRow[];
    }
  | { ok: false; message: string };

/**
 * Side-by-side breakdown for the signed-in user's team vs another team in the same contest.
 * Allowed while the match is live, completed, or in review.
 */
export async function getContestTeamsCompare(input: {
  contestId: string;
  opponentUserTeamId: string;
}): Promise<ContestTeamsCompareResult> {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in to compare teams." };
  }

  const { data: contest } = await supabase
    .from("contests")
    .select("created_by, creator_joined_at, match_id")
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

  const matchId = Number(contest.match_id);

  const { data: matchMeta, error: matchErr } = await supabase
    .from("matches")
    .select("team_a, team_b, name, live_snapshot, fixture_scoreboard_raw, status")
    .eq("id", matchId)
    .maybeSingle();

  if (matchErr || !matchMeta) {
    return { ok: false, message: "Match not found." };
  }

  const matchStatus = String(matchMeta.status ?? "");
  if (!matchAllowsTeamCompare(matchStatus)) {
    return {
      ok: false,
      message: "Team compare is available once the match has started or finished.",
    };
  }

  const { data: viewerTeam, error: viewerErr } = await supabase
    .from("user_teams")
    .select(USER_TEAM_SELECT)
    .eq("contest_id", input.contestId)
    .eq("user_id", user.id)
    .not("entry_fee_paid_at", "is", null)
    .maybeSingle();

  if (viewerErr || !viewerTeam) {
    return { ok: false, message: "Join this contest to compare teams." };
  }

  const { data: opponentTeam, error: oppErr } = await supabase
    .from("user_teams")
    .select(USER_TEAM_SELECT)
    .eq("id", input.opponentUserTeamId)
    .eq("contest_id", input.contestId)
    .not("entry_fee_paid_at", "is", null)
    .maybeSingle();

  if (oppErr || !opponentTeam) {
    return { ok: false, message: "Opponent team not found for this contest." };
  }

  if (String(opponentTeam.user_id) === user.id) {
    return { ok: false, message: "Pick another contestant to compare." };
  }

  const opponentOwnerId = String(opponentTeam.user_id);
  if (
    !canViewOthersContestTeamPreview({
      matchStatus,
      viewerUserId: user.id,
      teamOwnerUserId: opponentOwnerId,
    })
  ) {
    return {
      ok: false,
      message: "Opponent teams are visible once the match goes live.",
    };
  }

  const viewerParsed = parseContestUserTeam(viewerTeam);
  if ("error" in viewerParsed) {
    return { ok: false, message: viewerParsed.error };
  }

  const opponentParsed = parseContestUserTeam(opponentTeam);
  if ("error" in opponentParsed) {
    return { ok: false, message: opponentParsed.error };
  }

  const { teamA, teamB } = matchTeamLabels(matchMeta);
  const mergeRoster = mergeRostersForLiveMap(
    viewerParsed.roster,
    opponentParsed.roster,
  );
  const { liveMap, statsAvailable } = await buildLiveMapForMatch(
    matchMeta,
    matchId,
    mergeRoster,
  );

  const viewer = buildBreakdownOk(viewerParsed, liveMap, teamA, teamB, statsAvailable);
  const opponent = buildBreakdownOk(
    opponentParsed,
    liveMap,
    teamA,
    teamB,
    statsAvailable,
  );

  const { common, onlyViewer, onlyOpponent } = buildTeamCompareLists(
    viewer.lines,
    opponent.lines,
  );

  return {
    ok: true,
    viewer,
    opponent,
    common,
    onlyViewer,
    onlyOpponent,
  };
  } catch (e) {
    console.error("[getContestTeamsCompare]", e);
    return { ok: false, message: "Unable to compare teams. Try again." };
  }
}
