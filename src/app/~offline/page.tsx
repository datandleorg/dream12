import Link from "next/link";

export const metadata = {
  title: "Offline — Dream12",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-wide text-foreground">
          You&apos;re offline
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Check your connection, then try again. Cached pages may still open
          while you&apos;re back online.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Go home
      </Link>
    </main>
  );
}
