import { cn } from "@/lib/utils";

export type PlayingXiStatus = boolean | null | undefined;

function statusCopy(xi: PlayingXiStatus): { title: string; label: string } {
  if (xi === true) {
    return { title: "In playing XI", label: "In playing XI" };
  }
  if (xi === false) {
    return { title: "Not in playing XI", label: "Not in playing XI" };
  }
  return { title: "Lineup not synced", label: "Lineup not synced" };
}

type PlayingXiDotProps = {
  in_playing_xi: PlayingXiStatus;
  className?: string;
  /** Dot diameter; default matches squad list (~10px). */
  size?: "sm" | "md";
};

const SIZE_CLASS: Record<NonNullable<PlayingXiDotProps["size"]>, string> = {
  sm: "size-2.5 border-2",
  md: "size-3 border-2",
};

/**
 * Green / red / neutral dot for SportMonks playing XI sync (`players.in_playing_xi`).
 */
export function PlayingXiDot({ in_playing_xi, className, size = "sm" }: PlayingXiDotProps) {
  const { title, label } = statusCopy(in_playing_xi);
  const color =
    in_playing_xi === true
      ? "bg-emerald-500"
      : in_playing_xi === false
        ? "bg-red-500"
        : "bg-zinc-300 dark:bg-zinc-600";

  return (
    <span
      role="img"
      aria-label={label}
      title={title}
      className={cn(
        "absolute rounded-full border-white shadow-sm dark:border-zinc-900",
        SIZE_CLASS[size],
        color,
        className,
      )}
    />
  );
}
