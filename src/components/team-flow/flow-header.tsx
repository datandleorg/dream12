"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { MatchTossLines } from "@/components/match-toss-lines";
import { MAX_PLAYERS_SAME_FRANCHISE } from "@/lib/fantasy/rules";
import { useMatchTossLive } from "@/lib/hooks/use-match-toss-live";
import { formatMatchCountdown, msUntilStart } from "@/lib/time/match-countdown";
import { cn } from "@/lib/utils";

type FlowHeaderLiveToss = {
  matchId: number;
  teamA: string;
  teamB: string;
  localteamId: number | null;
  visitorteamId: number | null;
  tossWinnerTeamId: number | null;
  tossDecision: string | null;
};

function FlowHeaderTossBlock({
  liveToss,
  className,
}: {
  liveToss: FlowHeaderLiveToss;
  className?: string;
}) {
  const { tossWinnerTeamId, tossDecision } = useMatchTossLive(liveToss.matchId, {
    toss_winner_team_id: liveToss.tossWinnerTeamId,
    toss_decision: liveToss.tossDecision,
  });
  return (
    <MatchTossLines
      teamA={liveToss.teamA}
      teamB={liveToss.teamB}
      localteamId={liveToss.localteamId}
      visitorteamId={liveToss.visitorteamId}
      tossWinnerTeamId={tossWinnerTeamId}
      tossDecision={tossDecision}
      className={className}
    />
  );
}

function abbrTeam(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) {
    return `${w[0].slice(0, 1)}${w[1].slice(0, 1)}`.toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

type BaseProps = {
  tournamentName: string | null;
  matchTitle: string;
  teamA: string;
  teamB: string;
  startIso: string;
  selectedA: number;
  selectedB: number;
  picked: number;
  squadSize: number;
  creditsLeft: number;
  className?: string;
  liveToss?: FlowHeaderLiveToss;
};

type DefaultVariant = BaseProps & {
  variant?: "default";
  backHref?: never;
  backLabel?: never;
};

type SquadVariant = BaseProps & {
  variant: "squad";
  backHref: string;
  backLabel?: string;
};

type FlowHeaderProps = DefaultVariant | SquadVariant;

export function FlowHeader(props: FlowHeaderProps) {
  const {
    tournamentName,
    matchTitle,
    teamA,
    teamB,
    startIso,
    selectedA,
    selectedB,
    picked,
    squadSize,
    creditsLeft,
    className,
    liveToss,
  } = props;

  const [label, setLabel] = useState("—");

  useEffect(() => {
    function tick() {
      setLabel(formatMatchCountdown(msUntilStart(startIso)));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startIso]);

  if (props.variant === "squad") {
    const { backHref, backLabel = "←" } = props;
    const a = abbrTeam(teamA);
    const b = abbrTeam(teamB);

    return (
      <div
        className={cn(
          "-mx-4 border-b border-black/30 bg-[#2a2a2e] px-3 pt-2 pb-3 text-zinc-100 shadow-inner sm:px-4",
          className,
        )}
      >
        <div className="relative flex min-h-10 items-center justify-between gap-2">
          <Link
            href={backHref}
            className="text-zinc-200 hover:text-white z-10 inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-lg font-medium transition-colors"
            aria-label="Back to contests"
          >
            {backLabel}
          </Link>
          <span className="text-zinc-300 pointer-events-none absolute inset-x-0 text-center text-xs font-medium tabular-nums sm:text-sm">
            {label}
          </span>
          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-300 z-10 inline-flex size-10 items-center justify-end transition-colors"
            aria-label="Help"
          >
            <CircleHelp className="size-5 opacity-70" aria-hidden />
          </button>
        </div>

        {tournamentName ? (
          <p className="text-center text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
            {tournamentName}
          </p>
        ) : null}

        <h1 className="mt-0.5 text-center text-[11px] font-medium leading-snug text-zinc-400 sm:text-xs">
          {matchTitle}
        </h1>

        {liveToss ? (
          <FlowHeaderTossBlock
            liveToss={liveToss}
            className="mt-1.5 text-center text-[11px] leading-snug text-zinc-400"
          />
        ) : null}

        <p className="mt-2 text-center text-[11px] leading-tight text-zinc-400">
          You can select only {MAX_PLAYERS_SAME_FRANCHISE} from each team
        </p>

        <div className="mt-3 grid grid-cols-3 gap-1 text-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
              Players
            </span>
            <span className="text-lg font-bold tabular-nums text-white sm:text-xl">
              {picked}/{squadSize}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 border-x border-white/10 px-1">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold tabular-nums sm:text-sm">
              <span className="text-zinc-200">
                {a} {selectedA}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-200">
                {b} {selectedB}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
              Credits left
            </span>
            <span
              className={cn(
                "text-lg font-bold tabular-nums sm:text-xl",
                creditsLeft < 0 ? "text-red-400" : "text-emerald-400",
              )}
            >
              {creditsLeft.toFixed(1)}
            </span>
          </div>
        </div>

        <div
          className="mt-3 flex gap-1"
          role="progressbar"
          aria-valuenow={picked}
          aria-valuemin={0}
          aria-valuemax={squadSize}
          aria-label="Players selected"
        >
          {Array.from({ length: squadSize }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 min-w-0 flex-1 rounded-[2px] transition-colors",
                i < picked ? "bg-emerald-500" : "bg-white/12",
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border/80 bg-foreground/5 -mx-4 border-b px-4 py-3",
        className,
      )}
    >
      {tournamentName ? (
        <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
          {tournamentName}
        </p>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <h1 className="font-heading text-base leading-tight font-semibold sm:text-lg">
          {matchTitle}
        </h1>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {label}
        </span>
      </div>
      {liveToss ? (
        <FlowHeaderTossBlock
          liveToss={liveToss}
          className="mt-1.5 text-[11px] leading-snug"
        />
      ) : null}
      <p className="text-muted-foreground mt-1 text-[11px]">
        Max {MAX_PLAYERS_SAME_FRANCHISE} players from one team
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm font-medium">
        <span className="tabular-nums">
          {teamA} {selectedA} : {selectedB} {teamB}
        </span>
        <span className="tabular-nums">
          {picked}/{squadSize}
        </span>
      </div>
      <div className="mt-2 flex justify-end text-sm">
        <span className="text-muted-foreground">Credits left </span>
        <span
          className={cn(
            "ml-1 tabular-nums font-semibold",
            creditsLeft < 0 ? "text-destructive" : "text-primary",
          )}
        >
          {creditsLeft.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
