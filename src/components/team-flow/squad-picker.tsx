"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MAX_CREDITS,
  ROLE_ORDER,
  SQUAD_SIZE,
  type RoleKey,
} from "@/lib/fantasy/rules";
import { mockSelectionPct } from "@/lib/fantasy/mock-stats";
import { playerAvatarUrl } from "@/lib/avatar-url";
import {
  mapRowToBuilderPlayer,
  useTeamBuilderStore,
} from "@/stores/team-builder";
import type { TeamFlowMatchRow, TeamFlowPlayerRow } from "@/lib/team-flow-data";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FlowHeader } from "@/components/team-flow/flow-header";
import { LineupConflictBanner } from "@/components/team-flow/lineup-conflict-banner";
import { PlayingXiDot } from "@/components/team-flow/playing-xi-dot";
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { canAddPlayerToSquad } from "@/lib/fantasy/validate-squad";
import { saveSquadRosterAction } from "@/app/actions/save-team";
import { cn } from "@/lib/utils";

function roleCounts(players: TeamFlowPlayerRow[]) {
  const m: Record<RoleKey, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) {
    const bp = mapRowToBuilderPlayer(p);
    m[bp.role] += 1;
  }
  return m;
}

function tabShort(r: RoleKey): string {
  return r === "BOWL" ? "BWL" : r;
}

const ROLE_PICK_COPY: Record<RoleKey, string> = {
  WK: "Wicket-keepers",
  BAT: "Batsmen",
  AR: "All-rounders",
  BOWL: "Bowlers",
};

function teamBadgeLabel(teamName: string): string {
  const w = teamName.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) return `${w[0][0]}${w[1][0]}`.toUpperCase();
  return teamName.slice(0, 3).toUpperCase();
}

