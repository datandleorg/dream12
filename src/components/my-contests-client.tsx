"use client";

import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { cn } from "@/lib/utils";
import { DeleteContestButton } from "@/components/delete-contest-button";

export type MyContestListRow = {
  userTeamId: string;
  contestId: string;
  contestTitle: string;
  matchId: number;
  matchVersus: string;
  /** Toss + batting first when known (server-computed). */
  tossSummaryLine: string | null;
  startTimeLabel: string;
  matchStatus: string;
  tournamentName: string | null;
  totalPoints: number;
  prizePool: number;
  entryFee: number;
  prizesSettled: boolean;
  rank: number;
  /** null when contest not settled; 0 when settled but no payout row */
  amountWonInr: number | null;
  canEditTeam: boolean;
  /** Host can delete before lock (same rules as match page). */
  canDeleteAsHost: boolean;
  paidParticipantsCount: number;
  /** Squad vs captain vs preview based on saved progress. */
  teamFlowHref: string;
};

function ContestCard({ row }: { row: MyContestListRow }) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">{row.contestTitle}</CardTitle>
          <MatchStatusBadge status={row.matchStatus} className="shrink-0" />
        </div>
        <div className="text-muted-foreground space-y-1 text-sm">
          <p className="font-medium text-foreground">{row.matchVersus}</p>
          {row.tossSummaryLine ? (
            <p className="text-xs leading-snug">{row.tossSummaryLine}</p>
          ) : null}
          {row.tournamentName ? (
            <p className="text-xs">{row.tournamentName}</p>
          ) : null}
          <p className="text-xs tabular-nums">{row.startTimeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          <span>
            <span className="text-muted-foreground">Your rank </span>
            <span className="font-semibold">
              {row.rank > 0 ? `#${row.rank}` : "—"}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Points </span>
            <span className="font-semibold">{row.totalPoints.toFixed(1)}</span>
          </span>
          <span className="text-muted-foreground">
            Pool ₹{row.prizePool.toFixed(0)} · Entry ₹{row.entryFee.toFixed(0)}
          </span>
        </div>
        <CardDescription className="text-foreground text-sm font-medium">
          {row.prizesSettled ? (
            <>
              Prize won:{" "}
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                ₹
                {(row.amountWonInr ?? 0).toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground font-normal">Winnings pending settlement</span>
          )}
        </CardDescription>
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-2">
            <Link
              href={`/contests/${row.contestId}`}
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "inline-flex min-h-11 flex-1 items-center justify-center",
              )}
            >
              Leaderboard
            </Link>
            {row.canEditTeam ? (
              <Link
                href={row.teamFlowHref}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "inline-flex min-h-11 flex-1 items-center justify-center",
                )}
              >
                Edit team
              </Link>
            ) : null}
          </div>
          {row.canDeleteAsHost ? (
            <DeleteContestButton
              contestId={row.contestId}
              contestTitle={row.contestTitle}
              entryFee={row.entryFee}
              matchId={row.matchId}
              paidParticipantsCount={row.paidParticipantsCount}
              redirectToMatchAfterDelete
              fullWidth
            />
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}

function RowList({ rows }: { rows: MyContestListRow[] }) {
  if (!rows.length) return null;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.userTeamId}>
          <ContestCard row={row} />
        </li>
      ))}
    </ul>
  );
}

export function MyContestsClient({ rows }: { rows: MyContestListRow[] }) {
  const openRows = rows.filter((r) => !r.prizesSettled);
  const closedRows = rows.filter((r) => r.prizesSettled);

  return (
    <Tabs defaultValue="open" className="w-full">
      <div className="-mx-1 overflow-x-auto pb-1">
        <TabsList
          variant="line"
          className="mb-1 min-w-full justify-start gap-0 px-1 sm:gap-1"
        >
          <TabsTrigger value="open" className="shrink-0 px-3 text-xs sm:text-sm">
            Open ({openRows.length})
          </TabsTrigger>
          <TabsTrigger value="closed" className="shrink-0 px-3 text-xs sm:text-sm">
            Closed ({closedRows.length})
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="open" className="mt-3 space-y-3">
        {openRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No open contests. Settled contests move to the Closed tab.
          </p>
        ) : (
          <RowList rows={openRows} />
        )}
      </TabsContent>
      <TabsContent value="closed" className="mt-3 space-y-3">
        {closedRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No closed contests yet. They appear here after prizes are settled.
          </p>
        ) : (
          <RowList rows={closedRows} />
        )}
      </TabsContent>
    </Tabs>
  );
}
