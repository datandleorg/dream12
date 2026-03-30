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
import { MatchDetailLiveSection } from "@/components/match-detail-live-section";
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
      "id,name,start_time,status,tournament_name,team_a,team_b,match_format,venue_id,stage_id,live_snapshot,live_snapshot_at,sm_fixture_status,fixture_scoreboard_raw",
    )
    .eq("id", matchId)
    .single();

  if (!matchRow) notFound();

  const statusKey = String(matchRow.status).toLowerCase();
  const isUpcoming = statusKey === "upcoming";
  const isCompleted = statusKey === "completed" || statusKey === "in_review";

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
  const joinedContestIds = new Set<string>();
  if (contestIds.length) {
    const { data: teamRows } = await supabase
      .from("user_teams")
      .select("contest_id,user_id")
      .in("contest_id", contestIds);
    for (const r of teamRows ?? []) {
      const id = r.contest_id as string;
      filledByContest.set(id, (filledByContest.get(id) ?? 0) + 1);
      if (user && r.user_id === user.id) {
        joinedContestIds.add(id);
      }
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
        <MatchDetailLiveSection
          matchId={matchId}
          title={subtitle}
          tournamentName={match.tournament_name}
          startIso={match.start_time}
          matchFormat={match.match_format}
          live_snapshot={matchRow.live_snapshot}
          live_snapshot_at={matchRow.live_snapshot_at as string | null}
          status={String(matchRow.status)}
          sm_fixture_status={matchRow.sm_fixture_status as string | null}
          fixture_scoreboard_raw={matchRow.fixture_scoreboard_raw}
        />
        {venueLine ? (
          <p className="text-muted-foreground mt-1 text-sm">{venueLine}</p>
        ) : null}
        {stageLine ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{stageLine}</p>
        ) : null}
        {isUpcoming && rosterLocked ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Team picks are locked (1 minute before start). You can still open contests if you
            already joined.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h2 className="text-lg font-medium">Contests</h2>
          <Link
            href={`/matches/${matchId}/live`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex min-h-10 w-full items-center justify-center sm:w-auto",
            )}
          >
            Live score
          </Link>
        </div>
        {user && isUpcoming ? (
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
                  <CardFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link
                      href={`/contests/${c.id}`}
                      className={cn(
                        buttonVariants({ variant: "default" }),
                        "inline-flex min-h-11 w-full items-center justify-center sm:min-w-[10rem] sm:flex-1",
                      )}
                    >
                      Leaderboard
                    </Link>
                    {!isCompleted ? (
                      user ? (
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
                                buttonVariants({ variant: "secondary" }),
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
                                buttonVariants({ variant: "secondary" }),
                                "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                              )}
                            >
                              Continue setup
                            </Link>
                          )
                        ) : joinedContestIds.has(c.id) ? (
                          <Link
                            href={`/matches/${matchId}/contests/${c.id}/squad`}
                            className={cn(
                              buttonVariants({ variant: "secondary" }),
                              "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                            )}
                          >
                            My team
                          </Link>
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
                            buttonVariants({ variant: "secondary" }),
                            "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                          )}
                        >
                          Sign in to join
                        </Link>
                      )
                    ) : null}
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
