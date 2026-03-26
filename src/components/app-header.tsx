"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { WalletTopUpSheet } from "@/components/wallet-top-up-sheet";
import { safeInternalPath } from "@/lib/safe-return-to";

function formatBalanceChip(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function AppHeader({ initialBalance }: { initialBalance: number }) {
  const searchParams = useSearchParams();
  const returnTo = useMemo(
    () => safeInternalPath(searchParams.get("returnTo")),
    [searchParams],
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const bal = Number(initialBalance);

  return (
    <>
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 mb-1 flex items-center justify-between gap-2 border-b px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <BrandLogo variant="compact" />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="text-foreground hover:bg-muted/80 max-w-[7rem] truncate rounded-md px-2 py-1 text-sm font-semibold tabular-nums transition-colors sm:max-w-none"
            title={`Balance ₹${bal.toFixed(2)} — tap to add money`}
            onClick={() => setSheetOpen(true)}
          >
            {formatBalanceChip(bal)}
          </button>
          <Button
            type="button"
            variant="default"
            size="icon-sm"
            className="shrink-0"
            aria-label="Add money"
            onClick={() => setSheetOpen(true)}
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      </header>
      <WalletTopUpSheet open={sheetOpen} onOpenChange={setSheetOpen} returnTo={returnTo} />
    </>
  );
}
