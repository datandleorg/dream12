"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { saveSquadRosterAction } from "@/app/actions/save-team";
import { SQUAD_SIZE } from "@/lib/fantasy/rules";
import type { BuilderPlayer } from "@/stores/team-builder";
import type { SquadSavedFlow } from "@/components/team-flow/squad-picker-types";

export function SquadPickerFooter({
  teamA,
  teamB,
  selected,
  creditsLeft,
  captainId,
  viceCaptainId,
  base,
  stepQuerySuffix,
  canContinue,
  rosterLocked,
  matchId,
  contestId,
  savedFlow,
}: {
  teamA: string;
  teamB: string;
  selected: BuilderPlayer[];
  creditsLeft: number;
  captainId: string | null;
  viceCaptainId: string | null;
  base: string;
  stepQuerySuffix: string;
  canContinue: boolean;
  rosterLocked: boolean;
  matchId: number;
  contestId: string;
  savedFlow?: SquadSavedFlow;
}) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savingSquad, startSavingSquad] = useTransition();

  return (
    <div className="mt-3 shrink-0 border-t border-zinc-200/80 bg-[#f5f4ef] pt-3 pb-1">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 flex-1 border-zinc-300 bg-white font-semibold text-zinc-800 shadow-sm"
          disabled={selected.length === 0}
          onClick={() => setPreviewOpen(true)}
        >
          Team preview
        </Button>
        <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
          <SheetContent
            side="bottom"
            showCloseButton
            className="max-h-[88dvh] gap-0 rounded-t-2xl p-0"
          >
            <SheetHeader className="border-border/80 shrink-0 border-b px-4 py-3 text-left">
              <SheetTitle>Team preview</SheetTitle>
            </SheetHeader>
            <div className="bg-muted/30 min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-8">
              <TeamFieldPreview
                teamA={teamA}
                teamB={teamB}
                selected={selected}
                squadSize={SQUAD_SIZE}
                creditsLeft={creditsLeft}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
              />
            </div>
          </SheetContent>
        </Sheet>
        <Button
          type="button"
          className="min-h-12 flex-1 bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-600/90"
          disabled={!canContinue || rosterLocked || savingSquad}
          onClick={() => {
            if (rosterLocked) return;
            if (savedFlow) {
              router.push(`${base}/captain${stepQuerySuffix}`);
              return;
            }
            startSavingSquad(async () => {
              const res = await saveSquadRosterAction({
                contestId,
                matchId,
                playerIds: selected.map((p) => p.id),
              });
              if (!res.ok) {
                toast.error(res.message);
                return;
              }
              router.refresh();
              router.push(`${base}/captain${stepQuerySuffix}`);
            });
          }}
        >
          {savingSquad ? "Saving…" : "Continue"}
        </Button>
      </div>
      {selected.length > 0 ? (
        <Link
          href={`${base}/preview${stepQuerySuffix}`}
          className="mt-2 block text-center text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          Open full-screen preview
        </Link>
      ) : null}
    </div>
  );
}
