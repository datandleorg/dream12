"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListFilter, Minus, Plus } from "lucide-react";
import {
  MAX_CREDITS,
  ROLE_LIMITS,
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
import { TeamFieldPreview } from "@/components/team-flow/team-field-preview";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
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

  const lineupConflictSelected = useMemo(
    () => countSelectedNotInPlayingXi(selected),
    [selected],
  );

  const selectedA = selected.filter((p) => p.team === teamA).length;
  const selectedB = selected.filter((p) => p.team === teamB).length;

  const rc = roleCounts(players);

  const filtered = useMemo(
    () => players.filter((p) => mapRowToBuilderPlayer(p).role === roleTab),
    [players, roleTab],
  );

  const base = `/matches/${matchId}/contests/${contestId}`;
  const canContinue = selected.length === SQUAD_SIZE;

  const lim = ROLE_LIMITS[roleTab];
  const pickInstruction = `Select ${lim.min} – ${lim.max} ${ROLE_PICK_COPY[roleTab]}`;

  return (
    <div className="flex flex-col pb-28">
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

      {lineupConflictSelected > 0 ? (
        <div className="px-1 pt-2">
          <LineupConflictBanner count={lineupConflictSelected} />
        </div>
      ) : null}

      <div className="bg-[#f5f4ef] -mx-4 px-3 pt-0 pb-4 sm:px-4">
        <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as RoleKey)}>
          {/* Full-width baseline + active tab uses a thicker primary segment (Dream11-style). */}
          <div className="border-zinc-300/90 border-b">
            <TabsList
              variant="line"
              className="mb-0 h-auto w-full grid grid-cols-4 gap-0 rounded-none border-0 bg-transparent p-0 shadow-none"
            >
              {ROLE_ORDER.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  className={cn(
                    "min-h-12 flex-none rounded-none bg-transparent px-1 py-3 text-xs font-medium text-zinc-500 shadow-none",
                    "border-0 border-x-0 border-t-0 border-b-2 border-transparent pb-3",
                    "-mb-px",
                    "after:hidden",
                    "data-active:border-primary data-active:font-bold data-active:text-zinc-900",
                    "hover:text-zinc-700",
                    "dark:data-active:text-zinc-100",
                  )}
                >
                  <span className="tabular-nums">
                    {tabShort(r)} ({rc[r]})
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="mt-1 rounded-t-2xl border border-zinc-200/80 border-b-0 bg-white px-2 pt-3 pb-1 shadow-sm sm:px-3">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <p className="text-sm font-semibold text-zinc-800">{pickInstruction}</p>
            <button
              type="button"
              className="text-zinc-400 hover:text-zinc-600 shrink-0 p-1 transition-colors"
              aria-label="Filter players"
            >
              <ListFilter className="size-5" strokeWidth={2} />
            </button>
          </div>

          <div
            className="text-zinc-500 grid grid-cols-[22px_48px_minmax(0,1fr)_44px_44px_40px] items-end gap-x-1.5 gap-y-0 px-0.5 pb-2 pt-3 text-[10px] font-bold tracking-wide uppercase"
            aria-hidden
          >
            <span />
            <span />
            <span className="pl-1">Selected by</span>
            <span className="text-right">Points</span>
            <span className="text-right">Credits</span>
            <span />
          </div>

          <ul className="space-y-2 pb-2">
            {filtered.map((p) => {
              const bp = mapRowToBuilderPlayer(p);
              const isOn = selected.some((x) => x.id === p.id);
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
                    onClick={() => togglePlayer(bp)}
                    className={cn(
                      "text-left transition-colors",
                      "grid w-full grid-cols-[22px_48px_minmax(0,1fr)_44px_44px_40px] items-center gap-x-1.5 rounded-xl border py-3 pl-0.5 pr-2",
                      isOn
                        ? "border-amber-200/90 bg-amber-50/90 shadow-sm"
                        : "border-zinc-100 bg-white hover:bg-zinc-50/80",
                    )}
                  >
                    <span className="flex size-[22px] shrink-0 items-center justify-center self-center rounded-full border border-zinc-300 text-[10px] font-semibold text-zinc-500">
                      i
                    </span>
                    <div className="relative size-12 shrink-0 justify-self-start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar}
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 rounded-full border border-zinc-200 object-cover shadow-sm"
                      />
                      <span className="absolute -bottom-0.5 -left-0.5 min-w-[1.25rem] rounded border border-zinc-200 bg-white px-0.5 text-center text-[9px] font-bold leading-tight text-zinc-800 shadow-sm">
                        {badge}
                      </span>
                    </div>
                    <div className="min-w-0 pl-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold leading-tight text-zinc-900">
                          {p.name}
                        </span>
                        {p.in_playing_xi === false ? (
                          <span className="shrink-0 rounded border border-amber-400/80 bg-amber-100/90 px-1 py-px text-[9px] font-bold tracking-wide text-amber-950 uppercase">
                            Not in XI
                          </span>
                        ) : null}
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
                    <div className="flex justify-center">
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full border-2 text-zinc-600 shadow-sm transition-colors",
                          isOn
                            ? "border-zinc-300 bg-zinc-100"
                            : "border-zinc-200 bg-white",
                        )}
                      >
                        {isOn ? (
                          <Minus className="size-4 stroke-[2.5]" aria-hidden />
                        ) : (
                          <Plus className="size-4 stroke-[2.5]" aria-hidden />
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="bg-background/98 supports-[backdrop-filter]:bg-background/85 fixed bottom-16 left-0 right-0 z-30 border-t border-zinc-200/80 px-3 py-3 backdrop-blur-md md:left-1/2 md:max-w-md md:-translate-x-1/2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 flex-1 border-zinc-300 bg-white font-semibold text-zinc-800 shadow-sm"
            disabled={!canContinue}
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
            disabled={!canContinue}
            onClick={() => router.push(`${base}/captain`)}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
