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
import { LineupConflictBanner } from "@/components/team-flow/lineup-conflict-banner";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { MatchStartCountdown } from "@/components/match-start-countdown";

export function PitchPreview({
  matchId,
  contestId,
  match,
  contest,
  hasPaidEntry,
}: {
  matchId: number;
  contestId: string;
  match: TeamFlowMatchRow;
  contest: TeamFlowContestSummary;
  /** True after wallet debit / free join confirmed (not merely XI draft saved). */
  hasPaidEntry: boolean;
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
  const lineupConflictSelected = countSelectedNotInPlayingXi(selected);
  const rosterLocked = isTeamEditLocked(match.start_time);
  const picksRemaining = SQUAD_SIZE - selected.length;
  const capVcReady = Boolean(
    captainId && viceCaptainId && captainId !== viceCaptainId,
  );
  const canSaveTeam =
    selected.length === SQUAD_SIZE && capVcReady && !rosterLocked;

  useEffect(() => {
    if (selected.length === 0) {
      router.replace(`${base}/squad`);
      return;
    }
    if (
      selected.length === SQUAD_SIZE &&
      (!captainId || !viceCaptainId || captainId === viceCaptainId)
    ) {
      router.replace(`${base}/captain`);
    }
  }, [selected.length, captainId, viceCaptainId, router, base]);

  async function onSave() {
    if (
      selected.length !== SQUAD_SIZE ||
      !captainId ||
      !viceCaptainId ||
      captainId === viceCaptainId
    ) {
      return;
    }
    setSaving(true);
    const res = await saveTeamAction({
      contestId,
      matchId,
      playerIds: selected.map((p) => p.id),
      captainId,
      viceCaptainId,
    });
    if (!res.ok) {
      setSaving(false);
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
      ? `Entry fee ₹${fee.toFixed(0)} will be deducted from your wallet when you confirm below.`
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

      <div className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground">Match starts in</span>
          <MatchStartCountdown
            startIso={match.start_time}
            className="font-semibold text-foreground"
          />
        </p>
        {match.match_format ? (
          <p className="mt-0.5 text-xs">{match.match_format}</p>
        ) : null}
        {match.venue_label ? (
          <p className="mt-0.5 text-xs">{match.venue_label}</p>
        ) : null}
        {match.stage_label ? (
          <p className="mt-0.5 text-xs">{match.stage_label}</p>
        ) : null}
      </div>

      {rosterLocked ? (
        <p className="text-zinc-600 px-1 text-center text-xs dark:text-zinc-400">
          Team lock is on (1 minute before start). Saving or updating your team is no longer allowed.
        </p>
      ) : null}

      {lineupConflictSelected > 0 ? (
        <LineupConflictBanner
          count={lineupConflictSelected}
          editHref={`${base}/squad`}
          matchStartIso={match.start_time}
        />
      ) : null}

      {picksRemaining > 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-center text-sm">
          Preview only — pick {picksRemaining} more {picksRemaining === 1 ? "player" : "players"} on the squad
          step, then set captain and vice-captain to save.
        </p>
      ) : !capVcReady ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-center text-sm">
          Preview only — choose captain and vice-captain to save your team.
        </p>
      ) : null}

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
            href={
              picksRemaining > 0 || !capVcReady ? `${base}/squad` : `${base}/captain`
            }
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
            disabled={saving || !canSaveTeam}
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
              {hasPaidEntry ? "Update team?" : "Join contest?"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {hasPaidEntry ? (
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
              {!hasPaidEntry ? <span className="block">{feeLine}</span> : null}
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
              {saving ? "Saving…" : hasPaidEntry ? "Save changes" : "Confirm & join"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
