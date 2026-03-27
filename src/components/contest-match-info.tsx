import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MatchStatusBadge } from "@/components/match-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MatchStartCountdown } from "@/components/match-start-countdown";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function ContestMatchInfo({
  matchId,
  startIso,
  status,
  tournamentName,
  subtitle,
  matchFormat,
  venueLine,
  stageLine,
}: {
  matchId: number;
  startIso: string;
  status: string;
  tournamentName: string | null;
  subtitle: string;
  matchFormat: string | null;
  venueLine: string | null;
  stageLine: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>Match</CardDescription>
        <CardTitle className="text-base leading-snug">{subtitle}</CardTitle>
        {tournamentName ? (
          <p className="text-accent text-[11px] font-semibold tracking-wide uppercase">
            {tournamentName}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <MatchStatusBadge status={status} />
          {matchFormat ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {matchFormat}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground">
          {new Date(startIso).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Starts in</span>
          <MatchStartCountdown
            startIso={startIso}
            className="font-medium text-foreground"
          />
        </p>
        {venueLine ? (
          <p className="text-muted-foreground text-sm">{venueLine}</p>
        ) : null}
        {stageLine ? (
          <p className="text-muted-foreground text-xs">{stageLine}</p>
        ) : null}
        <Link
          href={`/matches/${matchId}`}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "mt-2 inline-flex min-h-10 w-full items-center justify-center sm:w-auto",
          )}
        >
          View match and all contests
        </Link>
      </CardContent>
    </Card>
  );
}
