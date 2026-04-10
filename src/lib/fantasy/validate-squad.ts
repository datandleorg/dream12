import {
  MAX_CREDITS,
  MAX_PLAYERS_SAME_FRANCHISE,
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
 * Whether adding `candidate` to `selected` stays within squad size, credit cap,
 * and franchise cap. Does not apply when removing a player (caller should skip).
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

  return { ok: true };
}

/** XI size, duplicates, credits, franchise — used before captain/vice step. */
export function validateSquadRosterOnly(selected: PickPlayer[]): SquadValidation {
  if (selected.length !== SQUAD_SIZE) {
    return { ok: false, message: `Pick exactly ${SQUAD_SIZE} players.` };
  }

  const ids = new Set(selected.map((p) => p.id));
  if (ids.size !== selected.length) {
    return { ok: false, message: "Duplicate players in squad." };
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

  return { ok: true };
}

export function validateSquad(
  selected: PickPlayer[],
  captainId: string | null,
  viceCaptainId: string | null,
): SquadValidation {
  const roster = validateSquadRosterOnly(selected);
  if (!roster.ok) return roster;

  if (!captainId || !viceCaptainId) {
    return { ok: false, message: "Select captain and vice-captain." };
  }
  if (captainId === viceCaptainId) {
    return { ok: false, message: "Captain and vice-captain must be two different players." };
  }
  const ids = new Set(selected.map((p) => p.id));
  if (!ids.has(captainId) || !ids.has(viceCaptainId)) {
    return { ok: false, message: "C/VC must be from your XI." };
  }

  return { ok: true };
}
