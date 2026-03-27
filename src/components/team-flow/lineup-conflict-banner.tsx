"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LineupConflictBanner({
  count,
  editHref,
  className,
}: {
  count: number;
  /** Squad step can omit link; contest/match surfaces pass squad URL */
  editHref?: string;
  className?: string;
}) {
  if (count <= 0) return null;

  const label =
    count === 1
      ? "1 player in your squad is not in the announced playing XI."
      : `${count} players in your squad are not in the announced playing XI.`;

  const inner = (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100",
        editHref && "pr-2",
        className,
      )}
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="font-semibold">Lineup conflict</p>
        <p className="text-amber-900/90 mt-0.5 text-xs dark:text-amber-50/90">
          {label} Update your squad if the contest still allows edits.
        </p>
      </div>
    </div>
  );

  if (editHref) {
    return (
      <Link href={editHref} className="block focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {inner}
      </Link>
    );
  }

  return inner;
}
