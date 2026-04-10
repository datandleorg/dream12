"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteUserContestAction } from "@/app/actions/delete-user-contest";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DeleteContestButtonProps = {
  contestId: string;
  contestTitle: string;
  entryFee: number;
  matchId: number;
  /** Users who completed join (paid or free confirm); used in confirmation copy. */
  paidParticipantsCount: number;
  /** After delete, navigate to the match page (e.g. from My contests). Default: refresh only. */
  redirectToMatchAfterDelete?: boolean;
  className?: string;
  /** Stretch button to container width (match card footer). */
  fullWidth?: boolean;
};

export function DeleteContestButton({
  contestId,
  contestTitle,
  entryFee,
  matchId,
  paidParticipantsCount,
  redirectToMatchAfterDelete = false,
  className,
  fullWidth,
}: DeleteContestButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const feeLabel =
    entryFee > 0
      ? `₹${entryFee.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
      : "₹0";

  async function onConfirm() {
    setPending(true);
    const res = await deleteUserContestAction(contestId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setOpen(false);
    toast.success("Contest removed. Players who paid were refunded to their wallet.");
    if (redirectToMatchAfterDelete) {
      router.push(`/matches/${res.matchId}`);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "border-destructive/45 text-destructive hover:bg-destructive/10",
          fullWidth && "w-full min-h-11",
          !fullWidth && "min-h-10",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4 shrink-0" aria-hidden />
        Delete contest
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && pending) return;
          setOpen(next);
        }}
      >
        <DialogContent showCloseButton className="max-h-[min(90dvh,32rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this contest?</DialogTitle>
            <DialogDescription>
              Permanently removes the contest for all players before match lock. Refund details are
              below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              You are about to remove{" "}
              <span className="font-medium text-foreground">&quot;{contestTitle}&quot;</span>. This
              cannot be undone.
            </p>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <p className="font-medium text-foreground">How refunds work</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                <li>
                  <strong className="text-foreground">Everyone who finished joining</strong> is
                  removed from the contest.{" "}
                  {entryFee > 0 ? (
                    <>
                      Each of them had{" "}
                      <strong className="text-foreground">{feeLabel}</strong> debited from their
                      Dream12 wallet when they joined. That same amount is{" "}
                      <strong className="text-foreground">credited back automatically</strong> to
                      their wallet — no UPI steps, usually instant.
                    </>
                  ) : (
                    <>
                      This contest has <strong className="text-foreground">no entry fee</strong>, so
                      there is no money to refund; players are simply unlinked from the contest.
                    </>
                  )}
                </li>
                <li>
                  Refunds apply only to players who{" "}
                  <strong className="text-foreground">completed join</strong> (full squad saved).
                  Anyone still drafting never paid, so nothing is refunded for them.
                </li>
                <li>
                  Each affected player gets an in-app notification that the host cancelled before
                  lock.
                </li>
              </ul>
            </div>
            {paidParticipantsCount > 0 ? (
              <p className="text-xs tabular-nums">
                Right now{" "}
                <strong className="text-foreground">
                  {paidParticipantsCount} player
                  {paidParticipantsCount === 1 ? "" : "s"}
                </strong>{" "}
                {paidParticipantsCount === 1 ? "has" : "have"} completed join
                {entryFee > 0 ? " and will receive the refund above" : ""}.
              </p>
            ) : (
              <p className="text-xs">
                No one has completed join yet, so no wallet refunds will run — the contest is simply
                removed.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={() => void onConfirm()}
            >
              {pending ? "Deleting…" : "Yes, delete contest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
