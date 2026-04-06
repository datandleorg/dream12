"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MAX_CREDITS, SQUAD_SIZE } from "@/lib/fantasy/rules";
import { useTeamBuilderStore } from "@/stores/team-builder";
import type { TeamFlowMatchRow } from "@/lib/team-flow-data";
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
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { LineupConflictBanner } from "@/components/team-flow/lineup-conflict-banner";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { MatchStartCountdown } from "@/components/match-start-countdown";
import { MatchTossLines } from "@/components/match-toss-lines";
import { useMatchTossLive } from "@/lib/hooks/use-match-toss-live";
import { LoadingOverlay } from "@/components/loading-overlay";
import {
  createSavedMatchTeamAction,
  updateSavedMatchTeamAction,
} from "@/app/actions/saved-match-teams";
import { cn } from "@/lib/utils";

export function SavedTeamPitchPreview({
  matchId,
  match,
  navigationBase,
  mode,
}: {
  matchId: number;
  match: TeamFlowMatchRow;
  navigationBase: string;
  mode: { type: "create" } | { type: "edit"; savedTeamId: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = useTeamBuilderStore((s) => s.selected);
  const captainId = useTeamBuilderStore((s) => s.captainId);
  const viceCaptainId = useTeamBuilderStore((s) => s.viceCaptainId);

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

  const { tossWinnerTeamId, tossDecision } = useMatchTossLive(matchId, {
    toss_winner_team_id: match.toss_winner_team_id,
    toss_decision: match.toss_decision,
  });

  useEffect(() => {
    if (selected.length === 0) {
      router.replace(`${navigationBase}/squad`);
      return;
    }
    if (
      selected.length === SQUAD_SIZE &&
      (!captainId || !viceCaptainId || captainId === viceCaptainId)
    ) {
      router.replace(`${navigationBase}/captain`);
    }
  }, [selected.length, captainId, viceCaptainId, router, navigationBase]);

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
    const playerIds = selected.map((p) => p.id);
    const res =
      mode.type === "create"
        ? await createSavedMatchTeamAction({
            matchId,
            playerIds,
            captainId,
            viceCaptainId,
          })
        : await updateSavedMatchTeamAction({
            matchId,
            savedTeamId: mode.savedTeamId,
            playerIds,
            captainId,
            viceCaptainId,
          });
    if (!res.ok) {
      setSaving(false);
      toast.error(res.message);
      return;
    }
    setConfirmOpen(false);
    toast.success(
      mode.type === "create" ? "Match team saved as next Tn." : "Match team updated.",
    );
    router.push(`/matches/${matchId}/teams`);
    router.refresh();
  }

  return (
    <div className="relative flex flex-col gap-3 pb-28">
      <LoadingOverlay show={saving} label="Saving…" />

      <div className="flex gap-2">
        <Link
          href={`${navigationBase}/captain`}
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
        <MatchTossLines
          teamA={match.team_a}
          teamB={match.team_b}
          localteamId={match.localteam_id}
          visitorteamId={match.visitorteam_id}
          tossWinnerTeamId={tossWinnerTeamId}
          tossDecision={tossDecision}
          className="mt-2 border-t border-border/50 pt-2"
        />
      </div>

      {rosterLocked ? (
        <p className="text-zinc-600 px-1 text-center text-xs dark:text-zinc-400">
          Team lock is on — you cannot save match teams this close to start.
        </p>
      ) : null}

      {lineupConflictSelected > 0 ? (
        <LineupConflictBanner
          count={lineupConflictSelected}
          editHref={`${navigationBase}/squad`}
          matchStartIso={match.start_time}
        />
      ) : null}

      {picksRemaining > 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-center text-sm">
          Pick {picksRemaining} more on the squad step, then set captain and vice-captain.
        </p>
      ) : !capVcReady ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-center text-sm">
          Choose captain and vice-captain to save this match team.
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
              picksRemaining > 0 || !capVcReady
                ? `${navigationBase}/squad`
                : `${navigationBase}/captain`
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
            Save match team
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
              {mode.type === "create" ? "Save match team?" : "Update match team?"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {mode.type === "create" ? (
                  <>
                    This will save your XI as the next available slot (T1, T2, …) for{" "}
                    <strong className="text-foreground">{title}</strong>. You can reuse it when joining
                    contests for this match.
                  </>
                ) : (
                  <>
                    Update this saved match team for <strong className="text-foreground">{title}</strong>?
                  </>
                )}
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
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
