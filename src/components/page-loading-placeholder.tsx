import { Skeleton } from "@/components/ui/skeleton";

/** Fills `(main)` `main` while route segment loads (header + bottom nav stay visible). */
export function MainPageLoadingPlaceholder() {
  return (
    <div className="space-y-4 py-4" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-xs" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="border-border/80 bg-card/50 space-y-3 rounded-xl border p-4"
        >
          <Skeleton className="h-5 w-3/5 max-w-[200px]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function AuthPageLoadingPlaceholder() {
  return (
    <div className="flex w-full flex-col items-center py-6" aria-busy aria-label="Loading">
      <Skeleton className="mb-8 h-12 w-48 rounded-lg" />
      <div className="border-border/80 bg-card/80 w-full max-w-sm space-y-4 rounded-xl border p-6 shadow-lg">
        <Skeleton className="mx-auto h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function AdminPageLoadingPlaceholder() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading">
      <Skeleton className="h-7 w-32" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Full-viewport shimmer when root segment suspends. */
export function RootLoadingPlaceholder() {
  return (
    <div
      className="bg-background flex min-h-dvh flex-col items-center justify-center gap-4 p-6"
      aria-busy
      aria-label="Loading"
    >
      <Skeleton className="size-16 shrink-0 rounded-2xl" />
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-4 w-52 max-w-full" />
    </div>
  );
}
