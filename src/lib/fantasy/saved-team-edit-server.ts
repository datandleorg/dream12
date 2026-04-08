import "server-only";

import { redirect } from "next/navigation";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";

/** Bounce off saved-team builder URLs when the match is no longer upcoming. */
export function redirectIfSavedTeamEditLocked(
  matchId: number,
  matchStatus: string | null | undefined,
): void {
  if (isTeamEditLocked(matchStatus)) {
    redirect(`/matches/${matchId}/teams`);
  }
}
