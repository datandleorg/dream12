"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BellIcon, Wallet } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { safeInternalPath } from "@/lib/safe-return-to";

function formatBalanceChip(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function AppHeader({
  initialBalance,
  unreadNotifications = 0,
}: {
  initialBalance: number;
  unreadNotifications?: number;
}) {
  const searchParams = useSearchParams();
  const returnTo = useMemo(
    () => safeInternalPath(searchParams.get("returnTo")),
    [searchParams],
  );
  const bal = Number(initialBalance);
  const walletHref = returnTo ? `/wallet?returnTo=${encodeURIComponent(returnTo)}` : "/wallet";

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 mb-1 flex items-center justify-between gap-2 border-b px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <BrandLogo variant="compact" />
      <div className="flex items-center gap-1.5">
        <Link
          href="/notifications"
          className="text-foreground hover:bg-muted/80 relative inline-flex size-9 items-center justify-center rounded-md transition-colors"
          aria-label="Notifications"
        >
          <BellIcon className="size-5" />
          {unreadNotifications > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 flex min-w-4 justify-center rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums">
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          ) : null}
        </Link>
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
  );
}
