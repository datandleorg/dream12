"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MAX_CREDITS, SQUAD_SIZE } from "@/lib/fantasy/rules";
import { useTeamBuilderStore } from "@/stores/team-builder";
import type { TeamFlowMatchRow } from "@/lib/team-flow-data";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/loading-overlay";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { LineupConflictBanner } from "@/components/team-flow/lineup-conflict-banner";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { MatchTossLines } from "@/components/match-toss-lines";
import { useMatchTossLive } from "@/lib/hooks/use-match-toss-live";
import {
  createSavedMatchTeamAction,
  updateSavedMatchTeamAction,
} from "@/app/actions/saved-match-teams";

export function SavedMatchTeamPreview({
  matchId,
  match,
  mode,
  savedTeamId,
  slot,
  stepQuerySuffix = "",
  afterSaveHref,
}: {
  matchId: number;
  match: TeamFlowMatchRow;
  mode: "create" | "edit";
  savedTeamId?: string;
  slot?: number;
  /** Preserve `returnTo` across squad/captain/preview */
  stepQuerySuffix?: string;
  /** Validated internal path after save (e.g. pick-team) */
  afterSaveHref?: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const selected = useTeamBuilderStore((s) => s.selected);
  const captainId = useTeamBuilderStore((s) => s.captainId);
  const viceCaptainId = useTeamBuilderStore((s) => s.viceCaptainId);

  const base =
    mode === "edit" && savedTeamId
      ? `/matches/${matchId}/teams/${savedTeamId}`
      : `/matches/${matchId}/teams/create`;

  const teamA = match.team_a?.trim() || "Team A";
  const teamB = match.team_b?.trim() || "Team B";
  const title =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  const creditsUsed = selected.reduce((s, p) => s + p.credit_value, 0);
  const creditsLeft = MAX_CREDITS - creditsUsed;
  const lineupConflictSelected = countSelectedNotInPlayingXi(selected);
  const rosterLocked = isTeamEditLocked(match.status);

  const { tossWinnerTeamId, tossDecision } = useMatchTossLive(matchId, {
    toss_winner_team_id: match.toss_winner_team_id,
    toss_decision: match.toss_decision,
  });

  const capVcReady = Boolean(
    captainId && viceCaptainId && captainId !== viceCaptainId,
  );
  const canSave = selected.length === SQUAD_SIZE && capVcReady && !rosterLocked;

  useEffect(() => {
    if (selected.length === 0) {
      router.replace(`${base}/squad${stepQuerySuffix}`);
      return;
    }
    if (
      selected.length === SQUAD_SIZE &&
      (!captainId || !viceCaptainId || captainId === viceCaptainId)
    ) {
      router.replace(`${base}/captain${stepQuerySuffix}`);
    }
  }, [
    selected.length,
    captainId,
    viceCaptainId,
    router,
    base,
    stepQuerySuffix,
  ]);

  async function onSave() {
    if (!canSave || !captainId || !viceCaptainId) return;
    setSaving(true);
    const playerIds = selected.map((p) => p.id);
    const res =
      mode === "edit" && savedTeamId
        ? await updateSavedMatchTeamAction({
            matchId,
            savedTeamId,
            playerIds,
            captainId,
            viceCaptainId,
          })
        : await createSavedMatchTeamAction({
            matchId,
            playerIds,
            captainId,
            viceCaptainId,
          });
    if (!res.ok) {
      setSaving(false);
      toast.error(res.message);
      return;
    }
    toast.success(mode === "edit" ? "Team updated" : "Team saved");
    router.push(afterSaveHref ?? `/matches/${matchId}/teams`);
    router.refresh();
  }

  const label =
    mode === "edit" && slot != null ? `Edit T${slot}` : "Create match team";

  return (
    <div className="relative flex flex-col gap-3 pb-28">
      <LoadingOverlay show={saving} label="Saving…" />

      <div className="px-1">
        <p className="text-muted-foreground text-sm">{label}</p>
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        <MatchTossLines
          teamA={teamA}
          teamB={teamB}
          localteamId={match.localteam_id}
          visitorteamId={match.visitorteam_id}
          tossWinnerTeamId={tossWinnerTeamId}
          tossDecision={tossDecision}
          className="mt-1 text-xs"
        />
      </div>

      {lineupConflictSelected > 0 ? (
        <LineupConflictBanner
          count={lineupConflictSelected}
          editHref={`${base}/squad${stepQuerySuffix}`}
          matchStatus={match.status}
        />
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

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed left-0 right-0 z-30 border-t p-3 backdrop-blur md:left-1/2 md:max-w-md md:-translate-x-1/2" style={{ bottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={!canSave}
            onClick={() => void onSave()}
          >
            {mode === "edit" ? "Save changes" : "Save team"}
          </Button>
          <Link
            href={`${base}/captain${stepQuerySuffix}`}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "inline-flex min-h-11 w-full items-center justify-center",
            )}
          >
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
