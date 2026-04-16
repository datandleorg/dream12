import Link from "next/link";
import { Plus } from "lucide-react";
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
import { JoinContestButton } from "@/components/join-contest-button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  isContestVisibleToUser,
  isCreatorDraftContest,
} from "@/lib/contest-visibility";
import { cn } from "@/lib/utils";
import { getLineupConflictCountsByContest } from "@/lib/lineup-conflict-queries";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { MatchDetailPageClient } from "@/components/match-detail-page-client";
import { MatchSavedTeamsTab } from "@/components/match-saved-teams-tab";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { venueStageLabels } from "@/lib/match-venue-stage";
import { contestTeamBuildPath } from "@/lib/team-flow-data";
import { DeleteContestButton } from "@/components/delete-contest-button";
import { mapSavedTemplateIdsToSlots } from "@/lib/contest-entry-saved-team";
import { resolveLiveSnapshotForPage } from "@/lib/sportmonks/resolve-live-snapshot";
import { listSavedMatchTeamsWithSummary } from "@/lib/saved-team-flow-data";

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
      "id,name,start_time,status,tournament_name,team_a,team_b,match_format,venue_id,stage_id,live_snapshot,live_snapshot_at,sm_fixture_status,sm_fixture_note,fixture_scoreboard_raw,localteam_id,visitorteam_id,toss_winner_team_id,toss_decision",
    )
    .eq("id", matchId)
    .single();

  if (!matchRow) notFound();

  const statusKey = String(matchRow.status).toLowerCase();
  const isUpcoming = statusKey === "upcoming";
  const isLive = statusKey === "live";
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
      "id,name,entry_fee,prize_pool,max_participants,created_by,creator_joined_at,prizes_settled_at",
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
  /** Paid / confirmed entry — Leaderboard only for these. */
  const paidEntryContestIds = new Set<string>();
  const myTeamResumeHrefByContest = new Map<string, string>();
  const myEntryTeamByContest = new Map<
    string,
    { templateId: string | null; slot: number | null }
  >();
  if (contestIds.length) {
    const { data: teamRows } = await supabase
      .from("user_teams")
      .select("contest_id,user_id,entry_fee_paid_at")
      .in("contest_id", contestIds);
    for (const r of teamRows ?? []) {
      const id = r.contest_id as string;
      if (r.entry_fee_paid_at != null) {
        filledByContest.set(id, (filledByContest.get(id) ?? 0) + 1);
      }
      if (user && r.user_id === user.id) {
        joinedContestIds.add(id);
        if (r.entry_fee_paid_at != null) {
          paidEntryContestIds.add(id);
        }
      }
    }

    if (user) {
      const { data: myRows } = await supabase
        .from("user_teams")
        .select("id,contest_id,captain_id,vice_captain_id,source_saved_match_team_id")
        .eq("user_id", user.id)
        .in("contest_id", contestIds);
      const slotByTemplateId = await mapSavedTemplateIdsToSlots(
        supabase,
        user.id,
        (myRows ?? []).map((r) => r.source_saved_match_team_id as string | null),
      );
      for (const t of myRows ?? []) {
        const cid = t.contest_id as string;
        const tid = t.source_saved_match_team_id as string | null;
        const slot = tid ? (slotByTemplateId.get(tid) ?? null) : null;
        myEntryTeamByContest.set(cid, { templateId: tid, slot });
      }
      const myTeamIds = (myRows ?? []).map((t) => t.id as string);
      if (myTeamIds.length) {
        const { data: rosterRows } = await supabase
          .from("team_roster")
          .select("team_id")
          .in("team_id", myTeamIds);
        const rosterCountByTeamId = new Map<string, number>();
        for (const rr of rosterRows ?? []) {
          const tid = rr.team_id as string;
          rosterCountByTeamId.set(tid, (rosterCountByTeamId.get(tid) ?? 0) + 1);
        }
        for (const t of myRows ?? []) {
          const tid = t.id as string;
          const cid = t.contest_id as string;
          myTeamResumeHrefByContest.set(
            cid,
            contestTeamBuildPath(
              matchId,
              cid,
              rosterCountByTeamId.get(tid) ?? 0,
              (t.captain_id as string) ?? null,
              (t.vice_captain_id as string) ?? null,
              { startAtSquad: true },
            ),
          );
        }
      }
    }
  }

  const subtitle =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  const rosterLocked = isTeamEditLocked(matchRow.status);

  const initialParsedSnapshot = await resolveLiveSnapshotForPage(matchId, {
    live_snapshot: matchRow.live_snapshot,
    live_snapshot_at: matchRow.live_snapshot_at as string | null,
  });

  const savedTeamsForTab = user
    ? await listSavedMatchTeamsWithSummary(
        matchId,
        match.team_a ?? null,
        match.team_b ?? null,
      )
    : [];

  const liveArgs = {
    matchId,
    live_snapshot: matchRow.live_snapshot,
    live_snapshot_at: matchRow.live_snapshot_at as string | null,
    status: String(matchRow.status),
    sm_fixture_status: matchRow.sm_fixture_status as string | null,
    sm_fixture_note: matchRow.sm_fixture_note as string | null,
    fixture_scoreboard_raw: matchRow.fixture_scoreboard_raw,
    initialParsedSnapshot,
    toss_winner_team_id:
      matchRow.toss_winner_team_id != null
        ? Number(matchRow.toss_winner_team_id)
        : null,
    toss_decision:
      typeof matchRow.toss_decision === "string" ? matchRow.toss_decision : null,
  };

  const contestsSlot = (
    <div className="space-y-4">
      <div className="space-y-3">
        {user ? (
          isUpcoming ? (
            <Link
              href={`/matches/${matchId}/create-contest`}
              className={cn(
                buttonVariants({ variant: "default" }),
                "inline-flex min-h-11 w-full items-center justify-center gap-1.5",
                "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
                "focus-visible:border-red-500 focus-visible:ring-red-500/40",
                "dark:bg-red-600 dark:hover:bg-red-500 dark:active:bg-red-700",
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              Create contest
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center opacity-60",
              )}
              title={
                isLive
                  ? "The match is live — new contests can’t be created."
                  : isCompleted
                    ? "This match is over — new contests can’t be created."
                    : "New contests can’t be created for this match right now."
              }
            >
              Create contest (locked)
            </span>
          )
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted-foreground shrink-0 text-[11px] font-semibold uppercase tracking-wider">
          or
        </span>
        <div className="bg-border h-px flex-1" />
      </div>
      <p className="text-muted-foreground px-1 text-center text-xs leading-snug">
        Join an existing contest from the list below — pick a card, then join or open the leaderboard if
        you&apos;re already in.
      </p>
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
            const prizesSettled = Boolean(c.prizes_settled_at);
            const canDeleteAsHost =
              Boolean(user) &&
              !prizesSettled &&
              !rosterLocked &&
              c.created_by != null &&
              c.created_by === user!.id;
            const myEntryTeam =
              user && joinedContestIds.has(c.id)
                ? myEntryTeamByContest.get(c.id)
                : undefined;
            return (
              <li key={c.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                      <span>{c.name?.trim() || "Contest"}</span>
                      {lineupConflict > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-700/50 bg-amber-100 font-semibold text-amber-950 shadow-sm dark:border-amber-400/80 dark:bg-amber-500 dark:text-neutral-950"
                        >
                          {lineupConflict === 1
                            ? "1 not in XI"
                            : `${lineupConflict} not in XI`}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      <span>
                        Entry ₹{Number(c.entry_fee)} · Pool ₹
                        {Number(c.prize_pool)} · {filled}/
                        {c.max_participants} joined
                      </span>
                      {myEntryTeam ? (
                        <span className="block text-xs">
                          <span className="text-muted-foreground">Your squad </span>
                          {myEntryTeam.slot != null && myEntryTeam.templateId ? (
                            !rosterLocked ? (
                              <Link
                                href={`/matches/${matchId}/teams/${myEntryTeam.templateId}/squad`}
                                className="font-medium text-foreground underline-offset-2 hover:underline"
                              >
                                Team {myEntryTeam.slot}
                              </Link>
                            ) : (
                              <span className="font-medium text-foreground">
                                Team {myEntryTeam.slot}
                              </span>
                            )
                          ) : (
                            <span className="font-medium text-foreground">Contest XI</span>
                          )}
                          {myEntryTeam.slot != null && myEntryTeam.templateId ? (
                            <span className="text-muted-foreground"> · My teams</span>
                          ) : null}
                        </span>
                      ) : null}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {user && paidEntryContestIds.has(c.id) ? (
                      <Link
                        href={`/contests/${c.id}?returnTo=${encodeURIComponent(`/matches/${matchId}`)}`}
                        className={cn(
                          buttonVariants({ variant: "default" }),
                          "inline-flex min-h-11 w-full items-center justify-center sm:min-w-[10rem] sm:flex-1",
                        )}
                      >
                        Leaderboard
                      </Link>
                    ) : null}
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
                              href={
                                myTeamResumeHrefByContest.get(c.id) ??
                                `/matches/${matchId}/contests/${c.id}/pick-team`
                              }
                              className={cn(
                                buttonVariants({ variant: "secondary" }),
                                "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                              )}
                            >
                              Continue setup
                            </Link>
                          )
                        ) : joinedContestIds.has(c.id) ? (
                          !isLive ? (
                            <Link
                              href={`/matches/${matchId}/contests/${c.id}/pick-team`}
                              className={cn(
                                buttonVariants({ variant: "secondary" }),
                                "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                              )}
                            >
                              Edit team
                            </Link>
                          ) : null
                        ) : (
                          <JoinContestButton
                            matchId={matchId}
                            contestId={c.id}
                            entryFee={Number(c.entry_fee)}
                            balance={balance}
                            label="Join"
                            disabled={rosterLocked}
                            disabledReason="Team lock is on — you cannot join new contests after the match goes live."
                          />
                        )
                      ) : (
                        <Link
                          href={`/login?next=${encodeURIComponent(`/matches/${matchId}`)}`}
                          className={cn(
                            buttonVariants({ variant: "default" }),
                            "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                            "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
                            "focus-visible:border-emerald-500 focus-visible:ring-emerald-500/40",
                          )}
                        >
                          Sign in to join
                        </Link>
                      )
                    ) : null}
                    {canDeleteAsHost ? (
                      <DeleteContestButton
                        contestId={c.id}
                        contestTitle={c.name?.trim() || "Contest"}
                        entryFee={Number(c.entry_fee)}
                        matchId={matchId}
                        paidParticipantsCount={filled}
                        fullWidth
                        className="sm:flex-1"
                      />
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

  const teamsSlot = user ? (
    <MatchSavedTeamsTab
      variant="tab"
      matchId={matchId}
      teamA={match.team_a ?? null}
      teamB={match.team_b ?? null}
      title={subtitle}
      locked={rosterLocked}
      teams={savedTeamsForTab}
    />
  ) : (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm leading-snug">
        Use a saved team below, or create a new one after you sign in.
      </p>
      <Link
        href={`/login?next=${encodeURIComponent(`/matches/${matchId}`)}`}
        className={cn(
          buttonVariants({ variant: "default" }),
          "inline-flex min-h-11 w-full items-center justify-center",
        )}
      >
        Sign in
      </Link>
    </div>
  );

  return (
    <MatchDetailPageClient
      liveArgs={liveArgs}
      title={subtitle}
      tournamentName={match.tournament_name}
      startIso={match.start_time}
      matchFormat={match.match_format}
      teamA={match.team_a ?? null}
      teamB={match.team_b ?? null}
      localteamId={
        matchRow.localteam_id != null ? Number(matchRow.localteam_id) : null
      }
      visitorteamId={
        matchRow.visitorteam_id != null ? Number(matchRow.visitorteam_id) : null
      }
      venueLine={venueLine}
      stageLine={stageLine}
      contestsSlot={contestsSlot}
      teamsSlot={teamsSlot}
    />
  );
}
