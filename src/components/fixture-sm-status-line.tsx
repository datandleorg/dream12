import { Badge } from "@/components/ui/badge";
import {
  smFixtureStatusDisplayLabel,
  smFixtureStatusUiTone,
  type SmFixtureStatusUiTone,
} from "@/lib/sportmonks/match-status-from-sm";
import { cn } from "@/lib/utils";

const ALERT_FIXTURE_BADGE =
  "border-destructive/55 bg-destructive/12 text-destructive dark:border-destructive/50 dark:bg-destructive/25 dark:text-red-100";

export function smFixtureToneHeadlineClass(tone: SmFixtureStatusUiTone): string {
  switch (tone) {
    case "cancelled":
    case "interrupted":
    case "delayed":
      return "text-destructive dark:text-red-300";
    case "completed":
      return "text-zinc-700 dark:text-zinc-300";
    case "break":
      return "text-amber-800 dark:text-amber-200";
    default:
      return "text-muted-foreground";
  }
}

function toneBadgeClass(tone: SmFixtureStatusUiTone): string {
  switch (tone) {
    case "cancelled":
    case "interrupted":
    case "delayed":
      return ALERT_FIXTURE_BADGE;
    case "completed":
      return "border-zinc-400/50 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
    case "break":
      return "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:bg-amber-500/15 dark:text-amber-100";
    default:
      return "border-muted-foreground/30 bg-muted/60 text-foreground/90";
  }
}

export function FixtureSmStatusLine({
  label,
  note,
  className,
  noteClassName,
  compact,
  /** When false, only the status badge is shown (use when the note is shown elsewhere, e.g. live card center). */
  showNote = true,
}: {
  label: string | null | undefined;
  note?: string | null | undefined;
  className?: string;
  /** e.g. line-clamp on home cards */
  noteClassName?: string;
  compact?: boolean;
  showNote?: boolean;
}) {
  const t = label?.trim();
  const n = note?.trim();
  if (!t && !(showNote && n)) return null;

  const tone = smFixtureStatusUiTone(t ?? null);
  const badgeClass = toneBadgeClass(tone);
  const badgeText = t ? smFixtureStatusDisplayLabel(t) ?? t : "";

  return (
    <div className={cn("space-y-1", className)}>
      {t ? (
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs leading-snug mt-2">
          <span className="text-foreground/80 font-medium">Fixture status</span>
          <Badge
            variant="outline"
            className={cn(
              "max-w-full whitespace-normal font-medium leading-snug",
              compact ? "text-[10px]" : "text-xs",
              badgeClass,
            )}
          >
            {badgeText}
          </Badge>
        </p>
      ) : null}
      {showNote && n ? (
        <p
          className={cn(
            "text-muted-foreground text-sm leading-snug",
            compact && "line-clamp-2 text-xs",
            noteClassName,
          )}
        >
          {n}
        </p>
      ) : null}
    </div>
  );
}
