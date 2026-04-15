import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Row } from "@/components/leaderboard-realtime";
import type { ContestChatterMessage } from "@/components/contest-chatter-panel";
import {
  ContestDashboard,
  type ContestEntryTeamSummary,
  type ContestPayoutDisplayRow,
  type ContestPrizeSlab,
} from "@/components/contest-dashboard";
import type { HomeMatchCardModel } from "@/components/home-upcoming-card";
import {
  buildLiveSnapshotFromFixture,
  parseLiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";
import {
  isContestVisibleToUser,
  isCreatorDraftContest,
} from "@/lib/contest-visibility";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { contestTeamBuildPath } from "@/lib/team-flow-data";
import { mapSavedTemplateIdsToSlots } from "@/lib/contest-entry-saved-team";
import {
  compareLeaderboardRows,
  contestTieMetasForSortedLeaderboard,
} from "@/lib/contest-prize";

export default async function ContestLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ contestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contestId } = await params;
  const sp = searchParams ? await searchParams : {};
  const chatterParam = sp.chatter;
  const openChatterTab =
    chatterParam === "1" ||
    chatterParam === "true" ||
    (Array.isArray(chatterParam) && chatterParam.some((x) => x === "1" || x === "true"));
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
  const contestVisibility = {
    created_by: contest.created_by as string | null,
    creator_joined_at: contest.creator_joined_at as string | null,
  };
  if (!isContestVisibleToUser(contestVisibility, user?.id)) {
    notFound();
  }
  const invitePublic = isContestVisibleToUser(contestVisibility, null);

  let userHasTeamInContest = false;
  const matchId = Number(contest.match_id);
  /** Dream11-style: choose a saved match team or build new until a contest row exists. */
  let squadHref = `/matches/${matchId}/contests/${contestId}/pick-team`;
  let myEntryTeamSummary: ContestEntryTeamSummary | null = null;
  let myTeamRow: {
    id: string;
    captain_id: unknown;
    vice_captain_id: unknown;
    source_saved_match_team_id: unknown;
    entry_fee_paid_at: string | null;
  } | null = null;
  if (user) {
    const { data: ut } = await supabase
      .from("user_teams")
      .select("id,captain_id,vice_captain_id,source_saved_match_team_id,entry_fee_paid_at")
      .eq("contest_id", contestId)
      .eq("user_id", user.id)
      .maybeSingle();
    myTeamRow = ut
      ? {
          id: ut.id as string,
          captain_id: ut.captain_id,
          vice_captain_id: ut.vice_captain_id,
          source_saved_match_team_id: ut.source_saved_match_team_id,
          entry_fee_paid_at: (ut.entry_fee_paid_at as string | null) ?? null,
        }
      : null;
    userHasTeamInContest = Boolean(myTeamRow);
    if (myTeamRow?.id) {
      const { count } = await supabase
        .from("team_roster")
        .select("*", { count: "exact", head: true })
        .eq("team_id", myTeamRow.id);
      squadHref = contestTeamBuildPath(
        matchId,
        contestId,
        count ?? 0,
        (myTeamRow.captain_id as string) ?? null,
        (myTeamRow.vice_captain_id as string) ?? null,
        { startAtSquad: true },
      );
      const src = myTeamRow.source_saved_match_team_id as string | null;
      if (src) {
        const slotMap = await mapSavedTemplateIdsToSlots(supabase, user.id, [src]);
        const slot = slotMap.get(src);
        if (slot != null) {
          myEntryTeamSummary = {
            kind: "saved",
            matchId,
            slot,
            savedTeamId: src,
          };
        } else {
          myEntryTeamSummary = { kind: "contest_only" };
        }
      } else {
        myEntryTeamSummary = { kind: "contest_only" };
      }
    }
  }

  const userHasChatterAccess = Boolean(user && myTeamRow && myTeamRow.entry_fee_paid_at != null);

  let initialChatterMessages: ContestChatterMessage[] = [];
  if (userHasChatterAccess) {
    const { data: chatterRows } = await supabase
      .from("contest_chatter_messages")
      .select(
        "id,contest_id,user_id,kind,body,audio_url,audio_duration_seconds,created_at",
      )
      .eq("contest_id", contestId)
      .order("created_at", { ascending: true })
      .limit(200);

    const chatterUserIds = [...new Set((chatterRows ?? []).map((r) => r.user_id as string))];
    const { data: chatterProfiles } =
      chatterUserIds.length > 0
        ? await supabase
            .from("profile_usernames")
            .select("id,username,avatar_url")
            .in("id", chatterUserIds)
        : { data: [] as { id: string; username: string; avatar_url: string | null }[] };

    const chatterProfileByUser = new Map(
      (chatterProfiles ?? []).map((p) => [
        p.id as string,
        {
          username: p.username as string,
          avatar_url: (p.avatar_url as string | null) ?? null,
        },
      ]),
    );

    initialChatterMessages = (chatterRows ?? []).map((r) => {
      const pr = chatterProfileByUser.get(r.user_id as string);
      return {
        id: r.id as string,
        contest_id: r.contest_id as string,
        user_id: r.user_id as string,
        kind: r.kind as "text" | "voice",
        body: (r.body as string | null) ?? null,
        audio_url: (r.audio_url as string | null) ?? null,
        audio_duration_seconds:
          r.audio_duration_seconds != null ? Number(r.audio_duration_seconds) : null,
        created_at: r.created_at as string,
        username: pr?.username ?? null,
        avatar_url: pr?.avatar_url ?? null,
      };
    });
  }

  const { data: matchRow } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b,team_a_logo_url,team_b_logo_url,live_snapshot,live_snapshot_at,sm_fixture_status,sm_fixture_note,fixture_scoreboard_raw,localteam_id,visitorteam_id,toss_winner_team_id,toss_decision",
    )
    .eq("id", matchId)
    .maybeSingle();

  const liveSnapshot =
    parseLiveSnapshot(matchRow?.live_snapshot) ?? buildLiveSnapshotFromFixture(null);
  const pointsUpdatedAt = matchRow?.live_snapshot_at ?? null;

  const matchStartIso = String(matchRow?.start_time ?? new Date(0).toISOString());
  const statusKey = String(matchRow?.status ?? "upcoming").toLowerCase();
  const matchJoinBlocked =
    statusKey === "completed" || statusKey === "in_review";
  const rosterLocked = isTeamEditLocked(matchRow?.status);
  const isCreatorDraft = isCreatorDraftContest(contestVisibility, user?.id);

  const { data: teams } = await supabase
    .from("user_teams")
    .select("id,user_id,total_points,created_at")
    .eq("contest_id", contestId)
    .not("entry_fee_paid_at", "is", null);

  const userIds = [...new Set((teams ?? []).map((t) => t.user_id))];
  const { data: profiles } = await supabase
    .from("profile_usernames")
    .select("id,username,avatar_url")
    .in("id", userIds);

  const profileByUser = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        username: p.username as string,
        avatar_url: (p.avatar_url as string | null) ?? null,
      },
    ]),
  );

  const initialRows: Row[] = (teams ?? []).map((t) => {
    const uid = t.user_id as string;
    const pr = profileByUser.get(uid);
    return {
      id: t.id as string,
      user_id: uid,
      total_points: Number(t.total_points),
      username: pr?.username ?? null,
      avatar_url: pr?.avatar_url ?? null,
      created_at: (t.created_at as string | null | undefined) ?? null,
    };
  });

  const sortedForRank = [...initialRows].sort(compareLeaderboardRows);
  const rankMetas = contestTieMetasForSortedLeaderboard(sortedForRank);
  const myIndex =
    user && userHasTeamInContest
      ? sortedForRank.findIndex((r) => r.user_id === user.id)
      : -1;
  const myStandings =
    myIndex >= 0
      ? {
          rank: rankMetas[myIndex]!.competitionRank,
          points: sortedForRank[myIndex]!.total_points,
        }
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
      .order("rank", { ascending: true })
      .order("amount_inr", { ascending: false })
      .order("user_team_id", { ascending: true });

    const payoutUserIds = [...new Set((payouts ?? []).map((p) => p.user_id))];
    const { data: payoutProfiles } = await supabase
      .from("profile_usernames")
      .select("id,username,avatar_url")
      .in("id", payoutUserIds);

    const payoutProfileByUser = new Map(
      (payoutProfiles ?? []).map((p) => [
        p.id as string,
        {
          username: p.username as string,
          avatar_url: (p.avatar_url as string | null) ?? null,
        },
      ]),
    );

    for (const p of payouts ?? []) {
      const tid = p.user_team_id as string;
      const uid = p.user_id as string;
      const pr = payoutProfileByUser.get(uid);
      payoutByTeamId[tid] = Number(p.amount_inr);
      payoutRows.push({
        rank: p.rank as number,
        username: pr?.username ?? "Player",
        avatar_url: pr?.avatar_url ?? null,
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
    localteam_id:
      matchRow?.localteam_id != null ? Number(matchRow.localteam_id) : null,
    visitorteam_id:
      matchRow?.visitorteam_id != null
        ? Number(matchRow.visitorteam_id)
        : null,
    toss_winner_team_id:
      matchRow?.toss_winner_team_id != null
        ? Number(matchRow.toss_winner_team_id)
        : null,
    toss_decision:
      typeof matchRow?.toss_decision === "string"
        ? matchRow.toss_decision
        : null,
  };

  return (
    <ContestDashboard
      contestId={contestId}
      contestTitle={contestTitle}
      invitePublic={invitePublic}
      matchJoinBlocked={matchJoinBlocked}
      rosterLocked={rosterLocked}
      isCreatorDraft={isCreatorDraft}
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
      myEntryTeamSummary={myEntryTeamSummary}
      userHasChatterAccess={userHasChatterAccess}
      initialChatterMessages={initialChatterMessages}
      openChatterTabByDefault={openChatterTab && userHasChatterAccess}
    />
  );
}
