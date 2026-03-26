"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveTeamAction } from "@/app/actions/save-team";
import { ROLE_ORDER, SQUAD_SIZE } from "@/lib/fantasy/rules";
import { playerAvatarUrl } from "@/lib/avatar-url";
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
import { FlowHeader } from "@/components/team-flow/flow-header";
import { MAX_CREDITS } from "@/lib/fantasy/rules";
import { cn } from "@/lib/utils";

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
  const selectedA = selected.filter((p) => p.team === teamA).length;
  const selectedB = selected.filter((p) => p.team === teamB).length;

  const byRole = useMemo(() => {
    const m: Record<string, typeof selected> = { WK: [], BAT: [], AR: [], BOWL: [] };
    for (const p of selected) {
      m[p.role]?.push(p);
    }
    return m;
  }, [selected]);

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
    <div className="flex flex-col gap-3 pb-28">
      <FlowHeader
        tournamentName={match.tournament_name}
        matchTitle={title}
        teamA={teamA}
        teamB={teamB}
        startIso={match.start_time}
        selectedA={selectedA}
        selectedB={selectedB}
        picked={selected.length}
        squadSize={SQUAD_SIZE}
        creditsLeft={creditsLeft}
      />

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

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/80 p-4",
          "bg-gradient-to-b from-emerald-950/40 via-emerald-900/25 to-emerald-950/50",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 12px,
              oklch(0.9 0.02 145) 12px,
              oklch(0.9 0.02 145) 13px
            )`,
          }}
        />
        <p className="relative mb-3 text-center text-xs font-medium tracking-wide text-emerald-100/90 uppercase">
          Pitch view
        </p>
        <div className="relative space-y-4">
          {ROLE_ORDER.map((role) => (
            <div key={role}>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
                {role}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {(byRole[role] ?? []).map((p) => {
                  const avatar = playerAvatarUrl(p.photo_url, p.name);
                  const isC = p.id === captainId;
                  const isVc = p.id === viceCaptainId;
                  return (
                    <div
                      key={p.id}
                      className="flex w-[72px] flex-col items-center gap-1 text-center"
                    >
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatar}
                          alt=""
                          className="size-12 rounded-full border-2 border-white/20 object-cover shadow-md"
                          width={48}
                          height={48}
                        />
                        {isC ? (
                          <span className="absolute -right-1 -bottom-1 rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                            C
                          </span>
                        ) : null}
                        {isVc ? (
                          <span className="absolute -bottom-1 -left-1 rounded bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                            VC
                          </span>
                        ) : null}
                      </div>
                      <span className="line-clamp-2 text-[10px] leading-tight font-medium">
                        {p.name.split(" ").pop()}
                      </span>
                      <span className="text-muted-foreground text-[9px] tabular-nums">
                        {p.credit_value.toFixed(1)} cr
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

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
