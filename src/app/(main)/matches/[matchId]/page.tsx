import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { JoinContestButton } from "@/components/join-contest-button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  isContestVisibleToUser,
  isCreatorDraftContest,
} from "@/lib/contest-visibility";
import { cn } from "@/lib/utils";
import { getLineupConflictCountsByContest } from "@/lib/lineup-conflict-queries";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { MatchStartCountdown } from "@/components/match-start-countdown";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";

function venueStageLabels(
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

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  if (isSportmonksFixtureId(matchId)) {
    await refreshMatchFromSportmonks(matchId);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: matchRow } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b,match_format,venue_id,stage_id",
    )
    .eq("id", matchId)
    .single();

  if (!matchRow) notFound();

  let venueRow: { name: string | null; city: string | null } | null = null;
  let stageRow: { name: string | null; code: string | null } | null = null;
  if (matchRow.venue_id != null) {
    const { data: v } = await supabase
      .from("sm_venues")
      .select("name,city")
      .eq("id", matchRow.venue_id)
      .maybeSingle();
    venueRow = v;
  }
  if (matchRow.stage_id != null) {
    const { data: s } = await supabase
      .from("sm_stages")
      .select("name,code")
      .eq("id", matchRow.stage_id)
      .maybeSingle();
    stageRow = s;
  }

  const { venueLine, stageLine } = venueStageLabels(venueRow, stageRow);

  const match = {
    ...matchRow,
    match_format: matchRow.match_format ?? null,
  };

  let balance = 0;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", user.id)
      .single();
    balance = Number(profile?.wallet_balance ?? 0);
  }

  const { data: contestsRaw } = await supabase
    .from("contests")
    .select(
      "id,name,entry_fee,prize_pool,max_participants,created_by,creator_joined_at",
    )
    .eq("match_id", matchId);

  const contests = (contestsRaw ?? []).filter((c) =>
    isContestVisibleToUser(
      {
        created_by: c.created_by as string | null,
        creator_joined_at: c.creator_joined_at as string | null,
      },
      user?.id,
    ),
  );

  const contestIds = contests.map((c) => c.id);
  let lineupConflictsByContest = new Map<string, number>();
  if (user && contestIds.length) {
    lineupConflictsByContest = await getLineupConflictCountsByContest(
      matchId,
      user.id,
      contestIds,
    );
  }

  const filledByContest = new Map<string, number>();
  if (contestIds.length) {
    const { data: teamRows } = await supabase
      .from("user_teams")
      .select("contest_id")
      .in("contest_id", contestIds);
    for (const r of teamRows ?? []) {
      const id = r.contest_id as string;
      filledByContest.set(id, (filledByContest.get(id) ?? 0) + 1);
    }
  }

  const subtitle =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  const rosterLocked = isTeamEditLocked(match.start_time);

  return (
    <div className="space-y-4 py-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            {match.tournament_name ? (
              <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
                {match.tournament_name}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold leading-tight">{subtitle}</h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <MatchStatusBadge status={String(match.status)} />
            {match.match_format ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {match.match_format}
              </Badge>
            ) : null}
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {new Date(match.start_time).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>Starts in</span>
          <MatchStartCountdown
            startIso={match.start_time}
            className="font-medium text-foreground"
          />
        </p>
        {venueLine ? (
          <p className="text-muted-foreground mt-1 text-sm">{venueLine}</p>
        ) : null}
        {stageLine ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{stageLine}</p>
        ) : null}
        {rosterLocked ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Team picks are locked (1 minute before start). You can still open contests if you
            already joined.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">Contests</h2>
        {user ? (
          rosterLocked ? (
            <span
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center opacity-60 sm:w-auto",
              )}
              title="Team lock is on — new contests cannot be created this close to start."
            >
              Create contest (locked)
            </span>
          ) : (
            <Link
              href={`/matches/${matchId}/create-contest`}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "inline-flex min-h-11 w-full items-center justify-center sm:w-auto",
              )}
            >
              Create contest
            </Link>
          )
        ) : null}
      </div>
      {!contests?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No contests</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {contests.map((c) => {
            const filled = filledByContest.get(c.id) ?? 0;
            const lineupConflict = lineupConflictsByContest.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                      <span>{c.name?.trim() || "Contest"}</span>
                      {lineupConflict > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/60 bg-amber-500/10 font-semibold text-amber-950 dark:text-amber-100"
                        >
                          {lineupConflict === 1
                            ? "1 not in XI"
                            : `${lineupConflict} not in XI`}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      Entry ₹{Number(c.entry_fee)} · Pool ₹
                      {Number(c.prize_pool)} · {filled}/
                      {c.max_participants} joined
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex flex-col gap-2 sm:flex-row">
                    {user ? (
                      isCreatorDraftContest(
                        {
                          created_by: c.created_by as string | null,
                          creator_joined_at: c.creator_joined_at as string | null,
                        },
                        user.id,
                      ) ? (
                        rosterLocked ? (
                          <span
                            className={cn(
                              buttonVariants({ variant: "default" }),
                              "inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center opacity-60 sm:flex-1",
                            )}
                            title="Team lock is on — you cannot finish contest setup now."
                          >
                            Continue setup (locked)
                          </span>
                        ) : (
                          <Link
                            href={`/matches/${matchId}/contests/${c.id}/squad`}
                            className={cn(
                              buttonVariants({ variant: "default" }),
                              "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                            )}
                          >
                            Continue setup
                          </Link>
                        )
                      ) : (
                        <JoinContestButton
                          matchId={matchId}
                          contestId={c.id}
                          entryFee={Number(c.entry_fee)}
                          balance={balance}
                          label="Join"
                          disabled={rosterLocked}
                          disabledReason="Team lock is on — you cannot join new contests this close to start."
                        />
                      )
                    ) : (
                      <Link
                        href={`/login?next=${encodeURIComponent(`/matches/${matchId}`)}`}
                        className={cn(
                          buttonVariants({ variant: "default" }),
                          "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                        )}
                      >
                        Sign in to join
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
