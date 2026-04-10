import { formatMatchTossSummary } from "@/lib/match-toss-summary";
import { cn } from "@/lib/utils";

export function MatchTossLines({
  teamA,
  teamB,
  localteamId,
  visitorteamId,
  tossWinnerTeamId,
  tossDecision,
  className,
}: {
  teamA: string | null;
  teamB: string | null;
  localteamId: number | null;
  visitorteamId: number | null;
  tossWinnerTeamId: number | null;
  tossDecision: string | null;
  className?: string;
}) {
  const { tossLine, battingFirstLine } = formatMatchTossSummary({
    team_a: teamA,
    team_b: teamB,
    localteam_id: localteamId,
    visitorteam_id: visitorteamId,
    toss_winner_team_id: tossWinnerTeamId,
    toss_decision: tossDecision,
  });
  if (!tossLine && !battingFirstLine) return null;
  return (
    <div className={cn("text-muted-foreground space-y-0.5 text-sm", className)}>
      {tossLine ? <p>{tossLine}</p> : null}
      {battingFirstLine ? (
        <p className="text-muted-foreground/90 text-xs">{battingFirstLine}</p>
      ) : null}
    </div>
  );
}
