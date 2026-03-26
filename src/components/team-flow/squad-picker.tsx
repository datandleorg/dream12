"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { buttonVariants } from "@/components/ui/button-variants";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FlowHeader } from "@/components/team-flow/flow-header";
import { cn } from "@/lib/utils";

function roleCounts(players: TeamFlowPlayerRow[]) {
  const m: Record<RoleKey, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) {
    const bp = mapRowToBuilderPlayer(p);
    m[bp.role] += 1;
  }
  return m;
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

  const selectedA = selected.filter((p) => p.team === teamA).length;
  const selectedB = selected.filter((p) => p.team === teamB).length;

  const rc = roleCounts(players);

  const filtered = useMemo(
    () => players.filter((p) => mapRowToBuilderPlayer(p).role === roleTab),
    [players, roleTab],
  );

  const base = `/matches/${matchId}/contests/${contestId}`;
  const canContinue = selected.length === SQUAD_SIZE;

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

      <div className="flex items-center justify-between gap-2 text-sm">
        <Link
          href={`/matches/${matchId}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "inline-flex min-h-10 items-center justify-center px-2",
          )}
        >
          ← Contests
        </Link>
      </div>

      <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as RoleKey)}>
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
          {ROLE_ORDER.map((r) => (
            <TabsTrigger
              key={r}
              value={r}
              className="min-h-11 flex flex-col gap-0.5 py-2 text-[10px] sm:text-xs"
            >
              <span>{r}</span>
              <span className="text-muted-foreground font-normal tabular-nums">
                {rc[r]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ul className="space-y-2">
        {filtered.map((p) => {
          const bp = mapRowToBuilderPlayer(p);
          const isOn = selected.some((x) => x.id === p.id);
          const selPct =
            p.selection_pct != null
              ? Number(p.selection_pct)
              : mockSelectionPct(p.id, contestId);
          const avatar = playerAvatarUrl(p.photo_url, p.name);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => togglePlayer(bp)}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  isOn ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                )}
              >
                <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatar}
                    alt=""
                    width={44}
                    height={44}
                    className="size-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium leading-tight">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {p.team}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-[11px] tabular-nums">
                    <span>Sel {selPct.toFixed(1)}%</span>
                    <span>Pts {bp.season_points}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="secondary" className="tabular-nums">
                    {Number(p.credit_value).toFixed(1)}
                  </Badge>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isOn ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {isOn ? "✓" : "+"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed bottom-16 left-0 right-0 z-30 border-t p-3 backdrop-blur md:left-1/2 md:max-w-md md:-translate-x-1/2">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full"
            disabled={!canContinue}
            onClick={() => setPreviewOpen(true)}
          >
            Team preview
          </Button>
          <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
            <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Your XI</SheetTitle>
              </SheetHeader>
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto px-4 pb-6">
                {selected.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {p.team} · {p.role}
                    </span>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
          <Button
            type="button"
            className="min-h-11 w-full"
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
