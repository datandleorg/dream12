import { create } from "zustand";
import type { RoleKey } from "@/lib/fantasy/rules";

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

type State = {
  selected: BuilderPlayer[];
  captainId: string | null;
  viceCaptainId: string | null;
  roleTab: RoleKey;
  togglePlayer: (p: BuilderPlayer) => void;
  setCaptain: (id: string | null) => void;
  setViceCaptain: (id: string | null) => void;
  setRoleTab: (r: RoleKey) => void;
  reset: (preselected?: BuilderPlayer[]) => void;
};

function roleKeyFromDb(role: string): RoleKey {
  if (role === "WK" || role === "BAT" || role === "AR" || role === "BOWL")
    return role;
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

export const useTeamBuilderStore = create<State>((set) => ({
  selected: [],
  captainId: null,
  viceCaptainId: null,
  roleTab: "WK",
  togglePlayer: (p) =>
    set((s) => {
      const has = s.selected.some((x) => x.id === p.id);
      if (has) {
        return {
          selected: s.selected.filter((x) => x.id !== p.id),
          captainId: s.captainId === p.id ? null : s.captainId,
          viceCaptainId: s.viceCaptainId === p.id ? null : s.viceCaptainId,
        };
      }
      if (s.selected.length >= 11) return s;
      return { selected: [...s.selected, p] };
    }),
  setCaptain: (id) => set({ captainId: id }),
  setViceCaptain: (id) => set({ viceCaptainId: id }),
  setRoleTab: (roleTab) => set({ roleTab }),
  reset: (preselected) =>
    set({
      selected: preselected ?? [],
      captainId: null,
      viceCaptainId: null,
      roleTab: "WK",
    }),
}));
