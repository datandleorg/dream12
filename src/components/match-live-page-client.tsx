"use client";

import Link from "next/link";
import { FixtureSmStatusLine } from "@/components/fixture-sm-status-line";
import { MatchLiveScoreTabs } from "@/components/match-live-score-tabs";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { MatchTossLines } from "@/components/match-toss-lines";
import { buttonVariants } from "@/components/ui/button-variants";
import { useMatchLiveRow } from "@/lib/hooks/use-match-live-row";
import type { LiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
import { cn } from "@/lib/utils";

export function MatchLivePageClient({
  matchId,
  tournamentName,
  subtitle,
  live_snapshot,
  live_snapshot_at,
  status: initialStatus,
  sm_fixture_status,
  sm_fixture_note,
  fixture_scoreboard_raw,
  initialParsedSnapshot,
  teamA,
  teamB,
  localteamId,
  visitorteamId,
  tossWinnerTeamId: initialTossWinnerTeamId,
  tossDecision: initialTossDecision,
}: {
  matchId: number;
  tournamentName: string | null;
  subtitle: string;
  live_snapshot: unknown;
  live_snapshot_at: string | null;
  status: string;
  sm_fixture_status: string | null;
  sm_fixture_note?: string | null;
  fixture_scoreboard_raw?: unknown;
  initialParsedSnapshot: LiveSnapshot;
  teamA: string | null;
  teamB: string | null;
  localteamId: number | null;
  visitorteamId: number | null;
  tossWinnerTeamId: number | null;
  tossDecision: string | null;
}) {
  const {
    snapshot,
    status,
    smFixtureStatus,
    smFixtureNote,
    fixtureScoreboardRaw,
    tossWinnerTeamId,
    tossDecision,
  } = useMatchLiveRow({
    matchId,
    live_snapshot,
    live_snapshot_at,
    status: initialStatus,
    sm_fixture_status,
    sm_fixture_note: sm_fixture_note ?? null,
    fixture_scoreboard_raw,
    initialParsedSnapshot,
    toss_winner_team_id: initialTossWinnerTeamId,
    toss_decision: initialTossDecision,
  });

  const st = String(status).toLowerCase();
  const matchCompleted = st === "completed" || st === "in_review";

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {tournamentName ? (
            <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
              {tournamentName}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight">Live score</h1>
            <MatchStatusBadge status={String(status)} />
          </div>
          <FixtureSmStatusLine label={smFixtureStatus} note={smFixtureNote} />
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          <MatchTossLines
            teamA={teamA}
            teamB={teamB}
            localteamId={localteamId}
            visitorteamId={visitorteamId}
            tossWinnerTeamId={tossWinnerTeamId}
            tossDecision={tossDecision}
            className="mt-2 text-xs"
          />
        </div>
        <Link
          href={`/matches/${matchId}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-h-10 shrink-0",
          )}
        >
          Match & contests
        </Link>
      </div>

      <MatchLiveScoreTabs
        snapshot={snapshot}
        fixtureScoreboardRaw={fixtureScoreboardRaw}
        isCompleted={matchCompleted}
      />
    </div>
  );
}
