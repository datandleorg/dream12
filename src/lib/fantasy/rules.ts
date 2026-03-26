/**
 * Squad rules (Dream11-style; max 7 from one franchise per product spec).
 */
export const SQUAD_SIZE = 11;
export const MAX_CREDITS = 100;
export const MAX_PLAYERS_SAME_FRANCHISE = 7;

/** Min / max count per role in the XI */
export const ROLE_LIMITS = {
  WK: { min: 1, max: 8 },
  BAT: { min: 3, max: 6 },
  AR: { min: 1, max: 4 },
  BOWL: { min: 3, max: 6 },
} as const;

export type RoleKey = keyof typeof ROLE_LIMITS;

export const ROLE_ORDER: RoleKey[] = ["WK", "BAT", "AR", "BOWL"];
