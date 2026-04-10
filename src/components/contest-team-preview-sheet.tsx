"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getContestTeamBreakdown,
  type ContestTeamBreakdownResult,
} from "@/app/actions/contest-team-breakdown";
import {
  getContestTeamsCompare,
  type ContestTeamsCompareResult,
} from "@/app/actions/contest-teams-compare";
import { ContestTeamCompareView } from "@/components/contest-team-compare-view";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContestTeamPointsBreakdown } from "@/components/contest-team-points-breakdown";
import { UserAvatar } from "@/components/user-avatar";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { SQUAD_SIZE } from "@/lib/fantasy/rules";
import { cn } from "@/lib/utils";

function SingleTeamBody({
  data,
}: {
  data: Extract<ContestTeamBreakdownResult, { ok: true }>;
}) {
  return (
    <div className="space-y-3">
      {!data.statsAvailable ? (
        <p className="text-muted-foreground bg-muted/50 rounded-lg border px-3 py-2 text-xs">
          Live player stats are not available yet. Showing starting XI bonus and zero performance
          until data syncs.
        </p>
      ) : null}
      <TeamFieldPreview
        teamA={data.pitch.teamA}
        teamB={data.pitch.teamB}
        selected={data.pitch.selected}
        squadSize={SQUAD_SIZE}
        creditsLeft={data.pitch.creditsLeft}
        captainId={data.pitch.captainId}
        viceCaptainId={data.pitch.viceCaptainId}
        fantasyPointsByPlayerId={data.pitch.fantasyPointsByPlayerId}
        statsRightOverride={{
          label: "Team pts",
          value: data.computedTotal.toFixed(1),
        }}
      />
      <ContestTeamPointsBreakdown lines={data.lines} />
      <p className="text-muted-foreground border-t pt-2 text-[11px]">
        Leaderboard total (stored):{" "}
        <span className="font-medium tabular-nums text-foreground">
          {data.storedTotal.toFixed(1)}
        </span>
        {Math.abs(data.computedTotal - data.storedTotal) > 0.5 ? (
          <span className="mt-1 block">
            May differ when live stats lag behind the last leaderboard update.
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** Segmented control: full-width 2-col grid; `!` overrides TabsList `inline-flex` + `h-8`. */
const compareTabsListClass =
  "mb-3 !grid h-auto min-h-12 !w-full grid-cols-2 gap-1 rounded-xl border border-border/50 bg-muted/50 p-1 shadow-inner dark:bg-muted/40";

const compareTabTriggerClass =
  "flex h-11 w-full items-center justify-center rounded-lg border border-transparent px-2 text-sm font-semibold whitespace-normal text-center text-muted-foreground transition-[color,background-color,box-shadow,border-color] duration-150 " +
  "hover:text-foreground " +
  "data-[active]:!border-red-500/30 data-[active]:!bg-red-600 data-[active]:!text-white data-[active]:shadow-sm " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none " +
  "after:!hidden aria-[selected=true]:after:!hidden";

export function ContestTeamPreviewSheet({
  contestId,
  userTeamId,
  compareWithTeamId = null,
  open,
  onOpenChange,
  username,
  avatarUrl = null,
}: {
  contestId: string;
  userTeamId: string | null;
  /** When set and different from `userTeamId`, load compare (you vs this opponent row). */
  compareWithTeamId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string | null;
  avatarUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [single, setSingle] = useState<Extract<ContestTeamBreakdownResult, { ok: true }> | null>(
    null,
  );
  const [compare, setCompare] = useState<Extract<ContestTeamsCompareResult, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const useCompare = Boolean(
    compareWithTeamId && userTeamId && compareWithTeamId !== userTeamId,
  );

  const opponentLabel = username?.trim() || "Them";

  useEffect(() => {
    if (!open || !userTeamId) return;
    startTransition(async () => {
      setError(null);
      setSingle(null);
      setCompare(null);
      if (useCompare && compareWithTeamId) {
        const res = await getContestTeamsCompare({
          contestId,
          opponentUserTeamId: userTeamId,
        });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setCompare(res);
        return;
      }
      const res = await getContestTeamBreakdown({ contestId, userTeamId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSingle(res);
    });
  }, [open, userTeamId, contestId, useCompare, compareWithTeamId]);

  const loaded = useCompare ? compare : single;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="max-h-[92dvh] gap-0 rounded-t-2xl border-sky-500/15 p-0 sm:max-w-lg sm:rounded-t-none"
      >
        <SheetHeader className="border-border/80 shrink-0 border-b bg-card/95 px-4 py-3 text-left">
          <SheetTitle
            className={cn(
              "text-base tracking-wide uppercase sm:text-lg",
              useCompare && "font-bold",
            )}
          >
            {useCompare ? "Team compare" : "Team preview"}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 pt-1">
            <UserAvatar avatarUrl={avatarUrl} username={username} size="sm" />
            <span>
              {username?.trim() || "Contestant"}
              {useCompare ? " · vs your team" : " · fantasy points on the pitch"}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="bg-muted/25 min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-8">
          {pending && !loaded ? (
            <div className="text-muted-foreground py-6 text-sm">Loading…</div>
          ) : error ? (
            <p className="text-destructive py-4 text-sm">{error}</p>
          ) : compare && useCompare ? (
            <Tabs
              key={`${userTeamId}-${compareWithTeamId}`}
              defaultValue="compare"
              className="w-full"
            >
              <TabsList variant="line" className={compareTabsListClass}>
                <TabsTrigger value="compare" className={compareTabTriggerClass}>
                  Compare
                </TabsTrigger>
                <TabsTrigger value="their" className={compareTabTriggerClass}>
                  Their XI
                </TabsTrigger>
              </TabsList>
              <TabsContent value="compare" className="mt-0">
                <ContestTeamCompareView
                  data={compare}
                  opponentDisplayName={opponentLabel}
                />
              </TabsContent>
              <TabsContent value="their" className="mt-0 space-y-3">
                {!compare.opponent.statsAvailable ? (
                  <p className="text-muted-foreground bg-muted/50 rounded-lg border px-3 py-2 text-xs">
                    Live player stats are not available yet. Showing starting XI bonus and zero
                    performance until data syncs.
                  </p>
                ) : null}
                <TeamFieldPreview
                  teamA={compare.opponent.pitch.teamA}
                  teamB={compare.opponent.pitch.teamB}
                  selected={compare.opponent.pitch.selected}
                  squadSize={SQUAD_SIZE}
                  creditsLeft={compare.opponent.pitch.creditsLeft}
                  captainId={compare.opponent.pitch.captainId}
                  viceCaptainId={compare.opponent.pitch.viceCaptainId}
                  fantasyPointsByPlayerId={compare.opponent.pitch.fantasyPointsByPlayerId}
                  statsRightOverride={{
                    label: "Team pts",
                    value: compare.opponent.computedTotal.toFixed(1),
                  }}
                />
                <ContestTeamPointsBreakdown lines={compare.opponent.lines} />
                <p className="text-muted-foreground border-t pt-2 text-[11px]">
                  Leaderboard total (stored):{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {compare.opponent.storedTotal.toFixed(1)}
                  </span>
                </p>
              </TabsContent>
            </Tabs>
          ) : single ? (
            <SingleTeamBody data={single} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
