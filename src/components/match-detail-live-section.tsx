"use client";

import { Badge } from "@/components/ui/badge";
import { MatchShortScore } from "@/components/match-short-score";
import { MatchStartCountdown } from "@/components/match-start-countdown";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { MatchTossLines } from "@/components/match-toss-lines";
import { useMatchLiveRow } from "@/lib/hooks/use-match-live-row";
import {
  isSnapshotShortLinePlaceholder,
  type LiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";

export function MatchDetailLiveSection({
  matchId,
  title,
  tournamentName,
  startIso,
  matchFormat,
  live_snapshot,
  live_snapshot_at,
  status: initialStatus,
  sm_fixture_status,
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
  title: string;
  tournamentName: string | null;
  startIso: string;
  matchFormat: string | null;
  live_snapshot: unknown;
  live_snapshot_at: string | null;
  status: string;
  sm_fixture_status: string | null;
  fixture_scoreboard_raw?: unknown;
  initialParsedSnapshot?: LiveSnapshot | null;
  teamA: string | null;
  teamB: string | null;
  localteamId: number | null;
  visitorteamId: number | null;
  tossWinnerTeamId: number | null;
  tossDecision: string | null;
}) {
  const { snapshot, status, tossWinnerTeamId, tossDecision } = useMatchLiveRow({
    matchId,
    live_snapshot,
    live_snapshot_at,
    status: initialStatus,
    sm_fixture_status,
    fixture_scoreboard_raw,
    initialParsedSnapshot,
    toss_winner_team_id: initialTossWinnerTeamId,
    toss_decision: initialTossDecision,
  });

  const statusKey = String(status).toLowerCase();
  const isLive = statusKey === "live";
  const isCompleted = statusKey === "completed" || statusKey === "in_review";

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          {tournamentName ? (
            <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
              {tournamentName}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <MatchStatusBadge status={String(status)} />
          {matchFormat ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {matchFormat}
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {new Date(startIso).toLocaleString(undefined, {
          dateStyle: "full",
          timeStyle: "short",
        })}
      </p>
      <MatchTossLines
        teamA={teamA}
        teamB={teamB}
        localteamId={localteamId}
        visitorteamId={visitorteamId}
        tossWinnerTeamId={tossWinnerTeamId}
        tossDecision={tossDecision}
        className="mt-2"
      />
      {!isSnapshotShortLinePlaceholder(snapshot) ? (
        <MatchShortScore snapshot={snapshot} className="mt-1" />
      ) : null}
      {statusKey === "in_review" ? (
        <p className="mt-1 text-sm font-medium text-violet-800 dark:text-violet-200">
          Match ended — final scores under review
        </p>
      ) : isCompleted ? (
        <p className="text-muted-foreground mt-1 text-sm font-medium">Match finished</p>
      ) : isLive ? null : (
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>Starts in</span>
          <MatchStartCountdown startIso={startIso} className="font-medium text-foreground" />
        </p>
      )}
    </div>
  );
}
