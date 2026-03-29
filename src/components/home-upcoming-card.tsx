"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FixtureSmStatusLine } from "@/components/fixture-sm-status-line";
import { MatchShortScore } from "@/components/match-short-score";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { parseLiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
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
  sm_fixture_status?: string | null;
  /** Shown on contest leaderboard hero (second line under pool). */
  entry_fee?: number;
};

function TeamOrb({
  label,
  logoUrl,
}: {
  label: string;
  logoUrl: string | null;
}) {
  const initials = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="border-border/80 bg-secondary/80 flex size-12 items-center justify-center overflow-hidden rounded-full border text-xs font-bold">
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
      <span className="text-muted-foreground max-w-[4.5rem] truncate text-center text-[10px] font-medium">
        {label}
      </span>
    </div>
  );
}

export function HomeUpcomingCard({
  match,
  linkHref,
  variant = "home",
}: {
  match: HomeMatchCardModel;
  /** Default `/matches/${match.id}`. Set `false` for static card (no navigation). */
  linkHref?: string | false;
  /** `contest`: pool + entry copy, no “tap” hint. */
  variant?: "home" | "contest";
}) {
  const [countdown, setCountdown] = useState("—");
  const teamA = match.team_a?.trim() || match.name.split(/\s+vs\s+/i)[0]?.trim() || "Team A";
  const teamB =
    match.team_b?.trim() ||
    match.name.split(/\s+vs\s+/i)[1]?.trim() ||
    "Team B";

  const statusKey = match.status.toLowerCase();
  const isCompleted = statusKey === "completed";
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

  const card = (
    <Card
      className={cn(
        href && "tap-app cursor-pointer transition-colors hover:border-primary/40 hover:bg-card/90",
      )}
    >
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
        <FixtureSmStatusLine label={match.sm_fixture_status} className="pt-0.5" />
        <CardDescription className="flex flex-col gap-1 pt-1">
          {isCompleted ? (
            <span className="tabular-nums" suppressHydrationWarning>
              Played{" "}
              {new Date(match.start_time).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : isLive ? (
            <span className="flex flex-col gap-1">
              <span className="font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
                Match in progress
              </span>
              <MatchShortScore
                snapshot={liveSnap}
                className="text-foreground/90 font-normal"
              />
            </span>
          ) : (
            <span className="tabular-nums">Starts in {countdown}</span>
          )}
          {isContestVariant ? (
            <>
              <span
                className="text-foreground/90 text-sm font-medium tabular-nums"
                suppressHydrationWarning
              >
                Pool ₹{match.max_prize_pool.toLocaleString("en-IN")}
              </span>
              {match.entry_fee != null && Number.isFinite(match.entry_fee) ? (
                <span
                  className="text-muted-foreground text-sm font-medium tabular-nums"
                  suppressHydrationWarning
                >
                  Entry ₹{Number(match.entry_fee).toFixed(0)}
                </span>
              ) : null}
            </>
          ) : (
            <span
              className="text-foreground/90 text-sm font-medium tabular-nums"
              suppressHydrationWarning
            >
              Prize up to ₹{match.max_prize_pool.toLocaleString("en-IN")}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <div className="flex items-center justify-between px-6 pb-4">
        <TeamOrb label={teamA} logoUrl={match.team_a_logo_url} />
        <span className="text-muted-foreground max-w-[7rem] text-center text-xs font-medium leading-tight">
          {isContestVariant
            ? "Contest match"
            : isUpcoming
              ? "Tap to create or join"
              : "Tap for contests"}
        </span>
        <TeamOrb label={teamB} logoUrl={match.team_b_logo_url} />
      </div>
    </Card>
  );

  if (!href) {
    return (
      <div className="list-none">
        {card}
      </div>
    );
  }

  return (
    <li className="list-none">
      <Link
        href={href}
        className="block"
        aria-label={
          isUpcoming
            ? "Open match — create or join contests"
            : isLive
              ? "Open match — view contests and live scores"
              : "Open match — view contests and results"
        }
      >
        {card}
      </Link>
    </li>
  );
}
