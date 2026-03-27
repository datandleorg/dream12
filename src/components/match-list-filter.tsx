"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  parseMatchListFilter,
  type MatchListFilter,
} from "@/lib/match-list-filter";
import { dispatchNavigationStart } from "@/lib/navigation-events";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TABS: { value: MatchListFilter; label: string; href: string }[] = [
  { value: "live", label: "Live", href: "/" },
  { value: "upcoming", label: "Upcoming", href: "/?filter=upcoming" },
  { value: "completed", label: "Completed", href: "/?filter=completed" },
];

/**
 * Tabs + match list area. Uses `useTransition` so tab changes show a loader until the server page updates.
 */
export function MatchListSection({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const active = parseMatchListFilter(sp.get("filter") ?? undefined);
  const [visualTab, setVisualTab] = useState<MatchListFilter>(active);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setVisualTab(active);
  }, [active]);

  return (
    <div className="space-y-3">
      <div
        className="bg-muted/50 flex gap-1 rounded-xl border p-1"
        role="tablist"
        aria-label="Match status filter"
      >
        {TABS.map(({ value, label, href }) => {
          const isOn = visualTab === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isOn}
              disabled={isPending}
              onClick={() => {
                if (value === active) return;
                setVisualTab(value);
                dispatchNavigationStart();
                startTransition(() => {
                  router.push(href, { scroll: false });
                });
              }}
              className={cn(
                "tap-app flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-semibold leading-none transition-colors sm:text-sm",
                isOn
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                isPending && "cursor-wait",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        className={cn("relative", isPending && "min-h-[min(420px,70dvh)]")}
      >
        {isPending ? (
          <div
            className="bg-background/92 dark:bg-background/95 absolute inset-0 z-20 flex flex-col gap-4 rounded-xl border border-border/60 p-4 shadow-sm backdrop-blur-sm"
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading matches"
          >
            <div className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-muted-foreground">
              <Loader2 className="size-5 shrink-0 animate-spin text-red-600" />
              <span>Loading matches…</span>
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="border-border/80 flex flex-col gap-3 rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-5 flex-1 rounded-md" />
                    <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-3/5 max-w-[14rem] rounded-md" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="size-12 shrink-0 rounded-full" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                    <Skeleton className="size-12 shrink-0 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            isPending && "pointer-events-none select-none opacity-[0.35]",
            "transition-opacity duration-200",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
