/**
 * Squad rules: credit cap, franchise cap, XI size. Role is for UI/grouping only.
 */
export const SQUAD_SIZE = 11;
export const MAX_CREDITS = 100;
export const MAX_PLAYERS_SAME_FRANCHISE = 8;

export type RoleKey = "WK" | "BAT" | "AR" | "BOWL";

export const ROLE_ORDER: RoleKey[] = ["WK", "BAT", "AR", "BOWL"];
