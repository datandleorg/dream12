"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type MatchListFilter = "live" | "upcoming" | "completed";

const TABS: { value: MatchListFilter; label: string; href: string }[] = [
  { value: "live", label: "Live", href: "/" },
  { value: "upcoming", label: "Upcoming", href: "/?filter=upcoming" },
  { value: "completed", label: "Completed", href: "/?filter=completed" },
];

export function MatchListFilterTabs() {
  const sp = useSearchParams();
  const raw = sp.get("filter");
  const active: MatchListFilter =
    raw === "upcoming" || raw === "completed" ? raw : "live";

  return (
    <div
      className="bg-muted/50 flex gap-1 rounded-xl border p-1"
      role="tablist"
      aria-label="Match status filter"
    >
      {TABS.map(({ value, label, href }) => {
        const isOn = active === value;
        return (
          <Link
            key={value}
            href={href}
            scroll={false}
            role="tab"
            aria-selected={isOn}
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
  );
}
