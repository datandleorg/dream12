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
import {
  FixtureSmStatusLine,
  smFixtureToneHeadlineClass,
} from "@/components/fixture-sm-status-line";
import { matchCardLiveCenterLine } from "@/lib/sportmonks/match-status-from-sm";
import { MatchStartCountdown } from "@/components/match-start-countdown";
import { MatchShortScore } from "@/components/match-short-score";
import { buttonVariants } from "@/components/ui/button-variants";
import type { LiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
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
  liveSnapshot,
  smFixtureStatus,
  smFixtureNote,
}: {
  matchId: number;
  startIso: string;
  status: string;
  tournamentName: string | null;
  subtitle: string;
  matchFormat: string | null;
  venueLine: string | null;
  stageLine: string | null;
  liveSnapshot?: LiveSnapshot | null;
  smFixtureStatus?: string | null;
  smFixtureNote?: string | null;
}) {
  const statusKey = status.toLowerCase();
  const isLive = statusKey === "live";
  const isInReview = statusKey === "in_review";
  const isCompleted = statusKey === "completed" || isInReview;
  const liveCenterLine = isLive
    ? matchCardLiveCenterLine(smFixtureStatus, smFixtureNote)
    : null;

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
        <FixtureSmStatusLine
          label={smFixtureStatus}
          note={smFixtureNote}
          showNote={!isLive}
        />
        <MatchShortScore snapshot={liveSnapshot} className="mt-0.5" />
        <p className="text-muted-foreground">
          {new Date(startIso).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        {isInReview ? (
          <p className="w-fit rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white">
            Final scores under review
          </p>
        ) : isCompleted ? (
          <p className="text-muted-foreground text-sm font-medium">Match finished</p>
        ) : isLive ? (
          liveCenterLine ? (
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                smFixtureToneHeadlineClass(liveCenterLine.tone),
              )}
            >
              {liveCenterLine.text}
            </p>
          ) : null
        ) : (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Starts in</span>
            <MatchStartCountdown
              startIso={startIso}
              className="font-medium text-foreground"
            />
          </p>
        )}
        {venueLine ? (
          <p className="text-muted-foreground text-sm">{venueLine}</p>
        ) : null}
        {stageLine ? (
          <p className="text-muted-foreground text-xs">{stageLine}</p>
        ) : null}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={`/matches/${matchId}/live`}
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "inline-flex min-h-10 w-full items-center justify-center sm:w-auto",
            )}
          >
            Live score
          </Link>
          <Link
            href={`/matches/${matchId}`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "inline-flex min-h-10 w-full items-center justify-center sm:w-auto",
            )}
          >
            View match and all contests
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