export function SquadPicker({
  matchId,
  contestId,
  match,
  players,
}: {
  matchId: number;
  contestId: string;
  match: TeamFlowMatchRow;
  players: TeamFlowPlayerRow[];
}) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savingSquad, startSavingSquad] = useTransition();

  const roleTab = useTeamBuilderStore((s) => s.roleTab);
  const setRoleTab = useTeamBuilderStore((s) => s.setRoleTab);
  const selected = useTeamBuilderStore((s) => s.selected);
  const captainId = useTeamBuilderStore((s) => s.captainId);
  const viceCaptainId = useTeamBuilderStore((s) => s.viceCaptainId);
  const togglePlayer = useTeamBuilderStore((s) => s.togglePlayer);

  const teamA = match.team_a?.trim() || "Team A";
  const teamB = match.team_b?.trim() || "Team B";
  const title =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  const creditsUsed = useMemo(
    () => selected.reduce((s, p) => s + p.credit_value, 0),
    [selected],
  );
  const creditsLeft = MAX_CREDITS - creditsUsed;

  const pickSelected = useMemo(
    () =>
      selected.map((x) => ({
        id: x.id,
        team: x.team,
        role: x.role,
        credit_value: x.credit_value,
      })),
    [selected],
  );

  const lineupConflictSelected = useMemo(
    () => countSelectedNotInPlayingXi(selected),
    [selected],
  );

  const selectedA = selected.filter((p) => p.team === teamA).length;
  const selectedB = selected.filter((p) => p.team === teamB).length;

  const rc = roleCounts(players);

  const rosterLocked = isTeamEditLocked(match.start_time);

  const filtered = useMemo(
    () => players.filter((p) => mapRowToBuilderPlayer(p).role === roleTab),
    [players, roleTab],
  );

  const base = `/matches/${matchId}/contests/${contestId}`;
  const canContinue = selected.length === SQUAD_SIZE;

  const pickInstruction = `Pick any ${SQUAD_SIZE} within credits · ${ROLE_PICK_COPY[roleTab]}`;

  function onTogglePlayer(bp: ReturnType<typeof mapRowToBuilderPlayer>) {
    if (rosterLocked) return;
    const isOn = selected.some((x) => x.id === bp.id);
    const pickFields = {
      id: bp.id,
      team: bp.team,
      role: bp.role,
      credit_value: bp.credit_value,
    };
    const addCheck = isOn
      ? ({ ok: true as const })
      : canAddPlayerToSquad(pickSelected, pickFields);
    if (!isOn && !addCheck.ok) {
      toast.error(addCheck.message);
      return;
    }
    const res = togglePlayer(bp);
    if (!res.ok) toast.error(res.message);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="shrink-0">
        <FlowHeader
          variant="squad"
          backHref={`/matches/${matchId}`}
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

        {rosterLocked ? (
          <p className="text-zinc-600 px-2 pt-1 text-center text-xs dark:text-zinc-400">
            Team lock is on (1 minute before start). You can review picks, but
            changes cannot be saved.
          </p>
        ) : null}

        {lineupConflictSelected > 0 ? (
          <div className="px-1 pt-2">
            <LineupConflictBanner
              count={lineupConflictSelected}
              matchStartIso={match.start_time}
            />
          </div>
        ) : null}
      </div>

      <div className="bg-[#f5f4ef] -mx-4 flex flex-col px-3 sm:px-4">
        <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as RoleKey)}>
          <div className="border-zinc-300/90 shrink-0 border-b">
            <TabsList
              variant="line"
              className="mb-0 h-auto w-full grid grid-cols-4 gap-0 rounded-none border-0 bg-transparent p-0 shadow-none"
            >
              {ROLE_ORDER.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  className={cn(
                    "group flex min-h-12 flex-none items-end justify-center rounded-none border-0 bg-transparent px-1 py-3 text-xs font-medium text-zinc-500 shadow-none",
                    "after:hidden",
                    "hover:text-zinc-700",
                  )}
                >
                  <span
                    className={cn(
                      "tabular-nums -mb-px inline-block border-b-2 border-transparent pb-0.5",
                      "group-data-[active]:border-primary group-data-[active]:font-bold group-data-[active]:text-zinc-900",
                      "dark:group-data-[active]:text-zinc-100",
                    )}
                  >
                    {tabShort(r)} ({rc[r]})
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="mt-1 flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
          <div className="shrink-0 border-b border-zinc-100 px-2 py-3 sm:px-3">
            <p className="text-sm font-semibold text-zinc-800">{pickInstruction}</p>
          </div>

          <div
            className="text-zinc-500 grid shrink-0 grid-cols-[48px_minmax(0,1fr)_44px_44px] items-end gap-x-1.5 gap-y-0 px-2 pb-2 pt-3 text-[10px] font-bold tracking-wide uppercase sm:px-3"
            aria-hidden
          >
            <span />
            <span className="pl-1">Selected by</span>
            <span className="text-right">Points</span>
            <span className="text-right">Credits</span>
          </div>

          <ul className="space-y-2 px-2 pb-3 sm:px-3">
            {filtered.length === 0 ? (
              <li className="text-zinc-500 py-6 text-center text-sm">
                No players in this role tab. Try another position.
              </li>
            ) : null}
            {filtered.map((p) => {
              const bp = mapRowToBuilderPlayer(p);
              const isOn = selected.some((x) => x.id === p.id);
              const pickFields = {
                id: bp.id,
                team: bp.team,
                role: bp.role,
                credit_value: bp.credit_value,
              };
              const addCheck = isOn
                ? ({ ok: true as const })
                : canAddPlayerToSquad(pickSelected, pickFields);
              const blockAdd = !isOn && !addCheck.ok;
              const conflictPick = isOn && p.in_playing_xi === false;
              const selPct =
                p.selection_pct != null
                  ? Number(p.selection_pct)
                  : mockSelectionPct(p.id, contestId);
              const avatar = playerAvatarUrl(p.photo_url, p.name);
              const badge = teamBadgeLabel(p.team);

              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={rosterLocked}
                    title={
                      rosterLocked
                        ? "Team is locked"
                        : blockAdd && !addCheck.ok
                          ? addCheck.message
                          : isOn
                            ? "Tap to remove from squad"
                            : "Tap to add to squad"
                    }
                    onClick={() => onTogglePlayer(bp)}
                    className={cn(
                      "text-left transition-colors",
                      "grid w-full grid-cols-[48px_minmax(0,1fr)_44px_44px] items-center gap-x-1.5 rounded-xl border py-3 pl-0.5 pr-2",
                      rosterLocked && "cursor-not-allowed opacity-80",
                      !rosterLocked && "hover:bg-zinc-50/90 active:bg-zinc-100/80 dark:hover:bg-zinc-900/40",
                      conflictPick &&
                        "ring-2 ring-rose-400/70 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950",
                      isOn && !conflictPick
                        ? "border-amber-200/90 bg-amber-50/90 shadow-sm"
                        : "border-zinc-100 bg-white",
                      blockAdd && !rosterLocked && "opacity-[0.72]",
                    )}
                  >
                    <div className="relative size-12 shrink-0 justify-self-start">
                      <div className="size-12 rounded-full border border-zinc-200 p-0.5 dark:border-zinc-600">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={avatar}
                          alt=""
                          width={48}
                          height={48}
                          className="size-full rounded-full object-cover"
                        />
                      </div>
                      <PlayingXiDot in_playing_xi={p.in_playing_xi} className="-top-0.5 -right-0.5" />
                      <span className="absolute -bottom-0.5 -left-0.5 min-w-[1.25rem] rounded border border-zinc-200 bg-white px-0.5 text-center text-[9px] font-bold leading-tight text-zinc-800 shadow-sm">
                        {badge}
                      </span>
                    </div>

                    <div className="min-w-0 pl-1">
                      <div className="truncate text-[15px] font-semibold leading-tight text-zinc-900">
                        {p.name}
                      </div>
                      <div className="text-zinc-500 mt-1 text-[11px] tabular-nums">
                        Sel by {selPct.toFixed(2)}%
                      </div>
                    </div>

                    <div className="text-right text-sm font-medium tabular-nums text-zinc-800">
                      {bp.season_points}
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-zinc-900">
                      {Number(p.credit_value).toFixed(1)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

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
                  router.push(`${base}/captain`);
                });
              }}
            >
              {savingSquad ? "Saving…" : "Continue"}
            </Button>
          </div>
          {selected.length > 0 ? (
            <Link
              href={`${base}/preview`}
              className="mt-2 block text-center text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              Open full-screen preview
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
