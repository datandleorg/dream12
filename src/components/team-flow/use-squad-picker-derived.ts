"use client";

import { useMemo } from "react";
import {
  mapRowToBuilderPlayer,
  useTeamBuilderStore,
} from "@/stores/team-builder";
import type { TeamFlowMatchRow, TeamFlowPlayerRow } from "@/lib/team-flow-data";
import {
  MAX_CREDITS,
  SQUAD_SIZE,
  type RoleKey,
} from "@/lib/fantasy/rules";
import { countSelectedNotInPlayingXi } from "@/lib/lineup-conflict";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { sortSquadByLineupFirst } from "@/lib/fantasy/squad-sort";
import type { SquadSavedFlow } from "@/components/team-flow/squad-picker-types";

function roleCounts(players: TeamFlowPlayerRow[]) {
  const m: Record<RoleKey, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) {
    const bp = mapRowToBuilderPlayer(p);
    m[bp.role] += 1;
  }
  return m;
}

const ROLE_PICK_COPY: Record<RoleKey, string> = {
  WK: "Wicket-keepers",
  BAT: "Batsmen",
  AR: "All-rounders",
  BOWL: "Bowlers",
};

export function useSquadPickerDerived(
  match: TeamFlowMatchRow,
  players: TeamFlowPlayerRow[],
  matchId: number,
  contestId: string,
  savedFlow?: SquadSavedFlow,
) {
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

  const rosterLocked = isTeamEditLocked(match.status);

  const filtered = useMemo(
    () => players.filter((p) => mapRowToBuilderPlayer(p).role === roleTab),
    [players, roleTab],
  );

  const sortedFiltered = useMemo(
    () => sortSquadByLineupFirst(filtered),
    [filtered],
  );

  const base =
    savedFlow?.basePath ?? `/matches/${matchId}/contests/${contestId}`;
  const squadBackHref = savedFlow?.backHref ?? `/matches/${matchId}`;
  const stepQuerySuffix = savedFlow?.stepQuerySuffix ?? "";
  const canContinue = selected.length === SQUAD_SIZE;

  const pickInstruction = `Pick any ${SQUAD_SIZE} within credits · ${ROLE_PICK_COPY[roleTab]}`;

  return {
    roleTab,
    setRoleTab,
    selected,
    captainId,
    viceCaptainId,
    togglePlayer,
    teamA,
    teamB,
    title,
    creditsLeft,
    pickSelected,
    lineupConflictSelected,
    selectedA,
    selectedB,
    rc,
    rosterLocked,
    sortedFiltered,
    base,
    squadBackHref,
    stepQuerySuffix,
    canContinue,
    pickInstruction,
  };
}
