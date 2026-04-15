"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, UserPlus } from "lucide-react";
import { LeaderboardRealtime, type Row } from "@/components/leaderboard-realtime";
import { ContestTeamPreviewSheet } from "@/components/contest-team-preview-sheet";
import { UserAvatar } from "@/components/user-avatar";
import {
  HomeUpcomingCard,
  type HomeMatchCardModel,
} from "@/components/home-upcoming-card";
import { MatchLiveScoreTabs } from "@/components/match-live-score-tabs";
import { MatchTossLines } from "@/components/match-toss-lines";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  ContestChatterPanel,
  type ContestChatterMessage,
} from "@/components/contest-chatter-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isMatchStatusOpenForContestChatter } from "@/lib/contest-chatter/constants";
import { useMatchLiveRow } from "@/lib/hooks/use-match-live-row";
import type { LiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
import {
  buildContestWhatsAppInviteMessage,
  buildWhatsAppShareUrl,
  matchLabelFromMatchCard,
} from "@/lib/share/contest-whatsapp-invite";
import { cn } from "@/lib/utils";

export type ContestPayoutDisplayRow = {
  rank: number;
  username: string;
  avatar_url: string | null;
  amount: number;
  userTeamId: string;
};

export type ContestPrizeSlab = {
  rank_from: number;
  rank_to: number;
  amount: number;
};

export type ContestEntryTeamSummary =
  | { kind: "saved"; matchId: number; slot: number; savedTeamId: string }
  | { kind: "contest_only" };

type DashboardTab =
  | "winnings"
  | "leaderboard"
  | "commentary"
  | "scorecard"
  | "stats"
  | "chatter";

export function ContestDashboard({
  contestId,
  contestTitle,
  invitePublic,
  matchJoinBlocked,
  rosterLocked,
  isCreatorDraft,
  entryFee,
  prizePool,
  maxParticipants,
  winnerCount,
  prizeSlabs,
  prizeBreakupJson,
  prizesSettled,
  payoutByTeamId,
  payoutRows,
  liveSnapshot,
  matchCard,
  initialRows,
  currentUserId,
  userHasTeamInContest,
  myStandings,
  squadHref,
  pointsUpdatedAt,
  myEntryTeamSummary,
  userHasChatterAccess = false,
  initialChatterMessages = [],
  openChatterTabByDefault = false,
}: {
  contestId: string;
  contestTitle: string;
  /** When false, contest URL is not yet visible to guests (creator draft). */
  invitePublic: boolean;
  /** Match completed or in_review — no join / continue setup. */
  matchJoinBlocked: boolean;
  rosterLocked: boolean;
  isCreatorDraft: boolean;
  entryFee: number;
  prizePool: number;
  maxParticipants: number;
  winnerCount: number;
  prizeSlabs: ContestPrizeSlab[];
  prizeBreakupJson: unknown;
  prizesSettled: boolean;
  payoutByTeamId: Record<string, number>;
  payoutRows: ContestPayoutDisplayRow[];
  liveSnapshot: LiveSnapshot;
  matchCard: HomeMatchCardModel;
  initialRows: Row[];
  currentUserId: string | null;
  userHasTeamInContest: boolean;
  myStandings: { rank: number; points: number } | null;
  squadHref: string;
  pointsUpdatedAt: string | null;
  myEntryTeamSummary: ContestEntryTeamSummary | null;
  /** Paid entry — required for contest chatter read/post (when match allows posting). */
  userHasChatterAccess?: boolean;
  initialChatterMessages?: ContestChatterMessage[];
  /** From `?chatter=1` when user has chatter access. */
  openChatterTabByDefault?: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<{
    teamId: string;
    username: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pageRefreshNonce, setPageRefreshNonce] = useState(0);
  const [pageRefreshing, setPageRefreshing] = useState(false);
  const [whatsappShareHref, setWhatsappShareHref] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>(() =>
    openChatterTabByDefault && userHasChatterAccess ? "chatter" : "leaderboard",
  );

  const refreshPage = useCallback(() => {
    setPageRefreshing(true);
    router.refresh();
    window.setTimeout(() => {
      setPageRefreshNonce((n) => n + 1);
      setPageRefreshing(false);
    }, 750);
  }, [router]);

  const live = useMatchLiveRow({
    matchId: matchCard.id,
    live_snapshot: matchCard.live_snapshot,
    live_snapshot_at: pointsUpdatedAt,
    status: matchCard.status,
    sm_fixture_status: matchCard.sm_fixture_status ?? null,
    sm_fixture_note: matchCard.sm_fixture_note ?? null,
    fixture_scoreboard_raw: matchCard.fixture_scoreboard_raw,
    initialParsedSnapshot: liveSnapshot,
    toss_winner_team_id: matchCard.toss_winner_team_id ?? null,
    toss_decision: matchCard.toss_decision ?? null,
  });

  const matchCardLive = useMemo(
    () => ({
      ...matchCard,
      status: live.status,
      live_snapshot: live.snapshot as unknown,
      sm_fixture_status: live.smFixtureStatus,
      sm_fixture_note: live.smFixtureNote,
      fixture_scoreboard_raw: live.fixtureScoreboardRaw,
      toss_winner_team_id: live.tossWinnerTeamId,
      toss_decision: live.tossDecision,
    }),
    [
      matchCard,
      live.status,
      live.snapshot,
      live.smFixtureStatus,
      live.smFixtureNote,
      live.fixtureScoreboardRaw,
      live.tossWinnerTeamId,
      live.tossDecision,
    ],
  );

  useEffect(() => {
    if (!invitePublic) {
      setWhatsappShareHref(null);
      return;
    }
    const contestUrl = `${window.location.origin}/contests/${contestId}`;
    const msg = buildContestWhatsAppInviteMessage({
      contestTitle,
      matchLabel: matchLabelFromMatchCard(matchCardLive),
      entryFee,
      prizePool,
      contestUrl,
    });
    setWhatsappShareHref(buildWhatsAppShareUrl(msg));
  }, [
    invitePublic,
    contestId,
    contestTitle,
    entryFee,
    prizePool,
    matchCardLive,
  ]);

  const liveSt = String(live.status).toLowerCase();
  const chatterOpen = isMatchStatusOpenForContestChatter(live.status);
  const matchCompleted = liveSt === "completed" || liveSt === "in_review";
  const opponentTeamPreviewLocked = liveSt === "upcoming";
  const showSquadLink = userHasTeamInContest && !rosterLocked;

  const myTeamId = useMemo(() => {
    if (!currentUserId || !userHasTeamInContest) return null;
    return initialRows.find((r) => r.user_id === currentUserId)?.id ?? null;
  }, [initialRows, currentUserId, userHasTeamInContest]);

  const leaderboardCompareHint =
    !opponentTeamPreviewLocked && userHasTeamInContest && myTeamId;

  const openPreview = (row: Row) => {
    if (!currentUserId) return;
    if (
      opponentTeamPreviewLocked &&
      row.user_id !== currentUserId
    ) {
      return;
    }
    setPreview({
      teamId: row.id,
      username: row.username,
      avatar_url: row.avatar_url,
    });
    setSheetOpen(true);
  };

  return (
    <>
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="text-lg font-semibold leading-tight sm:text-xl">
                {contestTitle}
              </h1>
            </div>
            <div className="flex max-w-[min(100%,14rem)] shrink-0 flex-col items-end gap-1.5 sm:max-w-none">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {invitePublic && whatsappShareHref ? (
                  <a
                    href={whatsappShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "border-emerald-600/35 text-emerald-900 dark:border-emerald-400/40 dark:text-emerald-300",
                      "inline-flex min-h-10 items-center justify-center gap-1.5",
                    )}
                    title="Opens WhatsApp with a pre-filled invite message"
                    aria-label="Share contest invite on WhatsApp"
                  >
                    <UserPlus className="size-4 shrink-0" aria-hidden />
                    Invite
                  </a>
                ) : invitePublic ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="pointer-events-none min-h-10 opacity-60"
                    disabled
                    aria-label="Preparing WhatsApp invite link"
                  >
                    <UserPlus className="size-4 shrink-0" aria-hidden />
                    Invite
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    disabled
                    title="Finish joining your squad so friends can open the contest link."
                    aria-label="Invite on WhatsApp — finish joining your squad first"
                  >
                    <UserPlus className="size-4 shrink-0" aria-hidden />
                    Invite
                  </Button>
                )}
                {!matchJoinBlocked && currentUserId && isCreatorDraft ? (
                  rosterLocked ? (
                    <span
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "inline-flex min-h-10 cursor-not-allowed items-center justify-center opacity-60",
                      )}
                      title="Team lock is on — you cannot finish contest setup now."
                    >
                      Continue setup (locked)
                    </span>
                  ) : (
                    <Link
                      href={squadHref}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "inline-flex min-h-10 shrink-0 items-center justify-center",
                      )}
                    >
                      Continue setup
                    </Link>
                  )
                ) : null}
                {showSquadLink ? (
                  <Link
                    href={`/matches/${matchCard.id}/contests/${contestId}/pick-team`}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "inline-flex min-h-10 shrink-0 items-center justify-center",
                    )}
                  >
                    Edit team
                  </Link>
                ) : null}
              </div>
              {!invitePublic ? (
                <p className="text-muted-foreground text-end text-[11px] leading-snug">
                  Finish joining your squad before inviting friends — the link only works once
                  you&apos;ve joined.
                </p>
              ) : null}
            </div>
          </div>

          <HomeUpcomingCard match={matchCardLive} linkHref={false} variant="contest" />

          {userHasTeamInContest && myEntryTeamSummary ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Your squad </span>
              {myEntryTeamSummary.kind === "saved" ? (
                !rosterLocked ? (
                  <Link
                    href={`/matches/${myEntryTeamSummary.matchId}/teams/${myEntryTeamSummary.savedTeamId}/squad`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Team {myEntryTeamSummary.slot}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">
                    Team {myEntryTeamSummary.slot}
                  </span>
                )
              ) : (
                <span className="font-medium text-foreground">Contest XI</span>
              )}
              {myEntryTeamSummary.kind === "saved" ? (
                <span className="text-muted-foreground"> · My teams</span>
              ) : null}
            </p>
          ) : null}

          {myStandings ? (
            <p className="border-primary/30 bg-primary/5 rounded-xl border px-3 py-2 text-sm font-medium tabular-nums">
              Your rank #{myStandings.rank} · {myStandings.points.toFixed(1)} pts
            </p>
          ) : null}

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as DashboardTab)}
            className="w-full"
          >
        <div className="-mx-1 overflow-x-auto pb-1">
          <TabsList
            variant="line"
            className="mb-1 min-w-full justify-start gap-0 px-1 sm:gap-1"
          >
            <TabsTrigger value="winnings" className="shrink-0 px-2 text-xs sm:text-sm">
              Winnings
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="shrink-0 px-2 text-xs sm:text-sm">
              Leaderboard
            </TabsTrigger>
            {userHasChatterAccess ? (
              <TabsTrigger value="chatter" className="shrink-0 px-2 text-xs sm:text-sm">
                Chatter
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="commentary" className="shrink-0 px-2 text-xs sm:text-sm">
              Commentary
            </TabsTrigger>
            <TabsTrigger value="scorecard" className="shrink-0 px-2 text-xs sm:text-sm">
              Scorecard
            </TabsTrigger>
            <TabsTrigger value="stats" className="shrink-0 px-2 text-xs sm:text-sm">
              Stats
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="winnings" className="mt-3 space-y-4">
          <div className="bg-muted/40 space-y-2 rounded-xl border px-3 py-3 text-sm">
            <p className="font-medium tabular-nums">
              Pool ₹{prizePool.toFixed(0)} · Entry ₹{entryFee.toFixed(0)} · {maxParticipants} spots · Top{" "}
              {winnerCount} paid
            </p>
            {!prizesSettled ? (
              <p className="text-muted-foreground text-xs">
                If the contest does not fill, the pool scales to actual entries at settlement (minimum two teams;
                otherwise entry fees are refunded).
              </p>
            ) : null}
            {prizeSlabs.length ? (
              <ul className="text-muted-foreground space-y-1 text-xs">
                {prizeSlabs.map((s, i) => (
                  <li key={i} className="tabular-nums">
                    Ranks {s.rank_from}–{s.rank_to}: ₹{Number(s.amount).toFixed(0)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">No custom prize breakup for this contest.</p>
            )}
          </div>

          {prizesSettled && payoutRows.length > 0 ? (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                Paid winners
              </p>
              <p className="text-muted-foreground mb-2 text-[11px] leading-snug">
                Same points share a rank; prize money for those ranks is pooled and split evenly.
              </p>
              <ul className="divide-border divide-y rounded-xl border bg-card">
                {payoutRows.map((p) => (
                  <li
                    key={p.userTeamId}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <UserAvatar
                        avatarUrl={p.avatar_url}
                        username={p.username}
                        size="sm"
                      />
                      <span className="truncate">
                        #{p.rank} · {p.username}
                      </span>
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 shrink-0 font-semibold tabular-nums">
                      ₹{p.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Winnings are credited after the match is completed and prizes are settled.
            </p>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-3">
          {opponentTeamPreviewLocked && currentUserId ? (
            <p className="text-muted-foreground mb-2 text-xs">
              Tap your row to preview your XI. Opponent teams unlock when the match goes
              live.
            </p>
          ) : null}
          {leaderboardCompareHint && currentUserId ? (
            <p className="text-muted-foreground mb-2 text-xs">
              Tap another contestant to compare teams (your picks vs theirs).
            </p>
          ) : null}
          {!initialRows.length ? (
            <p className="text-muted-foreground text-sm">No teams yet.</p>
          ) : (
            <LeaderboardRealtime
              contestId={contestId}
              initialRows={initialRows}
              refreshNonce={pageRefreshNonce}
              currentUserId={currentUserId}
              onRowSelect={openPreview}
              payoutByTeamId={payoutByTeamId}
              prizesSettled={prizesSettled}
              prizeBreakup={prizeBreakupJson}
              teamCount={initialRows.length}
              pointsUpdatedAt={live.liveSnapshotAt ?? pointsUpdatedAt}
              opponentTeamPreviewLocked={opponentTeamPreviewLocked}
            />
          )}
        </TabsContent>

        {userHasChatterAccess ? (
          <TabsContent value="chatter" className="mt-3">
            <ContestChatterPanel
              contestId={contestId}
              currentUserId={currentUserId}
              chatterOpen={chatterOpen}
              initialMessages={initialChatterMessages}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="commentary" className="mt-3">
          <div className="text-muted-foreground bg-muted/30 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            Commentary coming soon.
          </div>
        </TabsContent>

        <TabsContent value="scorecard" className="mt-3">
          <MatchLiveScoreTabs
            snapshot={live.snapshot}
            fixtureScoreboardRaw={live.fixtureScoreboardRaw}
            isCompleted={matchCompleted}
            tossSummary={
              <MatchTossLines
                teamA={matchCard.team_a ?? null}
                teamB={matchCard.team_b ?? null}
                localteamId={matchCard.localteam_id ?? null}
                visitorteamId={matchCard.visitorteam_id ?? null}
                tossWinnerTeamId={live.tossWinnerTeamId}
                tossDecision={live.tossDecision}
              />
            }
          />
        </TabsContent>

        <TabsContent value="stats" className="mt-3">
          <div className="text-muted-foreground bg-muted/30 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            Match stats coming soon.
          </div>
        </TabsContent>
      </Tabs>
        </div>

      <ContestTeamPreviewSheet
        key={preview?.teamId ?? "closed"}
        contestId={contestId}
        userTeamId={preview?.teamId ?? null}
        compareWithTeamId={leaderboardCompareHint ? myTeamId : null}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setPreview(null);
        }}
        username={preview?.username ?? null}
        avatarUrl={preview?.avatar_url ?? null}
      />
    </>
  );
}
