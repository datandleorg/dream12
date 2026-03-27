"use client";

import { useEffect, useState } from "react";
import { formatMatchCountdown, msUntilStart } from "@/lib/time/match-countdown";
import { cn } from "@/lib/utils";

export function MatchStartCountdown({
  startIso,
  className,
  endedLabel,
}: {
  startIso: string;
  className?: string;
  /** @default "Started" */
  endedLabel?: string;
}) {
  const [label, setLabel] = useState("—");

  useEffect(() => {
    function tick() {
      setLabel(formatMatchCountdown(msUntilStart(startIso), endedLabel));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startIso, endedLabel]);

  return <span className={cn("tabular-nums", className)}>{label}</span>;
}
