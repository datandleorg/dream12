"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Started";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

export function FlowHeader({
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
}: {
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
}) {
  const [label, setLabel] = useState("—");

  useEffect(() => {
    const target = new Date(startIso).getTime();
    function tick() {
      setLabel(formatCountdown(target - Date.now()));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startIso]);

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
      <p className="text-muted-foreground mt-1 text-[11px]">
        Max 7 players from one team
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
