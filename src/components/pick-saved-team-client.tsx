"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { applySavedTeamToContestAction } from "@/app/actions/saved-match-teams";
import { LoadingOverlay } from "@/components/loading-overlay";
import type { SavedMatchTeamCardRow } from "@/lib/saved-team-flow-data";
import { SavedMatchTeamsRadioList } from "@/components/team-flow/saved-match-teams-radio-list";

function resolvePreferredSelection(
  teams: SavedMatchTeamCardRow[],
  preferredSavedTeamId: string | null,
): string {
  if (
    preferredSavedTeamId &&
    teams.some((t) => t.id === preferredSavedTeamId)
  ) {
    return preferredSavedTeamId;
  }
  return teams[0]?.id ?? "";
}

export function PickSavedTeamClient({
  matchId,
  contestId,
  teams,
  currentContestSavedTeamId = null,
  pitchTeamA,
  pitchTeamB,
  aShort,
  bShort,
  editLocked = false,
}: {
  matchId: number;
  contestId: string;
  teams: SavedMatchTeamCardRow[];
  /** Bound template for this contest entry, if any — pre-selects the radio on Edit team. */
  currentContestSavedTeamId?: string | null;
  pitchTeamA: string;
  pitchTeamB: string;
  aShort: string;
  bShort: string;
  /** Match status — no editing saved XIs when roster is locked. */
  editLocked?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selectedId, setSelectedId] = useState(() =>
    resolvePreferredSelection(teams, currentContestSavedTeamId),
  );

  useEffect(() => {
    setSelectedId((prev) => {
      if (teams.some((t) => t.id === prev)) return prev;
      return resolvePreferredSelection(teams, currentContestSavedTeamId);
    });
  }, [teams, currentContestSavedTeamId]);

  function apply(savedTeamId: string) {
    start(async () => {
      const res = await applySavedTeamToContestAction({
        matchId,
        contestId,
        savedTeamId,
        rosterOnly: false,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Team applied");
      router.push(`/contests/${contestId}`);
      router.refresh();
    });
  }

  /** `fresh=1` clears contest draft in DB so this XI is built from scratch (not prefilled). */
  const squadHref = `/matches/${matchId}/contests/${contestId}/squad?fresh=1`;
  const editReturnToPath = `/matches/${matchId}/contests/${contestId}/pick-team`;

  return (
    <>
      <LoadingOverlay show={pending} label="Applying team…" />
      <div className="space-y-4">
        {teams.length > 0 ? (
          <>
            <SavedMatchTeamsRadioList
              matchId={matchId}
              teams={teams}
              pitchTeamA={pitchTeamA}
              pitchTeamB={pitchTeamB}
              aShort={aShort}
              bShort={bShort}
              selectedId={selectedId}
              onSelectedIdChange={setSelectedId}
              editReturnToPath={editReturnToPath}
              editLocked={editLocked}
            />
            <Button
              type="button"
              className="min-h-11 w-full"
              disabled={!selectedId || pending}
              onClick={() => selectedId && apply(selectedId)}
            >
              Continue with selected team
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            You don’t have a saved team for this match yet. Build a new XI for this contest, or create a
            reusable team from the match page first.
          </p>
        )}

        <Link
          href={squadHref}
          className={cn(
            buttonVariants({ variant: teams.length ? "secondary" : "default" }),
            "inline-flex min-h-11 w-full items-center justify-center",
          )}
        >
          {teams.length ? "Build new XI for this contest" : "Build new XI"}
        </Link>
      </div>
    </>
  );
}
