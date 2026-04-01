import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/lib/format-status-ui";
import { cn } from "@/lib/utils";

/** Same label typography as the upcoming chip (compact caps look on match cards). */
const statusLabelTypography =
  "h-6 min-h-6 rounded-md px-2.5 py-0 text-[10px] font-bold tracking-widest leading-none";

/**
 * Distinct styles for `public.matches.status`: upcoming | live | in_review | completed.
 * Live uses a green pulsing dot. In review uses violet (vs upcoming amber).
 */
export function MatchStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = status.toLowerCase().trim();
  const text = formatStatusLabel(status);

  if (key === "live") {
    return (
      <Badge
        variant="outline"
        className={cn(
          statusLabelTypography,
          "gap-1.5 border-0 bg-emerald-600 text-white shadow-sm",
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
          statusLabelTypography,
          "border-violet-500/55 bg-violet-500/12 text-violet-950 shadow-sm",
          "dark:border-violet-400/50 dark:bg-violet-500/22 dark:text-violet-100",
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
          statusLabelTypography,
          "border border-zinc-300/80 bg-zinc-100 text-zinc-800 shadow-sm",
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
        "inline-flex w-fit shrink-0 items-center justify-center",
        statusLabelTypography,
        "border border-amber-600/30 bg-amber-400 text-amber-950 shadow-sm",
        "dark:border-amber-300/40 dark:bg-amber-400 dark:text-amber-950",
        className,
      )}
    >
      {text}
    </span>
  );
}
