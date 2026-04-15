"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button-variants";
import { MAX_CREDITS, SQUAD_SIZE } from "@/lib/fantasy/rules";
import { mockCaptainPct, mockVicePct } from "@/lib/fantasy/mock-stats";
import { playerAvatarUrl } from "@/lib/avatar-url";
import { useTeamBuilderStore } from "@/stores/team-builder";
import type { TeamFlowMatchRow } from "@/lib/team-flow-data";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { Button } from "@/components/ui/button";
import { FlowHeader } from "@/components/team-flow/flow-header";
import { LineupConflictBanner } from "@/components/team-flow/lineup-conflict-banner";
import { PlayingXiDot } from "@/components/team-flow/playing-xi-dot";
import { cn } from "@/lib/utils";
import type { SquadSavedFlow } from "@/components/team-flow/squad-picker-types";

export function CaptainSelector({
  matchId,
  contestId,
  match,
  savedFlow,
}: {
  matchId: number;
  contestId: string;
  match: TeamFlowMatchRow;
  savedFlow?: Pick<SquadSavedFlow, "basePath" | "stepQuerySuffix">;
}) {
  const router = useRouter();
  const selected = useTeamBuilderStore((s) => s.selected);
  const captainId = useTeamBuilderStore((s) => s.captainId);
  const viceCaptainId = useTeamBuilderStore((s) => s.viceCaptainId);
  const setCaptain = useTeamBuilderStore((s) => s.setCaptain);
  const setViceCaptain = useTeamBuilderStore((s) => s.setViceCaptain);

  const base =
    savedFlow?.basePath ?? `/matches/${matchId}/contests/${contestId}`;
  const stepQ = savedFlow?.stepQuerySuffix ?? "";
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
  const lineupConflictSelected = countSelectedNotInPlayingXi(selected);
  const rosterLocked = isTeamEditLocked(match.status);

  useEffect(() => {
    if (selected.length !== SQUAD_SIZE) {
      router.replace(`${base}/squad${stepQ}`);
    }
  }, [selected.length, router, base, stepQ]);

  const canContinue = Boolean(
    captainId && viceCaptainId && captainId !== viceCaptainId,
  );

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
        liveToss={{
          matchId,
          teamA,
          teamB,
          localteamId: match.localteam_id,
          visitorteamId: match.visitorteam_id,
          tossWinnerTeamId: match.toss_winner_team_id,
          tossDecision: match.toss_decision,
        }}
      />

      {rosterLocked ? (
        <p className="text-zinc-600 px-2 text-center text-xs dark:text-zinc-400">
          Team lock is on (match is live). Captain changes cannot be saved after the deadline.
        </p>
      ) : null}

      {lineupConflictSelected > 0 ? (
        <LineupConflictBanner
          count={lineupConflictSelected}
          editHref={`${base}/squad${stepQ}`}
          matchStatus={match.status}
        />
      ) : null}

      <Link
        href={`${base}/squad${stepQ}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "inline-flex min-h-10 w-fit items-center justify-center px-2",
        )}
      >
        ← Squad
      </Link>

      <p className="text-muted-foreground text-sm">
        Captain earns 2× points · Vice-captain 1.5×. Choose two different players.
      </p>

      <div className="space-y-2">
        {selected.map((p) => {
          const avatar = playerAvatarUrl(p.photo_url, p.name);
          const cPct = mockCaptainPct(p.id, contestId);
          const vcPct = mockVicePct(p.id, contestId);
          return (
            <div
              key={p.id}
              className="flex min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2"
            >
              <div className="relative size-11 shrink-0">
                <div className="size-11 overflow-hidden rounded-full border border-border/60 bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatar}
                    alt=""
                    width={44}
                    height={44}
                    className="size-full object-cover"
                  />
                </div>
                <PlayingXiDot
                  in_playing_xi={p.in_playing_xi}
                  className="-top-0.5 -right-0.5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-tight">{p.name}</div>
                <div className="text-muted-foreground text-[11px]">
                  {p.team} · {p.role} · {p.season_points} pts
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                  % C {cPct.toFixed(1)} · % VC {vcPct.toFixed(1)}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={captainId === p.id ? "default" : "outline"}
                  className="min-h-9 px-2 text-xs"
                  disabled={rosterLocked}
                  onClick={() => setCaptain(p.id)}
                >
                  C
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(
                    "min-h-9 px-2 text-xs",
                    viceCaptainId === p.id
                      ? "border-accent bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground"
                      : "hover:border-accent/40",
                  )}
                  disabled={rosterLocked}
                  onClick={() => setViceCaptain(p.id)}
                >
                  VC
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed left-0 right-0 z-30 border-t p-3 backdrop-blur md:left-1/2 md:max-w-md md:-translate-x-1/2" style={{ bottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex flex-col gap-2"> 
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full"
            disabled={!canContinue}
            onClick={() => router.push(`${base}/preview${stepQ}`)}
          >
            Team preview
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={!canContinue}
            onClick={() => router.push(`${base}/preview${stepQ}`)}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
