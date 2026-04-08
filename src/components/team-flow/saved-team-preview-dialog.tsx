"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_CREDITS, SQUAD_SIZE } from "@/lib/fantasy/rules";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import type { SavedMatchTeamCardRow } from "@/lib/saved-team-flow-data";
import { playerAvatarUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

type SavedTeamPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: SavedMatchTeamCardRow;
  pitchTeamA: string;
  pitchTeamB: string;
  aShort: string;
  bShort: string;
  /** Primary action under the pitch; omit footer row when null. */
  footer: ReactNode | null;
};

export function SavedTeamPreviewDialog({
  open,
  onOpenChange,
  team: t,
  pitchTeamA,
  pitchTeamB,
  aShort,
  bShort,
  footer,
}: SavedTeamPreviewDialogProps) {
  const creditsLeft = useMemo(() => {
    const used = t.previewPlayers.reduce((s, p) => s + p.credit_value, 0);
    return Math.max(0, MAX_CREDITS - used);
  }, [t.previewPlayers]);

  const capAv = playerAvatarUrl(t.captain.photo_url, t.captain.name);
  const vcAv = playerAvatarUrl(t.viceCaptain.photo_url, t.viceCaptain.name);

  const summary = `${t.rosterCount} player${t.rosterCount === 1 ? "" : "s"} · ${aShort} ${t.countA} · ${bShort} ${t.countB}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92dvh,780px)] max-w-[min(420px,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
          "border-zinc-800 bg-zinc-950 text-zinc-50 ring-zinc-800",
          "[&_[data-slot=dialog-close]]:text-zinc-400 [&_[data-slot=dialog-close]]:hover:bg-zinc-800 [&_[data-slot=dialog-close]]:hover:text-white",
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DialogHeader className="p-4 pb-3 text-left">
            <DialogTitle className="text-xl font-bold tracking-wide text-white">
              Team {t.slot}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">{summary}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-4 px-4 pb-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-zinc-600 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capAv}
                  alt=""
                  width={48}
                  height={48}
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                  Captain
                </p>
                <p className="truncate text-sm font-semibold text-white">{t.captain.name}</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-zinc-600 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vcAv}
                  alt=""
                  width={48}
                  height={48}
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                  Vice-captain
                </p>
                <p className="truncate text-sm font-semibold text-white">{t.viceCaptain.name}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 px-2 pb-2 pt-2">
            {t.previewPlayers.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Squad preview unavailable</p>
            ) : (
              <TeamFieldPreview
                teamA={pitchTeamA}
                teamB={pitchTeamB}
                selected={t.previewPlayers}
                squadSize={SQUAD_SIZE}
                creditsLeft={creditsLeft}
                captainId={t.captainId}
                viceCaptainId={t.viceCaptainId}
              />
            )}
          </div>
        </div>

        {footer != null ? (
          <DialogFooter
            className={cn(
              "m-0 shrink-0 gap-2 rounded-b-xl border-t border-zinc-800 bg-zinc-900 p-4",
              "flex-col *:w-full sm:flex-col sm:justify-stretch",
            )}
          >
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
