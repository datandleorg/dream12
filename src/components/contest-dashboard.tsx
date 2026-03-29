"use client";

import { useState } from "react";
import Link from "next/link";
import { LeaderboardPullRefresh } from "@/components/leaderboard-pull-refresh";
import type { Row } from "@/components/leaderboard-realtime";
import { ContestTeamPreviewSheet } from "@/components/contest-team-preview-sheet";
import {
  HomeUpcomingCard,
  type HomeMatchCardModel,
} from "@/components/home-upcoming-card";
import { MatchLiveScoreTabs } from "@/components/match-live-score-tabs";
import { buttonVariants } from "@/components/ui/button-variants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
import { cn } from "@/lib/utils";

export type ContestPayoutDisplayRow = {
  rank: number;
  username: string;
  amount: number;
  userTeamId: string;
};

export type ContestPrizeSlab = {
  rank_from: number;
  rank_to: number;
  amount: number;
};

export function ContestDashboard({
  contestId,
  contestTitle,
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
}: {
  contestId: string;
  contestTitle: string;
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
}) {
  const [preview, setPreview] = useState<{ teamId: string; username: string | null } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const matchCompleted = matchCard.status.toLowerCase() === "completed";

  const openPreview = (row: Row) => {
    if (!currentUserId) return;
    setPreview({ teamId: row.id, username: row.username });
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-lg font-semibold leading-tight sm:text-xl">{contestTitle}</h1>
        {userHasTeamInContest ? (
          <Link
            href={squadHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "inline-flex min-h-10 shrink-0 items-center justify-center",
            )}
          >
            My team
          </Link>
        ) : null}
      </div>

      <HomeUpcomingCard match={matchCard} linkHref={false} variant="contest" />

      {myStandings ? (
        <p className="border-primary/30 bg-primary/5 rounded-xl border px-3 py-2 text-sm font-medium tabular-nums">
          Your rank #{myStandings.rank} · {myStandings.points.toFixed(1)} pts
        </p>
      ) : null}

      <Tabs defaultValue="leaderboard" className="w-full">
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
              <ul className="divide-border divide-y rounded-xl border bg-card">
                {payoutRows.map((p) => (
                  <li
                    key={p.userTeamId}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">
                      #{p.rank} · {p.username}
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
          {!initialRows.length ? (
            <p className="text-muted-foreground text-sm">No teams yet.</p>
          ) : (
            <LeaderboardPullRefresh
              contestId={contestId}
              initialRows={initialRows}
              currentUserId={currentUserId}
              onRowSelect={openPreview}
              payoutByTeamId={payoutByTeamId}
              prizesSettled={prizesSettled}
              prizeBreakup={prizeBreakupJson}
              teamCount={initialRows.length}
              pointsUpdatedAt={pointsUpdatedAt}
            />
          )}
        </TabsContent>

        <TabsContent value="commentary" className="mt-3">
          <div className="text-muted-foreground bg-muted/30 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            Commentary coming soon.
          </div>
        </TabsContent>

        <TabsContent value="scorecard" className="mt-3">
          <MatchLiveScoreTabs
            snapshot={liveSnapshot}
            defaultTab="scorecard"
            isCompleted={matchCompleted}
          />
        </TabsContent>

        <TabsContent value="stats" className="mt-3">
          <div className="text-muted-foreground bg-muted/30 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            Match stats coming soon.
          </div>
        </TabsContent>
      </Tabs>

      <ContestTeamPreviewSheet
        key={preview?.teamId ?? "closed"}
        contestId={contestId}
        userTeamId={preview?.teamId ?? null}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setPreview(null);
        }}
        username={preview?.username ?? null}
      />
    </div>
  );
}
