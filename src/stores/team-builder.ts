import { create } from "zustand";
import { SQUAD_SIZE, type RoleKey } from "@/lib/fantasy/rules";
import { canAddPlayerToSquad } from "@/lib/fantasy/validate-squad";
import type { TeamFlowPlayerRow } from "@/lib/team-flow-data";

export type BuilderPlayer = {
  id: string;
  name: string;
  team: string;
  role: RoleKey;
  credit_value: number;
  season_points: number;
  selection_pct?: number | null;
  played_last_match?: boolean | null;
  photo_url?: string | null;
  /** null = unknown; false = not in official XI per sync */
  in_playing_xi?: boolean | null;
};

export type TogglePlayerResult =
  | { ok: true }
  | { ok: false; message: string };

type State = {
  selected: BuilderPlayer[];
  captainId: string | null;
  viceCaptainId: string | null;
  roleTab: RoleKey;
  /** Last contest the flow was hydrated for; used to avoid carrying one contest’s XI into another. */
  teamFlowContestId: string | null;
  togglePlayer: (p: BuilderPlayer) => TogglePlayerResult;
  setCaptain: (id: string | null) => void;
  setViceCaptain: (id: string | null) => void;
  setRoleTab: (r: RoleKey) => void;
  setTeamFlowContestId: (id: string | null) => void;
  reset: (preselected?: BuilderPlayer[]) => void;
};

function roleKeyFromDb(role: string): RoleKey {
  const r = String(role).trim().toUpperCase();
  if (r === "WK" || r === "BAT" || r === "AR" || r === "BOWL") return r;
  return "BAT";
}

export function mapRowToBuilderPlayer(row: {
  id: string;
  name: string;
  team: string;
  role: string;
  credit_value: number;
  season_points?: number | null;
  selection_pct?: number | null;
  played_last_match?: boolean | null;
  photo_url?: string | null;
  in_playing_xi?: boolean | null;
}): BuilderPlayer {
  const xi =
    row.in_playing_xi === true ? true : row.in_playing_xi === false ? false : null;
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    role: roleKeyFromDb(row.role),
    credit_value: Number(row.credit_value),
    season_points: Number(row.season_points ?? 0),
    selection_pct: row.selection_pct ?? null,
    played_last_match: row.played_last_match ?? false,
    photo_url: row.photo_url ?? null,
    in_playing_xi: xi,
  };
}

/** If DB or legacy state had the same id for both, keep captain and clear VC. */
export function normalizeCaptainVicePair(
  captainId: string | null,
  viceCaptainId: string | null,
): { captainId: string | null; viceCaptainId: string | null } {
  if (captainId && viceCaptainId && captainId === viceCaptainId) {
    return { captainId, viceCaptainId: null };
  }
  return { captainId, viceCaptainId };
}

/** Refresh builder rows from the server player pool (order preserved). */
export function mergeBuilderPlayersWithPool(
  selected: BuilderPlayer[],
  players: TeamFlowPlayerRow[],
): BuilderPlayer[] {
  return selected.map((p) => {
    const row = players.find((x) => x.id === p.id);
    return row ? mapRowToBuilderPlayer(row) : p;
  });
}

export const useTeamBuilderStore = create<State>((set) => ({
  selected: [],
  captainId: null,
  viceCaptainId: null,
  roleTab: "WK",
  teamFlowContestId: null,
  togglePlayer: (p) => {
    let rejection: string | undefined;
    set((s) => {
      const has = s.selected.some((x) => x.id === p.id);
      if (has) {
        return {
          selected: s.selected.filter((x) => x.id !== p.id),
          captainId: s.captainId === p.id ? null : s.captainId,
          viceCaptainId: s.viceCaptainId === p.id ? null : s.viceCaptainId,
        };
      }
      if (s.selected.length >= SQUAD_SIZE) {
        rejection = `Squad is full (${SQUAD_SIZE} players).`;
        return s;
      }
      const pickSel = s.selected.map((x) => ({
        id: x.id,
        team: x.team,
        role: x.role,
        credit_value: x.credit_value,
      }));
      const add = canAddPlayerToSquad(pickSel, {
        id: p.id,
        team: p.team,
        role: p.role,
        credit_value: p.credit_value,
      });
      if (!add.ok) {
        rejection = add.message;
        return s;
      }
      return { selected: [...s.selected, p] };
    });
    return rejection != null ? { ok: false, message: rejection } : { ok: true };
  },
  setCaptain: (id) =>
    set((s) => ({
      captainId: id,
      viceCaptainId:
        id != null && s.viceCaptainId === id ? null : s.viceCaptainId,
    })),
  setViceCaptain: (id) =>
    set((s) => ({
      viceCaptainId: id,
      captainId: id != null && s.captainId === id ? null : s.captainId,
    })),
  setRoleTab: (roleTab) => set({ roleTab }),
  setTeamFlowContestId: (teamFlowContestId) => set({ teamFlowContestId }),
  reset: (preselected) =>
    set({
      selected: preselected ?? [],
      captainId: null,
      viceCaptainId: null,
      roleTab: "WK",
    }),
}));
