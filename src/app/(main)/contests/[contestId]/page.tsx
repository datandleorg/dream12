import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardPullRefresh } from "@/components/leaderboard-pull-refresh";
import { ContestMatchInfo } from "@/components/contest-match-info";
import type { Row } from "@/components/leaderboard-realtime";
import { parseLiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { isContestVisibleToUser } from "@/lib/contest-visibility";

function venueStageLines(
  venue: { name?: string | null; city?: string | null } | null,
  stage: { name?: string | null; code?: string | null } | null,
): { venueLine: string | null; stageLine: string | null } {
  const vname = venue?.name?.trim();
  const vcity = venue?.city?.trim();
  const venueLine =
    vname && vcity ? `${vname}, ${vcity}` : vname ?? vcity ?? null;
  const sname = stage?.name?.trim();
  const scode = stage?.code?.trim();
  const stageLine =
    sname && scode ? `${sname} · ${scode}` : sname ?? scode ?? null;
  return { venueLine, stageLine };
}

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
    .select("id,name,match_id,created_by,creator_joined_at")
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
      "id,name,start_time,status,tournament_name,team_a,team_b,match_format,venue_id,stage_id,live_snapshot,sm_fixture_status",
    )
    .eq("id", matchId)
    .maybeSingle();

  const liveSnapshot = parseLiveSnapshot(matchRow?.live_snapshot);

  let venueRow: { name: string | null; city: string | null } | null = null;
  let stageRow: { name: string | null; code: string | null } | null = null;
  if (matchRow?.venue_id != null) {
    const { data: v } = await supabase
      .from("sm_venues")
      .select("name,city")
      .eq("id", matchRow.venue_id)
      .maybeSingle();
    venueRow = v;
  }
  if (matchRow?.stage_id != null) {
    const { data: s } = await supabase
      .from("sm_stages")
      .select("name,code")
      .eq("id", matchRow.stage_id)
      .maybeSingle();
    stageRow = s;
  }
  const { venueLine, stageLine } = venueStageLines(venueRow, stageRow);

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

  const matchSubtitle =
    matchRow?.team_a && matchRow?.team_b
      ? `${matchRow.team_a} vs ${matchRow.team_b}`
      : (matchRow?.name ?? "Match");
  const title =
    contest.name?.trim() ||
    (matchRow ? `Contest · ${matchSubtitle}` : "Contest");

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">Live leaderboard</p>
        </div>
        {userHasTeamInContest ? (
          <Link
            href={`/matches/${contest.match_id}/contests/${contestId}/squad`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex min-h-11 shrink-0 items-center justify-center",
            )}
          >
            My team
          </Link>
        ) : null}
      </div>

      {matchRow ? (
        <ContestMatchInfo
          matchId={matchId}
          startIso={matchRow.start_time}
          status={String(matchRow.status)}
          tournamentName={matchRow.tournament_name}
          subtitle={matchSubtitle}
          matchFormat={matchRow.match_format ?? null}
          venueLine={venueLine}
          stageLine={stageLine}
          liveSnapshot={liveSnapshot}
          smFixtureStatus={matchRow.sm_fixture_status as string | null}
        />
      ) : null}

      {!initialRows.length ? (
        <p className="text-muted-foreground text-sm">No teams yet.</p>
      ) : (
        <LeaderboardPullRefresh contestId={contestId} initialRows={initialRows} />
      )}
    </div>
  );
}
