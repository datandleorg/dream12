"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type { SavedMatchTeamCardRow } from "@/lib/saved-team-flow-data";
import { SavedTeamPreviewDialog } from "@/components/team-flow/saved-team-preview-dialog";
import { playerAvatarUrl } from "@/lib/avatar-url";

type SavedMatchTeamListCardProps = {
  matchId: number;
  team: SavedMatchTeamCardRow;
  pitchTeamA: string;
  pitchTeamB: string;
  aShort: string;
  bShort: string;
  /** e.g. delete control on My teams; omit on pick-team */
  headerEnd?: ReactNode;
  /** Edit = link to saved squad; none = pick flow (parent applies selection). */
  primaryAction: "edit" | "none";
  /** Inside radio row: lighter chrome */
  embedded?: boolean;
  /** Pick-team flow: title is not a link; no squad shortcuts */
  pickSelectorRow?: boolean;
  /** My teams: match not upcoming — no squad/edit links (status-based lock). */
  editLocked?: boolean;
};

/**
 * Shared card layout for saved match teams: header, franchise line, C/VC, Preview → modal pitch, primary action.
 */
export function SavedMatchTeamListCard({
  matchId,
  team: t,
  pitchTeamA,
  pitchTeamB,
  aShort,
  bShort,
  headerEnd,
  primaryAction,
  embedded = false,
  pickSelectorRow = false,
  editLocked = false,
}: SavedMatchTeamListCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const capAv = playerAvatarUrl(t.captain.photo_url, t.captain.name);
  const vcAv = playerAvatarUrl(t.viceCaptain.photo_url, t.viceCaptain.name);

  function makePrimaryFooter() {
    if (primaryAction !== "edit") return null;
    if (editLocked) {
      return (
        <span
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "inline-flex min-h-9 w-full cursor-not-allowed items-center justify-center opacity-60 sm:w-auto",
          )}
          title="Team lock is on — you can’t edit saved teams for this match."
        >
          Edit team (locked)
        </span>
      );
    }
    return (
      <Link
        href={`/matches/${matchId}/teams/${t.id}/squad`}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "inline-flex min-h-9 w-full items-center justify-center sm:w-auto",
        )}
      >
        Edit team
      </Link>
    );
  }

  const showPrimaryFooter = primaryAction !== "none";
  const modalFooter =
    showPrimaryFooter && !editLocked ? makePrimaryFooter() : null;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        embedded && "border-border/70 shadow-sm",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">
            {pickSelectorRow || (primaryAction === "edit" && editLocked) ? (
              <span>Team {t.slot}</span>
            ) : (
              <Link
                href={`/matches/${matchId}/teams/${t.id}/squad`}
                className="hover:underline"
              >
                Team {t.slot}
              </Link>
            )}
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-xs tabular-nums">
            {t.rosterCount} player{t.rosterCount === 1 ? "" : "s"} · {aShort} {t.countA}{" "}
            · {bShort} {t.countB}
          </p>
        </div>
        {headerEnd ?? null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capAv}
                alt=""
                width={44}
                height={44}
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                Captain
              </p>
              <p className="truncate text-sm font-medium leading-tight">{t.captain.name}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vcAv}
                alt=""
                width={44}
                height={44}
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                Vice-captain
              </p>
              <p className="truncate text-sm font-medium leading-tight">
                {t.viceCaptain.name}
              </p>
            </div>
          </div>
        </div>
        <div
          className={cn(
            "mt-3 flex gap-2",
            pickSelectorRow
              ? "w-full flex-col items-stretch"
              : "flex-wrap items-center",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(pickSelectorRow && "w-full justify-center py-4")}
            onClick={(e) => {
              if (pickSelectorRow) e.stopPropagation();
              setPreviewOpen(true);
            }}
          >
            Preview
          </Button>
          {showPrimaryFooter ? makePrimaryFooter() : null}
        </div>
      </CardContent>
      <SavedTeamPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        team={t}
        pitchTeamA={pitchTeamA}
        pitchTeamB={pitchTeamB}
        aShort={aShort}
        bShort={bShort}
        footer={modalFooter}
      />
    </Card>
  );
}
