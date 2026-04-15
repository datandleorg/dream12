"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Wallet } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LoadingOverlay } from "@/components/loading-overlay";
import { NotificationsHeaderMenu } from "@/components/notifications-header-menu";
import type { NotificationRow } from "@/lib/notifications";
import { safeInternalPath } from "@/lib/safe-return-to";

function formatBalanceChip(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function AppHeader({
  userId,
  initialBalance,
  unreadNotifications = 0,
  notificationPreview = [],
}: {
  userId: string;
  initialBalance: number;
  unreadNotifications?: number;
  notificationPreview?: NotificationRow[];
}) {
  const [reloading, setReloading] = useState(false);
  const searchParams = useSearchParams();
  const returnTo = useMemo(
    () => safeInternalPath(searchParams.get("returnTo")),
    [searchParams],
  );
  const bal = Number(initialBalance);
  const walletHref = returnTo ? `/wallet?returnTo=${encodeURIComponent(returnTo)}` : "/wallet";

  return (
    <>
      <LoadingOverlay show={reloading} label="Reloading…" />
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 mb-1 flex items-center justify-between gap-2 border-b px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <BrandLogo variant="compact" />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="text-foreground hover:bg-muted/80 inline-flex size-9 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-60"
          aria-label="Refresh page"
          title="Reload the app — useful when installed as a PWA to fetch the latest content"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.location.reload();
              });
            });
          }}
        >
          <RefreshCw className={`size-5 ${reloading ? "animate-spin" : ""}`} aria-hidden />
        </button>
        <NotificationsHeaderMenu
          userId={userId}
          initialPreview={notificationPreview}
          unreadCount={unreadNotifications}
        />
        <Link
          href={walletHref}
          className="text-foreground hover:bg-muted/80 inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-md px-2 py-1 text-sm font-semibold tabular-nums transition-colors sm:max-w-none"
          title={`Wallet · ₹${bal.toFixed(2)}`}
        >
          <Wallet className="size-5 shrink-0" aria-hidden />
          {formatBalanceChip(bal)}
        </Link>
      </div>
    </header>
    </>
  );
}
