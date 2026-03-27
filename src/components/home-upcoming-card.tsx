"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MatchStatusBadge } from "@/components/match-status-badge";
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

export function HomeUpcomingCard({ match }: { match: HomeMatchCardModel }) {
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

  useEffect(() => {
    if (isCompleted) return;
    function tick() {
      setCountdown(formatMatchCountdownCoarse(msUntilStart(match.start_time)));
    }
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [match.start_time, isCompleted]);

  const card = (
    <Card
      className={cn(
        !isUpcoming && "tap-app cursor-pointer transition-colors hover:border-primary/40 hover:bg-card/90",
        isUpcoming && "cursor-default",
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
        <CardDescription className="flex flex-col gap-1 pt-1">
          {isCompleted ? (
            <span className="tabular-nums">
              Played{" "}
              {new Date(match.start_time).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : isLive ? (
            <span className="font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
              Match in progress
            </span>
          ) : (
            <span className="tabular-nums">Starts in {countdown}</span>
          )}
          <span className="text-foreground/90 text-sm font-medium tabular-nums">
            Prize up to ₹{match.max_prize_pool.toLocaleString("en-IN")}
          </span>
        </CardDescription>
      </CardHeader>
      <div className="flex items-center justify-between px-6 pb-4">
        <TeamOrb label={teamA} logoUrl={match.team_a_logo_url} />
        <span className="text-muted-foreground max-w-[7rem] text-center text-xs font-medium leading-tight">
          {isUpcoming ? "Opens when match is live" : "Tap for contests"}
        </span>
        <TeamOrb label={teamB} logoUrl={match.team_b_logo_url} />
      </div>
    </Card>
  );

  return (
    <li>
      {isUpcoming ? (
        <div
          className="block"
          role="group"
          aria-label="Upcoming match — open for contests when the match is live"
        >
          {card}
        </div>
      ) : (
        <Link href={`/matches/${match.id}`} className="block">
          {card}
        </Link>
      )}
    </li>
  );
}
