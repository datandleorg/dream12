import { cn } from "@/lib/utils";
import type { LiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";

export function MatchShortScore({
  snapshot,
  className,
}: {
  snapshot: LiveSnapshot | null | undefined;
  className?: string;
}) {
  const line = snapshot?.shortLine?.trim();
  if (!line) return null;
  return (
    <p
      className={cn(
        "text-muted-foreground text-sm font-medium leading-snug tabular-nums",
        className,
      )}
    >
      {line}
    </p>
  );
}
