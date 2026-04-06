"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
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
import { applySavedTeamToContestAction } from "@/app/actions/saved-match-teams";

export type SavedTeamChoice = { id: string; slot: number };

export function JoinContestButton({
  matchId,
  contestId,
  entryFee,
  balance,
  label = "Join",
  disabled = false,
  disabledReason,
  savedTeams = [],
}: {
  matchId: number;
  contestId: string;
  entryFee: number;
  balance: number;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** When non-empty and user can afford entry, join opens a chooser: saved Tn vs new team. */
  savedTeams?: SavedTeamChoice[];
}) {
  const router = useRouter();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [applying, startApply] = useTransition();
  const fee = Number(entryFee);
  const bal = Number(balance);
  const short = Math.max(0, fee - bal);
  const squadHref = `/matches/${matchId}/contests/${contestId}/squad`;

  function openJoinPath() {
    if (savedTeams.length > 0) {
      setChooseOpen(true);
      return;
    }
    setNavigating(true);
    router.push(squadHref);
  }

  function onJoin() {
    if (disabled) return;
    if (fee > bal) {
      setBalanceOpen(true);
      return;
    }
    openJoinPath();
  }

  function goNewTeam() {
    setChooseOpen(false);
    setNavigating(true);
    router.push(squadHref);
  }

  function applySaved(savedTeamId: string, rosterOnly: boolean) {
    startApply(async () => {
      const res = await applySavedTeamToContestAction({
        matchId,
        contestId,
        savedTeamId,
        rosterOnly,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setChooseOpen(false);
      router.refresh();
      if (rosterOnly) {
        router.push(`/matches/${matchId}/contests/${contestId}/captain`);
      } else {
        router.push(`/contests/${contestId}`);
      }
    });
  }

  return (
    <>
      <LoadingOverlay
        show={navigating || applying}
        label={applying ? "Applying team…" : "Opening squad…"}
      />
      <Button
        type="button"
        className="min-h-11 w-full sm:flex-1"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => onJoin()}
      >
        {disabled ? "Join (locked)" : label}
      </Button>

      <Sheet open={chooseOpen} onOpenChange={setChooseOpen}>
        <SheetContent side="bottom" className="max-h-[min(90dvh,32rem)] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>How do you want to join?</SheetTitle>
            <SheetDescription>
              Use a saved match team (T1, T2, …) or build a new XI for this contest.
            </SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto px-1 py-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full justify-start text-left font-normal"
              disabled={applying}
              onClick={() => goNewTeam()}
            >
              <span className="font-semibold">Build new team</span>
              <span className="text-muted-foreground block text-xs">
                Pick squad, captain, and vice-captain from scratch
              </span>
            </Button>
            {savedTeams.map((t) => (
              <div
                key={t.id}
                className="border-border flex flex-col gap-1.5 rounded-xl border p-3"
              >
                <p className="text-sm font-semibold">T{t.slot}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-10 flex-1"
                    disabled={applying}
                    onClick={() => applySaved(t.id, true)}
                  >
                    Use XI · set C / VC
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="min-h-10 flex-1"
                    disabled={applying}
                    onClick={() => applySaved(t.id, false)}
                  >
                    Quick join
                  </Button>
                </div>
                <p className="text-muted-foreground text-[11px] leading-snug">
                  Quick join uses the same captain and vice-captain as the saved team and completes entry
                  (wallet debit if applicable).
                </p>
              </div>
            ))}
          </div>
          <SheetFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full"
              onClick={() => setChooseOpen(false)}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={balanceOpen} onOpenChange={setBalanceOpen}>
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
              href={`/wallet?returnTo=${encodeURIComponent(squadHref)}`}
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
              onClick={() => setBalanceOpen(false)}
            >
              Not now
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
