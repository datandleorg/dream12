import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  MyContestsClient,
  type MyContestListRow,
} from "@/components/my-contests-client";
import { contestTeamBuildPath } from "@/lib/team-flow-data";
import { cn } from "@/lib/utils";

const START_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function formatStartUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return `${START_LABEL.format(new Date(t))} UTC`;
}

type ContestNested = {
  id: string;
  name: string | null;
  match_id: number;
  entry_fee: number;
  prize_pool: number;
  prizes_settled_at: string | null;
  matches: {
    name: string;
    status?: string | null;
    start_time?: string | null;
    tournament_name?: string | null;
    team_a?: string | null;
    team_b?: string | null;
  } | null;
} | null;

function buildRankByContestId(
  allTeams: { contest_id: string; user_id: string; total_points: number }[],
  viewerId: string,
): Map<string, number> {
  const byContest = new Map<string, { user_id: string; total_points: number }[]>();
  for (const r of allTeams) {
    const cid = r.contest_id;
    const arr = byContest.get(cid) ?? [];
    arr.push({
      user_id: r.user_id,
      total_points: Number(r.total_points),
    });
    byContest.set(cid, arr);
  }
  const rankByContest = new Map<string, number>();
  for (const [cid, arr] of byContest) {
    arr.sort((a, b) => {
      const dp = b.total_points - a.total_points;
      if (dp !== 0) return dp;
      return a.user_id.localeCompare(b.user_id);
    });
    const idx = arr.findIndex((x) => x.user_id === viewerId);
    if (idx >= 0) rankByContest.set(cid, idx + 1);
  }
  return rankByContest;
}

export default async function MyContestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: teams } = await supabase
    .from("user_teams")
    .select(
      `
      id,
      total_points,
      contest_id,
      captain_id,
      vice_captain_id,
      contests (
        id,
        name,
        match_id,
        entry_fee,
        prize_pool,
        prizes_settled_at,
        matches (
          name,
          status,
          start_time,
          tournament_name,
          team_a,
          team_b
        )
      )
    `,
    )
    .eq("user_id", user.id);

  const contestIds = [
    ...new Set(
      (teams ?? [])
        .map((t) => t.contest_id as string)
        .filter(Boolean),
    ),
  ];

  let rankByContest = new Map<string, number>();
  const payoutByUserTeam = new Map<string, number>();

  if (contestIds.length > 0) {
    const { data: allInContests } = await supabase
      .from("user_teams")
      .select("contest_id, user_id, total_points")
      .in("contest_id", contestIds);

    rankByContest = buildRankByContestId(allInContests ?? [], user.id);

    const { data: payouts } = await supabase
      .from("contest_payouts")
      .select("user_team_id, amount_inr")
      .eq("user_id", user.id)
      .in("contest_id", contestIds);

    for (const p of payouts ?? []) {
      const tid = p.user_team_id as string;
      payoutByUserTeam.set(tid, Number(p.amount_inr));
    }
  }

  const teamIds = (teams ?? []).map((t) => t.id as string);
  const rosterCountByTeamId = new Map<string, number>();
  if (teamIds.length) {
    const { data: rosterRows } = await supabase
      .from("team_roster")
      .select("team_id")
      .in("team_id", teamIds);
    for (const rr of rosterRows ?? []) {
      const tid = rr.team_id as string;
      rosterCountByTeamId.set(tid, (rosterCountByTeamId.get(tid) ?? 0) + 1);
    }
  }

  const rows: MyContestListRow[] = (teams ?? [])
    .map((t) => {
      const c = t.contests as unknown as ContestNested;
      if (!c?.id) return null;
      const m = c.matches;
      const matchName = m?.name ?? "Match";
      const teamA = m?.team_a ?? null;
      const teamB = m?.team_b ?? null;
      const matchVersus =
        teamA && teamB ? `${teamA} vs ${teamB}` : matchName;
      const matchStatus = String(m?.status ?? "").trim() || "upcoming";
      const matchStatusKey = matchStatus.toLowerCase();
      const canEditTeam = matchStatusKey === "upcoming";
      const prizesSettled = c.prizes_settled_at != null && c.prizes_settled_at !== "";
      const userTeamId = t.id as string;
      const rank = rankByContest.get(c.id) ?? 0;
      const amountWonInr = prizesSettled
        ? (payoutByUserTeam.get(userTeamId) ?? 0)
        : null;

      const row: MyContestListRow = {
        userTeamId,
        contestId: c.id,
        contestTitle: c.name?.trim() || `Contest · ${matchName}`,
        matchId: Number(c.match_id),
        matchVersus,
        startTimeLabel: formatStartUtc(m?.start_time ?? undefined),
        matchStatus,
        tournamentName: m?.tournament_name ?? null,
        totalPoints: Number(t.total_points),
        prizePool: Number(c.prize_pool ?? 0),
        entryFee: Number(c.entry_fee ?? 0),
        prizesSettled,
        rank,
        amountWonInr,
        canEditTeam,
        teamFlowHref: contestTeamBuildPath(
          Number(c.match_id),
          c.id,
          rosterCountByTeamId.get(userTeamId) ?? 0,
          (t.captain_id as string) ?? null,
          (t.vice_captain_id as string) ?? null,
        ),
      };
      return row;
    })
    .filter((x): x is MyContestListRow => x != null);

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">My contests</h1>
        <Link
          href="/leaderboard"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "tap-app min-h-9 shrink-0",
          )}
        >
          Season leaderboard
        </Link>
      </div>
      {!teams?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No teams yet</CardTitle>
            <CardDescription>
              Open a match, join a contest, and build your XI.
            </CardDescription>
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "default" }),
                "mt-4 inline-flex min-h-11 w-full items-center justify-center",
              )}
            >
              Browse matches
            </Link>
          </CardHeader>
        </Card>
      ) : (
        <MyContestsClient rows={rows} />
      )}
    </div>
  );
}
