"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Full-viewport skeleton overlay while a client async action runs. */
export function LoadingOverlay({
  show,
  label = "Loading…",
  className,
}: {
  show: boolean;
  label?: string;
  className?: string;
}) {
  if (!show) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background/80 p-6 backdrop-blur-sm",
        className,
      )}
      aria-busy
      aria-live="polite"
      role="status"
    >
      <Skeleton className="size-16 shrink-0 rounded-2xl" />
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-3 w-48 max-w-full" />
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
    </div>
  );
}
