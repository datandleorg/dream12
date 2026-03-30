import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  live: "Live",
  completed: "Completed",
  in_review: "In review",
};

/**
 * Distinct styles for `public.matches.status`: upcoming | live | in_review | completed.
 * Live uses a green pulsing dot.
 */
export function MatchStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = status.toLowerCase().trim();
  const text = LABEL[key] ?? status;

  if (key === "live") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-0 bg-emerald-600 font-semibold text-white shadow-sm",
          "dark:bg-emerald-600 dark:text-white",
          className,
        )}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full bg-lime-300 shadow-[0_0_8px_rgba(190,242,100,0.95)] animate-pulse"
            aria-hidden
          />
          {text}
        </span>
      </Badge>
    );
  }

  if (key === "in_review") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-amber-500/60 bg-amber-500/15 font-semibold text-amber-950",
          "dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-100",
          className,
        )}
      >
        {text}
      </Badge>
    );
  }

  if (key === "completed") {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "border border-zinc-300/80 bg-zinc-100 font-medium text-zinc-800",
          "dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
          className,
        )}
      >
        {text}
      </Badge>
    );
  }

  /* Upcoming: solid amber chip — readable on dark card backgrounds (avoid faint sky outline). */
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center justify-center rounded-md px-2.5 text-[10px] font-bold uppercase tracking-widest",
        "border border-amber-600/30 bg-amber-400 text-amber-950 shadow-sm",
        "dark:border-amber-300/40 dark:bg-amber-400 dark:text-amber-950",
        className,
      )}
    >
      {text}
    </span>
  );
}
