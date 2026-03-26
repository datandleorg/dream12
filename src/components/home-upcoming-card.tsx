"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Live / started";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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

  useEffect(() => {
    const target = new Date(match.start_time).getTime();
    function tick() {
      setCountdown(formatCountdown(target - Date.now()));
    }
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [match.start_time]);

  return (
    <li>
      <Link href={`/matches/${match.id}`} className="block">
        <Card
          className={cn(
            "transition-colors hover:border-primary/40 hover:bg-card/90",
            "cursor-pointer",
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
              <Badge variant="secondary" className="shrink-0">
                {match.status}
              </Badge>
            </div>
            <CardDescription className="flex flex-col gap-1 pt-1">
              <span className="tabular-nums">Starts in {countdown}</span>
              <span className="text-foreground/90 text-sm font-medium tabular-nums">
                Prize up to ₹{match.max_prize_pool.toLocaleString("en-IN")}
              </span>
            </CardDescription>
          </CardHeader>
          <div className="flex items-center justify-between px-6 pb-4">
            <TeamOrb label={teamA} logoUrl={match.team_a_logo_url} />
            <span className="text-muted-foreground text-xs font-medium">Tap for contests</span>
            <TeamOrb label={teamB} logoUrl={match.team_b_logo_url} />
          </div>
        </Card>
      </Link>
    </li>
  );
}
