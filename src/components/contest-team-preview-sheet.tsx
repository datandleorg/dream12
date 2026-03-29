"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getContestTeamBreakdown,
  type ContestTeamBreakdownResult,
} from "@/app/actions/contest-team-breakdown";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { SQUAD_SIZE } from "@/lib/fantasy/rules";

export function ContestTeamPreviewSheet({
  contestId,
  userTeamId,
  open,
  onOpenChange,
  username,
}: {
  contestId: string;
  userTeamId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<Extract<ContestTeamBreakdownResult, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userTeamId) return;
    startTransition(async () => {
      setError(null);
      setData(null);
      const res = await getContestTeamBreakdown({ contestId, userTeamId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setData(res);
    });
  }, [open, userTeamId, contestId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className="max-h-[88dvh] gap-0 rounded-t-2xl p-0 sm:max-w-lg sm:rounded-t-none"
      >
        <SheetHeader className="border-border/80 shrink-0 border-b px-4 py-3 text-left">
          <SheetTitle>Team preview</SheetTitle>
          <SheetDescription>
            {username?.trim() || "Contestant"} · fantasy points on the pitch
          </SheetDescription>
        </SheetHeader>

        <div className="bg-muted/30 min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-8">
          {pending && !data ? (
            <div className="text-muted-foreground py-6 text-sm">Loading team…</div>
          ) : error ? (
            <p className="text-destructive py-4 text-sm">{error}</p>
          ) : data ? (
            <div className="space-y-3">
              {!data.statsAvailable ? (
                <p className="text-muted-foreground bg-muted/50 rounded-lg border px-3 py-2 text-xs">
                  Live player stats are not available yet. Showing starting XI bonus and zero
                  performance until data syncs.
                </p>
              ) : null}
              <TeamFieldPreview
                teamA={data.pitch.teamA}
                teamB={data.pitch.teamB}
                selected={data.pitch.selected}
                squadSize={SQUAD_SIZE}
                creditsLeft={data.pitch.creditsLeft}
                captainId={data.pitch.captainId}
                viceCaptainId={data.pitch.viceCaptainId}
                fantasyPointsByPlayerId={data.pitch.fantasyPointsByPlayerId}
                statsRightOverride={{
                  label: "Team pts",
                  value: data.computedTotal.toFixed(1),
                }}
              />
              <p className="text-muted-foreground border-t pt-2 text-[11px]">
                Leaderboard total (stored):{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {data.storedTotal.toFixed(1)}
                </span>
                {Math.abs(data.computedTotal - data.storedTotal) > 0.5 ? (
                  <span className="mt-1 block">
                    May differ when live stats lag behind the last leaderboard update.
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
