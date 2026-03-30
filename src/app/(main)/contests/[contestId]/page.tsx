import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Row } from "@/components/leaderboard-realtime";
import {
  ContestDashboard,
  type ContestPayoutDisplayRow,
  type ContestPrizeSlab,
} from "@/components/contest-dashboard";
import type { HomeMatchCardModel } from "@/components/home-upcoming-card";
import {
  buildLiveSnapshotFromFixture,
  parseLiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";
import { isContestVisibleToUser } from "@/lib/contest-visibility";

export default async function ContestLeaderboardPage({
  params,
}: {
  params: Promise<{ contestId: string }>;
}) {
  const { contestId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: contest } = await supabase
    .from("contests")
    .select(
      "id,name,match_id,created_by,creator_joined_at,entry_fee,prize_pool,max_participants,winner_count,prize_breakup,prizes_settled_at",
    )
    .eq("id", contestId)
    .single();

  if (!contest) notFound();
  if (
    !isContestVisibleToUser(
      {
        created_by: contest.created_by as string | null,
        creator_joined_at: contest.creator_joined_at as string | null,
      },
      user?.id,
    )
  ) {
    notFound();
  }

  let userHasTeamInContest = false;
  if (user) {
    const { data: myTeamRow } = await supabase
      .from("user_teams")
      .select("id")
      .eq("contest_id", contestId)
      .eq("user_id", user.id)
      .maybeSingle();
    userHasTeamInContest = Boolean(myTeamRow);
  }

  const matchId = Number(contest.match_id);
  const { data: matchRow } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b,team_a_logo_url,team_b_logo_url,live_snapshot,live_snapshot_at,sm_fixture_status,fixture_scoreboard_raw",
    )
    .eq("id", matchId)
    .maybeSingle();

  const liveSnapshot =
    parseLiveSnapshot(matchRow?.live_snapshot) ?? buildLiveSnapshotFromFixture(null);
  const pointsUpdatedAt = matchRow?.live_snapshot_at ?? null;

  const { data: teams } = await supabase
    .from("user_teams")
    .select("id,user_id,total_points")
    .eq("contest_id", contestId);

  const userIds = [...new Set((teams ?? []).map((t) => t.user_id))];
  const { data: profiles } = await supabase
    .from("profile_usernames")
    .select("id,username")
    .in("id", userIds);

  const nameByUser = new Map(
    (profiles ?? []).map((p) => [p.id, p.username as string]),
  );

  const initialRows: Row[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    user_id: t.user_id as string,
    total_points: Number(t.total_points),
    username: nameByUser.get(t.user_id as string) ?? null,
  }));

  const sortedForRank = [...initialRows].sort((a, b) => b.total_points - a.total_points);
  const myIndex =
    user && userHasTeamInContest
      ? sortedForRank.findIndex((r) => r.user_id === user.id)
      : -1;
  const myStandings =
    myIndex >= 0
      ? { rank: myIndex + 1, points: sortedForRank[myIndex]!.total_points }
      : null;

  const prizeSlabs: ContestPrizeSlab[] = Array.isArray(contest.prize_breakup)
    ? (contest.prize_breakup as unknown[]).filter(
        (x): x is ContestPrizeSlab =>
          x != null &&
          typeof x === "object" &&
          "rank_from" in x &&
          "rank_to" in x &&
          "amount" in x,
      )
    : [];

  const prizesSettled = Boolean(contest.prizes_settled_at);
  const payoutByTeamId: Record<string, number> = {};
  const payoutRows: ContestPayoutDisplayRow[] = [];

  if (prizesSettled) {
    const { data: payouts } = await supabase
      .from("contest_payouts")
      .select("user_team_id, user_id, rank, amount_inr")
      .eq("contest_id", contestId)
      .order("rank", { ascending: true });

    const payoutUserIds = [...new Set((payouts ?? []).map((p) => p.user_id))];
    const { data: payoutProfiles } = await supabase
      .from("profile_usernames")
      .select("id,username")
      .in("id", payoutUserIds);

    const payoutNames = new Map(
      (payoutProfiles ?? []).map((p) => [p.id, p.username as string]),
    );

    for (const p of payouts ?? []) {
      const tid = p.user_team_id as string;
      payoutByTeamId[tid] = Number(p.amount_inr);
      payoutRows.push({
        rank: p.rank as number,
        username: payoutNames.get(p.user_id as string) ?? "Player",
        amount: Number(p.amount_inr),
        userTeamId: tid,
      });
    }
  }

  const matchSubtitle =
    matchRow?.team_a && matchRow?.team_b
      ? `${matchRow.team_a} vs ${matchRow.team_b}`
      : (matchRow?.name ?? "Match");
  const contestTitle =
    contest.name?.trim() ||
    (matchRow ? `Contest · ${matchSubtitle}` : "Contest");

  const squadHref = `/matches/${contest.match_id}/contests/${contestId}/squad`;

  const matchCard: HomeMatchCardModel = {
    id: matchId,
    name: String(matchRow?.name ?? "Match"),
    start_time: String(matchRow?.start_time ?? new Date(0).toISOString()),
    status: String(matchRow?.status ?? "upcoming"),
    tournament_name: matchRow?.tournament_name ?? null,
    team_a: matchRow?.team_a ?? null,
    team_b: matchRow?.team_b ?? null,
    team_a_logo_url: matchRow?.team_a_logo_url ?? null,
    team_b_logo_url: matchRow?.team_b_logo_url ?? null,
    max_prize_pool: Number(contest.prize_pool ?? 0),
    live_snapshot: matchRow?.live_snapshot,
    fixture_scoreboard_raw: matchRow?.fixture_scoreboard_raw,
    sm_fixture_status: matchRow?.sm_fixture_status as string | null,
    entry_fee: Number(contest.entry_fee ?? 0),
  };

  return (
    <ContestDashboard
      contestId={contestId}
      contestTitle={contestTitle}
      entryFee={Number(contest.entry_fee ?? 0)}
      prizePool={Number(contest.prize_pool ?? 0)}
      maxParticipants={Number(contest.max_participants ?? 0)}
      winnerCount={Number(contest.winner_count ?? 1)}
      prizeSlabs={prizeSlabs}
      prizeBreakupJson={contest.prize_breakup}
      prizesSettled={prizesSettled}
      payoutByTeamId={payoutByTeamId}
      payoutRows={payoutRows}
      liveSnapshot={liveSnapshot}
      matchCard={matchCard}
      initialRows={initialRows}
      currentUserId={user?.id ?? null}
      userHasTeamInContest={userHasTeamInContest}
      myStandings={myStandings}
      squadHref={squadHref}
      pointsUpdatedAt={pointsUpdatedAt}
    />
  );
}
