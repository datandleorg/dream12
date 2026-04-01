import { formatStatusLabel } from "@/lib/format-status-ui";
import { cn } from "@/lib/utils";

/**
 * Shows SportMonks `fixture.status` next to bucket badges wherever fixture details appear.
 */
export function FixtureSmStatusLine({
  label,
  className,
}: {
  label: string | null | undefined;
  className?: string;
}) {
  const t = label?.trim();
  if (!t) return null;
  return (
    <p className={cn("text-muted-foreground text-xs leading-snug", className)}>
      <span className="text-foreground/85 font-medium">Fixture status:</span>{" "}
      {formatStatusLabel(t)}
    </p>
  );
}
