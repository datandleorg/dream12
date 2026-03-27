import {
  MAX_CREDITS,
  MAX_PLAYERS_SAME_FRANCHISE,
  ROLE_LIMITS,
  SQUAD_SIZE,
  type RoleKey,
} from "./rules";

export type PickPlayer = {
  id: string;
  team: string;
  role: RoleKey;
  credit_value: number;
};

export type SquadValidation =
  | { ok: true }
  | { ok: false; message: string };

function pick(
  p: PickPlayer,
): PickPlayer {
  return {
    id: p.id,
    team: p.team,
    role: p.role,
    credit_value: p.credit_value,
  };
}

/**
 * Whether adding `candidate` to `selected` keeps the squad within Dream11-style
 * credit, franchise, role max, and “still room for required mins” constraints.
 * Does not apply when removing a player (caller should skip).
 */
export function canAddPlayerToSquad(
  selected: PickPlayer[],
  candidate: PickPlayer,
): SquadValidation {
  if (selected.length >= SQUAD_SIZE) {
    return { ok: false, message: `Squad is full (${SQUAD_SIZE} players).` };
  }

  const next = [...selected.map(pick), pick(candidate)];

  const totalCredits = next.reduce((s, p) => s + p.credit_value, 0);
  if (totalCredits > MAX_CREDITS) {
    return {
      ok: false,
      message: `Credit limit ${MAX_CREDITS} — pick cheaper players or swap first.`,
    };
  }

  const byTeam = new Map<string, number>();
  for (const p of next) {
    byTeam.set(p.team, (byTeam.get(p.team) ?? 0) + 1);
  }
  for (const [team, count] of byTeam) {
    if (count > MAX_PLAYERS_SAME_FRANCHISE) {
      return {
        ok: false,
        message: `Max ${MAX_PLAYERS_SAME_FRANCHISE} players from ${team}.`,
      };
    }
  }

  const roleCounts: Record<RoleKey, number> = {
    WK: 0,
    BAT: 0,
    AR: 0,
    BOWL: 0,
  };
  for (const p of next) {
    roleCounts[p.role] += 1;
  }

  for (const role of Object.keys(ROLE_LIMITS) as RoleKey[]) {
    const { max } = ROLE_LIMITS[role];
    if (roleCounts[role] > max) {
      return {
        ok: false,
        message: `At most ${max} ${role} — remove one or pick another role.`,
      };
    }
  }

  const slotsLeft = SQUAD_SIZE - next.length;
  let minSlotsNeeded = 0;
  for (const role of Object.keys(ROLE_LIMITS) as RoleKey[]) {
    const { min } = ROLE_LIMITS[role];
    const c = roleCounts[role];
    if (c < min) minSlotsNeeded += min - c;
  }
  if (minSlotsNeeded > slotsLeft) {
    return {
      ok: false,
      message: "Not enough spots left for required WK/BAT/AR/BOWL minimums — adjust your picks.",
    };
  }

  return { ok: true };
}

export function validateSquad(
  selected: PickPlayer[],
  captainId: string | null,
  viceCaptainId: string | null,
): SquadValidation {
  if (selected.length !== SQUAD_SIZE) {
    return { ok: false, message: `Pick exactly ${SQUAD_SIZE} players.` };
  }

  const ids = new Set(selected.map((p) => p.id));
  if (ids.size !== selected.length) {
    return { ok: false, message: "Duplicate players in squad." };
  }

  if (!captainId || !viceCaptainId) {
    return { ok: false, message: "Select captain and vice-captain." };
  }
  if (captainId === viceCaptainId) {
    return { ok: false, message: "Captain and vice-captain must differ." };
  }
  if (!ids.has(captainId) || !ids.has(viceCaptainId)) {
    return { ok: false, message: "C/VC must be from your XI." };
  }

  const totalCredits = selected.reduce((s, p) => s + p.credit_value, 0);
  if (totalCredits > MAX_CREDITS) {
    return {
      ok: false,
      message: `Credits exceed ${MAX_CREDITS} (you have ${totalCredits.toFixed(1)}).`,
    };
  }

  const byTeam = new Map<string, number>();
  for (const p of selected) {
    byTeam.set(p.team, (byTeam.get(p.team) ?? 0) + 1);
  }
  for (const [team, count] of byTeam) {
    if (count > MAX_PLAYERS_SAME_FRANCHISE) {
      return {
        ok: false,
        message: `Max ${MAX_PLAYERS_SAME_FRANCHISE} players from ${team}.`,
      };
    }
  }

  const roleCounts: Record<RoleKey, number> = {
    WK: 0,
    BAT: 0,
    AR: 0,
    BOWL: 0,
  };
  for (const p of selected) {
    roleCounts[p.role] += 1;
  }

  for (const role of Object.keys(ROLE_LIMITS) as RoleKey[]) {
    const { min, max } = ROLE_LIMITS[role];
    const c = roleCounts[role];
    if (c < min || c > max) {
      return {
        ok: false,
        message: `Need ${min}–${max} ${role} players (you have ${c}).`,
      };
    }
  }

  return { ok: true };
}
