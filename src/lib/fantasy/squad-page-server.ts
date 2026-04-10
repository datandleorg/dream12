import "server-only";

import {
  fetchPlayersForMatch,
  type TeamFlowPlayerRow,
} from "@/lib/team-flow-data";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { syncPlayersForMatch } from "@/lib/sportmonks/sync";

export function truthySearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): boolean {
  const raw = searchParams[key];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s === "1" || s === "true";
}

export async function ensurePlayersForMatch(
  matchId: number,
  players: TeamFlowPlayerRow[],
): Promise<TeamFlowPlayerRow[]> {
  if (players.length > 0 || !isSportmonksFixtureId(matchId)) {
    return players;
  }
  await syncPlayersForMatch(matchId);
  return fetchPlayersForMatch(matchId);
}
