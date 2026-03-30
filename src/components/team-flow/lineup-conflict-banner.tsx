"use client";

import Link from "next/link";
import { AlertTriangle, Lock } from "lucide-react";
import {
  isFantasyTeamMutationLocked,
  isTeamEditLocked,
} from "@/lib/fantasy/team-lock";
import { cn } from "@/lib/utils";

export function LineupConflictBanner({
  count,
  editHref,
  matchStartIso,
  matchStatus,
  className,
}: {
  count: number;
  /** Squad step can omit link; contest/match surfaces pass squad URL */
  editHref?: string;
  /** When set, uses same lock rule as save_fantasy_team (1 min before start). */
  matchStartIso?: string;
  /** When set with matchStartIso, live matches stay editable until completed. */
  matchStatus?: string;
  className?: string;
}) {
  if (count <= 0) return null;

  const locked =
    matchStartIso != null && matchStartIso !== ""
      ? matchStatus != null && matchStatus !== ""
        ? isFantasyTeamMutationLocked(matchStatus, matchStartIso)
        : isTeamEditLocked(matchStartIso)
      : false;

  const label =
    count === 1
      ? "1 player in your squad is not in the announced playing XI."
      : `${count} players in your squad are not in the announced playing XI.`;

  const inner = (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        locked
          ? "border-zinc-400/60 bg-zinc-500/10 text-zinc-900 dark:border-zinc-500/40 dark:bg-zinc-500/15 dark:text-zinc-100"
          : "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
        editHref && !locked && "pr-2",
        className,
      )}
    >
      {locked ? (
        <Lock
          className="mt-0.5 size-4 shrink-0 text-zinc-600 dark:text-zinc-400"
          aria-hidden
        />
      ) : (
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 leading-snug">
        <p className="font-semibold">
          {locked ? "Lineup conflict (team locked)" : "Lineup conflict"}
        </p>
        <p
          className={cn(
            "mt-0.5 text-xs",
            locked
              ? "text-zinc-800/95 dark:text-zinc-50/90"
              : "text-amber-900/90 dark:text-amber-50/90",
          )}
        >
          {label}{" "}
          {locked
            ? "The deadline to edit your team (1 minute before match start) has passed, so changes can no longer be saved."
            : "Swap them on the squad step for anyone not in the playing XI, then save again."}
        </p>
      </div>
    </div>
  );

  if (editHref && !locked) {
    return (
      <Link
        href={editHref}
        className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
