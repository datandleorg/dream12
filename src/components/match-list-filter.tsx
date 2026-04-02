"use client";

import Link from "next/link";
import type { MatchListFilter } from "@/lib/match-list-filter";
import { dispatchNavigationStart } from "@/lib/navigation-events";
import { cn } from "@/lib/utils";

const TABS: { value: MatchListFilter; label: string; href: string }[] = [
  { value: "live", label: "LIVE", href: "/?filter=live" },
  { value: "upcoming", label: "UPCOMING", href: "/?filter=upcoming" },
  { value: "completed", label: "COMPLETED", href: "/?filter=completed" },
];

/**
 * Tabs + match list. Active tab comes from the server page `filter` so it stays in sync with RSC output
 * (avoids `useSearchParams` / `router.push` mismatch where a tab click could no-op).
 */
export function MatchListSection({
  activeFilter,
  children,
}: {
  activeFilter: MatchListFilter;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div
        className="bg-muted/50 flex gap-1 rounded-xl border p-1"
        role="tablist"
        aria-label="Match status filter"
      >
        {TABS.map(({ value, label, href }) => {
          const isOn = activeFilter === value;
          return (
            <Link
              key={value}
              href={href}
              scroll={false}
              prefetch
              role="tab"
              aria-selected={isOn}
              onClick={(e) => {
                if (isOn) e.preventDefault();
                else dispatchNavigationStart();
              }}
              className={cn(
                "tap-app flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-semibold leading-none transition-colors sm:text-sm",
                isOn
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="relative">
        <div className="transition-opacity duration-200">{children}</div>
      </div>
    </div>
  );
}
