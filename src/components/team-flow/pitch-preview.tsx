"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveTeamAction } from "@/app/actions/save-team";
import { MAX_CREDITS, SQUAD_SIZE } from "@/lib/fantasy/rules";
import { useTeamBuilderStore } from "@/stores/team-builder";
import type {
  TeamFlowContestSummary,
  TeamFlowMatchRow,
} from "@/lib/team-flow-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/loading-overlay";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";

export function PitchPreview({
  matchId,
  contestId,
  match,
  contest,
  hasExistingTeam,
}: {
  matchId: number;
  contestId: string;
  match: TeamFlowMatchRow;
  contest: TeamFlowContestSummary;
  hasExistingTeam: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = useTeamBuilderStore((s) => s.selected);
  const captainId = useTeamBuilderStore((s) => s.captainId);
  const viceCaptainId = useTeamBuilderStore((s) => s.viceCaptainId);

  const base = `/matches/${matchId}/contests/${contestId}`;
  const teamA = match.team_a?.trim() || "Team A";
  const teamB = match.team_b?.trim() || "Team B";
  const title =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  const creditsUsed = selected.reduce((s, p) => s + p.credit_value, 0);
  const creditsLeft = MAX_CREDITS - creditsUsed;

  useEffect(() => {
    if (selected.length !== SQUAD_SIZE) {
      router.replace(`${base}/squad`);
      return;
    }
    if (!captainId || !viceCaptainId || captainId === viceCaptainId) {
      router.replace(`${base}/captain`);
    }
  }, [
    selected.length,
    captainId,
    viceCaptainId,
    router,
    base,
  ]);

  async function onSave() {
    if (selected.length !== SQUAD_SIZE || !captainId || !viceCaptainId) return;
    setSaving(true);
    const res = await saveTeamAction({
      contestId,
      matchId,
      playerIds: selected.map((p) => p.id),
      captainId,
      viceCaptainId,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setConfirmOpen(false);
    toast.success("Team saved");
    router.push(`/contests/${contestId}`);
    router.refresh();
  }

  const contestLabel = contest.name?.trim() || "this contest";
  const fee = contest.entry_fee;
  const feeLine =
    fee > 0
      ? `Entry fee ₹${fee.toFixed(0)} will be deducted from your wallet on first join only.`
      : "This contest is free to join.";

  return (
    <div className="relative flex flex-col gap-3 pb-28">
      <LoadingOverlay show={saving} label="Saving team…" />

      <div className="flex gap-2">
        <Link
          href={`${base}/captain`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "inline-flex min-h-10 items-center justify-center px-2",
          )}
        >
          ← Captain
        </Link>
      </div>

      <TeamFieldPreview
        teamA={teamA}
        teamB={teamB}
        selected={selected}
        squadSize={SQUAD_SIZE}
        creditsLeft={creditsLeft}
        captainId={captainId}
        viceCaptainId={viceCaptainId}
      />

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed bottom-16 left-0 right-0 z-30 border-t p-3 backdrop-blur md:left-1/2 md:max-w-md md:-translate-x-1/2">
        <div className="flex gap-2">
          <Link
            href={`${base}/captain`}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "inline-flex min-h-11 flex-1 items-center justify-center",
            )}
          >
            Back
          </Link>
          <Button
            type="button"
            className="min-h-11 flex-[2]"
            disabled={saving}
            onClick={() => setConfirmOpen(true)}
          >
            Save team
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && saving) return;
          setConfirmOpen(open);
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasExistingTeam ? "Update team?" : "Join contest?"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {hasExistingTeam ? (
                  <>
                    Save changes to <strong className="text-foreground">{contestLabel}</strong> for{" "}
                    <strong className="text-foreground">{title}</strong>? You will not be charged the entry
                    fee again.
                  </>
                ) : (
                  <>
                    You are about to join <strong className="text-foreground">{contestLabel}</strong> for{" "}
                    <strong className="text-foreground">{title}</strong>.
                  </>
                )}
              </span>
              {!hasExistingTeam ? <span className="block">{feeLine}</span> : null}
              <span className="block text-xs">
                Prize pool up to ₹{contest.prize_pool.toLocaleString("en-IN")}.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : hasExistingTeam ? "Save changes" : "Confirm & join"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
