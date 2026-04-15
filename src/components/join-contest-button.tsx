"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoadingOverlay } from "@/components/loading-overlay";

export function JoinContestButton({
  matchId,
  contestId,
  entryFee,
  balance,
  label = "Join",
  disabled = false,
  disabledReason,
}: {
  matchId: number;
  contestId: string;
  entryFee: number;
  balance: number;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const fee = Number(entryFee);
  const bal = Number(balance);
  const short = Math.max(0, fee - bal);
  const returnTo = `/matches/${matchId}/contests/${contestId}/pick-team`;

  function onJoin() {
    if (disabled) return;
    if (fee > bal) {
      setOpen(true);
      return;
    }
    setNavigating(true);
    router.push(returnTo);
  }

  return (
    <>
      <LoadingOverlay show={navigating} label="Opening squad…" />
      <Button
        type="button"
        className={cn(
          "min-h-11 w-full sm:flex-1",
          "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
          "focus-visible:border-emerald-500 focus-visible:ring-emerald-500/40",
          "disabled:hover:bg-emerald-600",
        )}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => onJoin()}
      >
        {disabled ? "Join (locked)" : label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Insufficient balance</SheetTitle>
            <SheetDescription>
              This contest needs ₹{fee.toFixed(0)}. You have ₹{bal.toFixed(0)}.
              {short > 0 ? (
                <>
                  {" "}
                  Add at least ₹{short.toFixed(0)} more to join.
                </>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Link
              href={`/wallet?returnTo=${encodeURIComponent(returnTo)}`}
              className={cn(
                buttonVariants({ variant: "default" }),
                "inline-flex min-h-11 w-full items-center justify-center",
              )}
            >
              Add money
            </Link>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full"
              onClick={() => setOpen(false)}
            >
              Not now
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
