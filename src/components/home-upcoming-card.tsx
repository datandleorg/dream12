"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FixtureSmStatusLine,
  smFixtureToneHeadlineClass,
} from "@/components/fixture-sm-status-line";
import { matchCardLiveCenterLine } from "@/lib/sportmonks/match-status-from-sm";
import { MatchTossLines } from "@/components/match-toss-lines";
import { MatchShortScore } from "@/components/match-short-score";
import { MatchStatusBadge } from "@/components/match-status-badge";
import {
  completedTeamScoreLines,
  formatMatchResultSummary,
  isSnapshotShortLinePlaceholder,
  parseLiveSnapshot,
  type LiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";
import { formatMatchCountdownCoarse, msUntilStart } from "@/lib/time/match-countdown";
import { cn } from "@/lib/utils";

export type HomeMatchCardModel = {
  id: number;
  name: string;
  start_time: string;
  status: string;
  tournament_name: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_logo_url: string | null;
  team_b_logo_url: string | null;
  max_prize_pool: number;
  live_snapshot?: unknown;
  fixture_scoreboard_raw?: unknown;
  sm_fixture_status?: string | null;
  sm_fixture_note?: string | null;
  entry_fee?: number;
  /** Resolved on the home list from `sm_venues` */
  venue_line?: string | null;
  /** Resolved on the home list from `sm_stages` */
  stage_line?: string | null;
  match_format?: string | null;
  localteam_id?: number | null;
  visitorteam_id?: number | null;
  toss_winner_team_id?: number | null;
  toss_decision?: string | null;
};

function TeamOrb({
  label,
  logoUrl,
  showCaption = true,
}: {
  label: string;
  logoUrl: string | null;
  /** When false, logo only (scores carry team codes). */
  showCaption?: boolean;
}) {
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="border-border/80 bg-secondary/80 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-bold">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="size-full object-cover"
            width={48}
            height={48}
          />
        ) : (
          initials || "?"
        )}
      </div>
      {showCaption ? (
        <span className="text-muted-foreground max-w-[4.5rem] truncate text-center text-[10px] font-medium">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function PoolPrizeBlock({
  isContestVariant,
  maxPrizePool,
  entryFee,
  className,
}: {
  isContestVariant: boolean;
  maxPrizePool: number;
  entryFee?: number;
  className?: string;
}) {
  if (!isContestVariant && maxPrizePool <= 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-0.5 tabular-nums", className)}>
      {isContestVariant ? (
        <>
          <span
            className="text-foreground/90 text-sm font-medium"
            suppressHydrationWarning
          >
            Pool ₹{maxPrizePool.toLocaleString("en-IN")}
          </span>
          {entryFee != null && Number.isFinite(entryFee) ? (
            <span
              className="text-muted-foreground text-xs font-medium"
              suppressHydrationWarning
            >
              Entry ₹{Number(entryFee).toFixed(0)}
            </span>
          ) : null}
        </>
      ) : (
        <span
          className="text-foreground/90 text-sm font-medium"
          suppressHydrationWarning
        >
          Prize up to ₹{maxPrizePool.toLocaleString("en-IN")}
        </span>
      )}
    </div>
  );
}

function playedAtLabel(startIso: string) {
  return new Date(startIso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Split e.g. `PK 165/7 (19.1 ov)` so overs stay on the next line (avoids bad mid-token wraps). */
function splitRunsAndOversLine(line: string): { head: string; overs: string | null } {
  const trimmed = line.trim();
  const re = /\s+(\([^)]*\bov\b[^)]*\))\s*$/i;
  const m = trimmed.match(re);
  if (m && m.index != null) {
    return {
      head: trimmed.slice(0, m.index).trim(),
      overs: m[1]!,
    };
  }
  return { head: trimmed, overs: null };
}

function TeamScoreLines({
  line,
  align,
}: {
  line: string;
  align: "left" | "right";
}) {
  const { head, overs } = splitRunsAndOversLine(line);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5",
        align === "right" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span className="text-sm font-semibold leading-snug break-words tabular-nums">
        {head}
      </span>
      {overs ? (
        <span className="text-muted-foreground text-xs font-medium tabular-nums">
          {overs}
        </span>
      ) : null}
    </div>
  );
}

/** Completed / in_review with snapshot: horizontal score band + center meta. */
function CompletedScoreBand({
  teamA,
  teamB,
  teamALogo,
  teamBLogo,
  lines,
  liveSnap,
  completedHasShort,
  resultLine,
  isContestVariant,
  maxPrizePool,
  entryFee,
  tapHint,
}: {
  teamA: string;
  teamB: string;
  teamALogo: string | null;
  teamBLogo: string | null;
  lines: string[];
  liveSnap: LiveSnapshot;
  completedHasShort: boolean;
  resultLine: string | null;
  isContestVariant: boolean;
  maxPrizePool: number;
  entryFee?: number;
  tapHint: string | null;
}) {
  const n = lines.length;

  if (n >= 2) {
    const [aLine, bLine] = [lines[0]!, lines[1]!];
    return (
      <div className="space-y-2 px-6 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,10rem)_minmax(0,1fr)] items-start gap-x-2 gap-y-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <TeamOrb label={teamA} logoUrl={teamALogo} showCaption={false} />
            <div className="w-full min-w-0">
              <TeamScoreLines line={aLine} align="left" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5 px-0.5 pt-0.5 text-center">
            {resultLine ? (
              <span className="text-foreground text-sm font-semibold leading-tight">
                {resultLine}
              </span>
            ) : null}
            <PoolPrizeBlock
              isContestVariant={isContestVariant}
              maxPrizePool={maxPrizePool}
              entryFee={entryFee}
              className="items-center"
            />
            {tapHint ? (
              <span className="text-muted-foreground max-w-full text-center text-[10px] font-medium leading-tight">
                {tapHint}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <TeamOrb label={teamB} logoUrl={teamBLogo} showCaption={false} />
            <div className="w-full min-w-0">
              <TeamScoreLines line={bLine} align="right" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (n === 1) {
    const only = lines[0]!;
    return (
      <div className="space-y-2 px-6 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,10rem)_minmax(0,1fr)] items-start gap-x-2 gap-y-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <TeamOrb label={teamA} logoUrl={teamALogo} showCaption={false} />
            <div className="w-full min-w-0">
              <TeamScoreLines line={only} align="left" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5 px-0.5 pt-0.5 text-center">
            {resultLine ? (
              <span className="text-foreground text-sm font-semibold leading-tight">
                {resultLine}
              </span>
            ) : null}
            <PoolPrizeBlock
              isContestVariant={isContestVariant}
              maxPrizePool={maxPrizePool}
              entryFee={entryFee}
              className="items-center"
            />
            {tapHint ? (
              <span className="text-muted-foreground text-center text-[10px] font-medium leading-tight">
                {tapHint}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <TeamOrb label={teamB} logoUrl={teamBLogo} showCaption={false} />
          </div>
        </div>
      </div>
    );
  }

  if (completedHasShort) {
    return (
      <div className="space-y-2 px-6 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,10rem)_minmax(0,1fr)] items-start gap-x-2">
          <div className="flex justify-center pt-0.5">
            <TeamOrb label={teamA} logoUrl={teamALogo} showCaption={false} />
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1.5 px-0.5 text-center">
            {resultLine ? (
              <span className="text-foreground text-sm font-semibold leading-tight">
                {resultLine}
              </span>
            ) : null}
            <MatchShortScore
              snapshot={liveSnap}
              className="text-foreground/90 text-sm font-medium"
            />
            <PoolPrizeBlock
              isContestVariant={isContestVariant}
              maxPrizePool={maxPrizePool}
              entryFee={entryFee}
              className="items-center"
            />
            {tapHint ? (
              <span className="text-muted-foreground text-center text-[10px] font-medium leading-tight">
                {tapHint}
              </span>
            ) : null}
          </div>
          <div className="flex justify-center pt-0.5">
            <TeamOrb label={teamB} logoUrl={teamBLogo} showCaption={false} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/** Upcoming: same 3-column grid as live/completed band — orbs + center countdown + pool. */
function UpcomingScoreBand({
  teamA,
  teamB,
  teamALogo,
  teamBLogo,
  countdownLine,
  isContestVariant,
  maxPrizePool,
  entryFee,
  tapHint,
  venueLine,
  stageLine,
  matchFormat,
}: {
  teamA: string;
  teamB: string;
  teamALogo: string | null;
  teamBLogo: string | null;
  countdownLine: string;
  isContestVariant: boolean;
  maxPrizePool: number;
  entryFee?: number;
  tapHint: string | null;
  venueLine?: string | null;
  stageLine?: string | null;
  matchFormat?: string | null;
}) {
  return (
    <div className="px-6 pb-3">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,10rem)_minmax(0,1fr)] items-start gap-x-2">
        <div className="flex justify-center pt-1">
          <TeamOrb label={teamA} logoUrl={teamALogo} showCaption={false} />
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1.5 px-0.5 text-center">
          <span className="text-muted-foreground text-xs font-medium tabular-nums leading-snug">
            {countdownLine}
          </span>
          {venueLine ? (
            <span className="text-muted-foreground max-w-full text-[11px] leading-snug">
              {venueLine}
            </span>
          ) : null}
          {stageLine ? (
            <span className="text-muted-foreground/90 max-w-full text-[11px] leading-snug">
              {stageLine}
            </span>
          ) : null}
          {matchFormat ? (
            <span className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-wide">
              {matchFormat}
            </span>
          ) : null}
          <PoolPrizeBlock
            isContestVariant={isContestVariant}
            maxPrizePool={maxPrizePool}
            entryFee={entryFee}
            className="items-center"
          />
          {tapHint ? (
            <span className="text-muted-foreground max-w-full text-center text-[10px] font-medium leading-tight">
              {tapHint}
            </span>
          ) : null}
        </div>
        <div className="flex justify-center pt-1">
          <TeamOrb label={teamB} logoUrl={teamBLogo} showCaption={false} />
        </div>
      </div>
    </div>
  );
}

/** Live match: orbs + center short score + pool/prize. */
function LiveScoreBand({
  teamA,
  teamB,
  teamALogo,
  teamBLogo,
  liveSnap,
  smFixtureStatus,
  smFixtureNote,
  isContestVariant,
  maxPrizePool,
  entryFee,
  tapHint,
}: {
  teamA: string;
  teamB: string;
  teamALogo: string | null;
  teamBLogo: string | null;
  liveSnap: LiveSnapshot | null;
  smFixtureStatus: string | null | undefined;
  smFixtureNote: string | null | undefined;
  isContestVariant: boolean;
  maxPrizePool: number;
  entryFee?: number;
  tapHint: string | null;
}) {
  const centerLine = matchCardLiveCenterLine(
    smFixtureStatus,
    smFixtureNote,
  );
  return (
    <div className="px-6 pb-3">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,10rem)_minmax(0,1fr)] items-start gap-x-2">
        <div className="flex justify-center pt-1">
          <TeamOrb label={teamA} logoUrl={teamALogo} showCaption={false} />
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1.5 px-0.5 text-center">
          {centerLine ? (
            <span
              className={cn(
                "min-w-0 max-w-full font-medium text-xs leading-snug",
                smFixtureToneHeadlineClass(centerLine.tone),
                centerLine.tone === "live" && "tabular-nums",
              )}
            >
              {centerLine.text}
            </span>
          ) : null}
          <MatchShortScore
            snapshot={liveSnap}
            className="text-foreground/90 text-sm font-medium"
          />
          <PoolPrizeBlock
            isContestVariant={isContestVariant}
            maxPrizePool={maxPrizePool}
            entryFee={entryFee}
            className="items-center"
          />
          {tapHint ? (
            <span className="text-muted-foreground text-center text-[10px] font-medium leading-tight">
              {tapHint}
            </span>
          ) : null}
        </div>
        <div className="flex justify-center pt-1">
          <TeamOrb label={teamB} logoUrl={teamBLogo} showCaption={false} />
        </div>
      </div>
    </div>
  );
}

export function HomeUpcomingCard({
  match,
  linkHref,
  variant = "home",
}: {
  match: HomeMatchCardModel;
  linkHref?: string | false;
  variant?: "home" | "contest";
}) {
  const [countdown, setCountdown] = useState("—");
  const teamA = match.team_a?.trim() || match.name.split(/\s+vs\s+/i)[0]?.trim() || "Team A";
  const teamB =
    match.team_b?.trim() ||
    match.name.split(/\s+vs\s+/i)[1]?.trim() ||
    "Team B";

  const statusKey = match.status.toLowerCase();
  const isCompleted = statusKey === "completed" || statusKey === "in_review";
  const isLive = statusKey === "live";
  const isUpcoming = statusKey === "upcoming";
  const liveSnap = parseLiveSnapshot(match.live_snapshot);

  useEffect(() => {
    if (isCompleted) return;
    function tick() {
      setCountdown(formatMatchCountdownCoarse(msUntilStart(match.start_time)));
    }
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [match.start_time, isCompleted]);

  const href = linkHref === false ? null : (linkHref ?? `/matches/${match.id}`);
  const isContestVariant = variant === "contest";
  const completedTeamLines =
    isCompleted && liveSnap ? completedTeamScoreLines(liveSnap) : [];
  const completedResultLine =
    isCompleted && liveSnap ? formatMatchResultSummary(liveSnap) : null;
  const completedHasShort =
    Boolean(isCompleted && liveSnap && !isSnapshotShortLinePlaceholder(liveSnap));

  const tapHintCenter =
    isContestVariant
      ? null
      : isUpcoming
        ? "Tap to create or join"
        : "Tap for contests";

  const completedBand =
    isCompleted && liveSnap
      ? CompletedScoreBand({
          teamA,
          teamB,
          teamALogo: match.team_a_logo_url,
          teamBLogo: match.team_b_logo_url,
          lines: completedTeamLines,
          liveSnap,
          completedHasShort,
          resultLine: completedResultLine,
          isContestVariant,
          maxPrizePool: match.max_prize_pool,
          entryFee: match.entry_fee,
          tapHint: tapHintCenter,
        })
      : null;

  const completedBandVisible =
    completedBand != null &&
    (completedTeamLines.length >= 1 ||
      (completedTeamLines.length === 0 && completedHasShort));

  const openMatchAria =
    isUpcoming
      ? "Open match — create or join contests"
      : isLive
        ? "Open match — view contests and live scores"
        : "Open match — view contests and results";

  const cardBody = (
    <>
      <CardHeader className="pb-2">
        {match.tournament_name ? (
          <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
            {match.tournament_name}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">
            {teamA} <span className="text-muted-foreground font-normal">vs</span>{" "}
            {teamB}
          </CardTitle>
          <MatchStatusBadge status={match.status} className="shrink-0" />
        </div>
        <MatchTossLines
          teamA={match.team_a ?? null}
          teamB={match.team_b ?? null}
          localteamId={match.localteam_id ?? null}
          visitorteamId={match.visitorteam_id ?? null}
          tossWinnerTeamId={match.toss_winner_team_id ?? null}
          tossDecision={match.toss_decision ?? null}
          className="pt-1 text-xs"
        />
        <FixtureSmStatusLine
          label={match.sm_fixture_status}
          note={match.sm_fixture_note}
          compact
          className="pt-1"
          showNote={!isLive}
        />
        {isCompleted ? (
          <>
            <CardDescription className="block w-full pt-1 pb-0 text-center">
              <span
                className="text-muted-foreground tabular-nums text-xs"
                suppressHydrationWarning
              >
                Played {playedAtLabel(match.start_time)}
              </span>
            </CardDescription>
            {completedBandVisible ? (
              completedBand
            ) : (
              <>
                <CardDescription className="flex flex-col gap-1 pt-1">
                  {liveSnap && completedResultLine ? (
                    <span className="text-foreground/90 text-sm font-semibold">
                      {completedResultLine}
                    </span>
                  ) : null}
                  <PoolPrizeBlock
                    isContestVariant={isContestVariant}
                    maxPrizePool={match.max_prize_pool}
                    entryFee={match.entry_fee}
                  />
                </CardDescription>
                <div className="flex items-center justify-between px-6 pb-4 pt-1">
                  <TeamOrb label={teamA} logoUrl={match.team_a_logo_url} />
                  <span className="text-muted-foreground max-w-[7rem] text-center text-xs font-medium leading-tight">
                    {isContestVariant ? "Contest match" : "Tap for contests"}
                  </span>
                  <TeamOrb label={teamB} logoUrl={match.team_b_logo_url} />
                </div>
              </>
            )}
          </>
        ) : isLive ? (
          <>
            <CardDescription className="block w-full pt-1 pb-0 text-center">
              <span
                className="text-muted-foreground tabular-nums text-xs"
                suppressHydrationWarning
              >
                Started {playedAtLabel(match.start_time)}
              </span>
            </CardDescription>
            <LiveScoreBand
              teamA={teamA}
              teamB={teamB}
              teamALogo={match.team_a_logo_url}
              teamBLogo={match.team_b_logo_url}
              liveSnap={liveSnap}
              smFixtureStatus={match.sm_fixture_status}
              smFixtureNote={match.sm_fixture_note}
              isContestVariant={isContestVariant}
              maxPrizePool={match.max_prize_pool}
              entryFee={match.entry_fee}
              tapHint={tapHintCenter}
            />
          </>
        ) : (
          <>
            <CardDescription className="block w-full pt-1 pb-0 text-center">
              <span
                className="text-muted-foreground tabular-nums text-xs"
                suppressHydrationWarning
              >
                Starts {playedAtLabel(match.start_time)}
              </span>
            </CardDescription>
            <UpcomingScoreBand
              teamA={teamA}
              teamB={teamB}
              teamALogo={match.team_a_logo_url}
              teamBLogo={match.team_b_logo_url}
              countdownLine={`Starts in ${countdown}`}
              isContestVariant={isContestVariant}
              maxPrizePool={match.max_prize_pool}
              entryFee={match.entry_fee}
              tapHint={tapHintCenter}
              venueLine={match.venue_line ?? null}
              stageLine={match.stage_line ?? null}
              matchFormat={match.match_format ?? null}
            />
          </>
        )}
      </CardHeader>
    </>
  );

  const cardShellClass = cn(
    href && "tap-app transition-colors hover:border-primary/40 hover:bg-card/90",
  );

  const linkedCard = (
    <Card className={cardShellClass}>
      {cardBody}
    </Card>
  );

  if (!href) {
    return (
      <div className="list-none">
        <Card>{cardBody}</Card>
      </div>
    );
  }

  return (
    <li className="list-none">
      <Link href={href} className="block" aria-label={openMatchAria}>
        {linkedCard}
      </Link>
    </li>
  );
}
