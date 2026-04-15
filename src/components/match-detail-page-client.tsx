"use client";

import { useState, type ReactNode } from "react";
import { MatchDetailHero } from "@/components/match-detail-live-section";
import { MatchLiveScoreTabs } from "@/components/match-live-score-tabs";
import { MatchTossLines } from "@/components/match-toss-lines";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMatchLiveRow, type MatchLiveRowArgs } from "@/lib/hooks/use-match-live-row";

type MatchDetailTab = "live" | "contests" | "teams";

export function MatchDetailPageClient({
  liveArgs,
  title,
  tournamentName,
  startIso,
  matchFormat,
  teamA,
  teamB,
  localteamId,
  visitorteamId,
  venueLine,
  stageLine,
  contestsSlot,
  teamsSlot,
}: {
  liveArgs: MatchLiveRowArgs;
  title: string;
  tournamentName: string | null;
  startIso: string;
  matchFormat: string | null;
  teamA: string | null;
  teamB: string | null;
  localteamId: number | null;
  visitorteamId: number | null;
  venueLine: string | null;
  stageLine: string | null;
  contestsSlot: ReactNode;
  teamsSlot: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<MatchDetailTab>("live");
  const {
    snapshot,
    status,
    smFixtureStatus,
    smFixtureNote,
    fixtureScoreboardRaw,
    tossWinnerTeamId,
    tossDecision,
  } = useMatchLiveRow(liveArgs);

  const st = String(status).toLowerCase();
  const matchCompleted = st === "completed" || st === "in_review";

  return (
    <div className="space-y-4 py-4">
      <div>
        <MatchDetailHero
          title={title}
          tournamentName={tournamentName}
          startIso={startIso}
          matchFormat={matchFormat}
          snapshot={snapshot}
          status={status}
          smFixtureStatus={smFixtureStatus}
          smFixtureNote={smFixtureNote}
          teamA={teamA}
          teamB={teamB}
          localteamId={localteamId}
          visitorteamId={visitorteamId}
          tossWinnerTeamId={tossWinnerTeamId}
          tossDecision={tossDecision}
        />
        {venueLine ? (
          <p className="text-muted-foreground mt-1 text-sm">{venueLine}</p>
        ) : null}
        {stageLine ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{stageLine}</p>
        ) : null}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as MatchDetailTab)}
        className="w-full"
      >
        <div className="-mx-1 overflow-x-auto pb-1">
          <TabsList
            variant="line"
            className="mb-1 min-w-full justify-start gap-0 px-1 sm:gap-1"
          >
            <TabsTrigger value="live" className="shrink-0 px-2 text-xs sm:text-sm">
              Live
            </TabsTrigger>
            <TabsTrigger value="contests" className="shrink-0 px-2 text-xs sm:text-sm">
              Contests
            </TabsTrigger>
            <TabsTrigger value="teams" className="shrink-0 px-2 text-xs sm:text-sm">
              Teams
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="live" className="mt-3">
          <MatchLiveScoreTabs
            snapshot={snapshot}
            fixtureScoreboardRaw={fixtureScoreboardRaw}
            isCompleted={matchCompleted}
            tossSummary={
              <MatchTossLines
                teamA={teamA}
                teamB={teamB}
                localteamId={localteamId}
                visitorteamId={visitorteamId}
                tossWinnerTeamId={tossWinnerTeamId}
                tossDecision={tossDecision}
              />
            }
          />
        </TabsContent>

        <TabsContent value="contests" className="mt-3 space-y-3">
          {contestsSlot}
        </TabsContent>

        <TabsContent value="teams" className="mt-3">
          {teamsSlot}
        </TabsContent>
      </Tabs>
    </div>
  );
}
