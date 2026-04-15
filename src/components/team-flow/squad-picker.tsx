"use client";

import { toast } from "sonner";
import { mapRowToBuilderPlayer } from "@/stores/team-builder";
import type { TeamFlowMatchRow, TeamFlowPlayerRow } from "@/lib/team-flow-data";
import { SQUAD_SIZE } from "@/lib/fantasy/rules";
import { canAddPlayerToSquad } from "@/lib/fantasy/validate-squad";
import { FlowHeader } from "@/components/team-flow/flow-header";
import { LineupConflictBanner } from "@/components/team-flow/lineup-conflict-banner";
import { SquadPickerFooter } from "@/components/team-flow/squad-picker-footer";
import type { SquadSavedFlow } from "@/components/team-flow/squad-picker-types";
import { SquadPlayerRow } from "@/components/team-flow/squad-player-row";
import { SquadRoleTabs } from "@/components/team-flow/squad-role-tabs";
import { useSquadPickerDerived } from "@/components/team-flow/use-squad-picker-derived";

export type { SquadSavedFlow } from "@/components/team-flow/squad-picker-types";

export function SquadPicker({
  matchId,
  contestId,
  match,
  players,
  savedFlow,
}: {
  matchId: number;
  contestId: string;
  match: TeamFlowMatchRow;
  players: TeamFlowPlayerRow[];
  savedFlow?: SquadSavedFlow;
}) {
  const d = useSquadPickerDerived(match, players, matchId, contestId, savedFlow);

  function onTogglePlayer(bp: ReturnType<typeof mapRowToBuilderPlayer>) {
    if (d.rosterLocked) return;
    const isOn = d.selected.some((x) => x.id === bp.id);
    const pickFields = {
      id: bp.id,
      team: bp.team,
      role: bp.role,
      credit_value: bp.credit_value,
    };
    const addCheck = isOn
      ? ({ ok: true as const })
      : canAddPlayerToSquad(d.pickSelected, pickFields);
    if (!isOn && !addCheck.ok) {
      toast.error(addCheck.message);
      return;
    }
    const res = d.togglePlayer(bp);
    if (!res.ok) toast.error(res.message);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="shrink-0">
        <FlowHeader
          variant="squad"
          backHref={d.squadBackHref}
          tournamentName={match.tournament_name}
          matchTitle={d.title}
          teamA={d.teamA}
          teamB={d.teamB}
          startIso={match.start_time}
          selectedA={d.selectedA}
          selectedB={d.selectedB}
          picked={d.selected.length}
          squadSize={SQUAD_SIZE}
          creditsLeft={d.creditsLeft}
          liveToss={{
            matchId,
            teamA: d.teamA,
            teamB: d.teamB,
            localteamId: match.localteam_id,
            visitorteamId: match.visitorteam_id,
            tossWinnerTeamId: match.toss_winner_team_id,
            tossDecision: match.toss_decision,
          }}
        />

        {d.rosterLocked ? (
          <p className="text-zinc-600 px-2 pt-1 text-center text-xs dark:text-zinc-400">
            Team lock is on (match is live). You can review picks, but
            changes cannot be saved.
          </p>
        ) : null}

        {d.lineupConflictSelected > 0 ? (
          <div className="px-1 pt-2">
            <LineupConflictBanner
              count={d.lineupConflictSelected}
              matchStatus={match.status}
            />
          </div>
        ) : null}
      </div>

      <div className="bg-[#f5f4ef] -mx-4 flex flex-col px-3 sm:px-4">
        <SquadRoleTabs
          roleTab={d.roleTab}
          onRoleTabChange={d.setRoleTab}
          roleCounts={d.rc}
        />

        <div className="mt-1 flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
          <div className="shrink-0 border-b border-zinc-100 px-2 py-3 sm:px-3">
            <p className="text-sm font-semibold text-zinc-800">
              {d.pickInstruction}
            </p>
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
            {d.sortedFiltered.length === 0 ? (
              <li className="text-zinc-500 py-6 text-center text-sm">
                No players in this role tab. Try another position.
              </li>
            ) : null}
            {d.sortedFiltered.map((p) => (
              <SquadPlayerRow
                key={p.id}
                player={p}
                contestId={contestId}
                selected={d.selected}
                pickSelected={d.pickSelected}
                rosterLocked={d.rosterLocked}
                onTogglePlayer={onTogglePlayer}
              />
            ))}
          </ul>
        </div>

        <SquadPickerFooter
          teamA={d.teamA}
          teamB={d.teamB}
          selected={d.selected}
          creditsLeft={d.creditsLeft}
          captainId={d.captainId}
          viceCaptainId={d.viceCaptainId}
          base={d.base}
          stepQuerySuffix={d.stepQuerySuffix}
          canContinue={d.canContinue}
          rosterLocked={d.rosterLocked}
          matchId={matchId}
          contestId={contestId}
          savedFlow={savedFlow}
        />
      </div>
    </div>
  );
}
