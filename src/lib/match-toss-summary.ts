export type MatchTossSummaryInput = {
  team_a: string | null;
  team_b: string | null;
  localteam_id: number | null;
  visitorteam_id: number | null;
  toss_winner_team_id: number | null;
  toss_decision: string | null;
};

function normDecision(v: string | null): "bat" | "bowl" | null {
  if (v == null) return null;
  const s = v.trim().toLowerCase();
  if (s === "bat") return "bat";
  if (s === "bowl") return "bowl";
  return null;
}

function teamLabel(name: string | null, fallback: string): string {
  const t = name?.trim();
  return t && t.length > 0 ? t : fallback;
}

/**
 * Maps SportMonks toss fields to display lines. `team_a`/`team_b` align with
 * `localteam_id`/`visitorteam_id` from sync (see sync-fixture-upsert).
 */
export function formatMatchTossSummary(
  input: MatchTossSummaryInput,
): { tossLine: string | null; battingFirstLine: string | null } {
  const teamA = teamLabel(input.team_a, "Team A");
  const teamB = teamLabel(input.team_b, "Team B");
  const localId = input.localteam_id;
  const visitorId = input.visitorteam_id;
  const winnerId = input.toss_winner_team_id;
  const decision = normDecision(input.toss_decision);

  let winnerName: string | null = null;
  if (winnerId != null && localId != null && winnerId === localId) {
    winnerName = teamA;
  } else if (winnerId != null && visitorId != null && winnerId === visitorId) {
    winnerName = teamB;
  }

  let tossLine: string | null = null;
  if (winnerName && decision) {
    const elected =
      decision === "bat" ? "elected to bat" : "elected to field first";
    tossLine = `${winnerName} won the toss and ${elected}`;
  } else if (winnerName) {
    tossLine = `${winnerName} won the toss`;
  }

  let battingFirstLine: string | null = null;
  if (
    winnerName != null &&
    decision != null &&
    localId != null &&
    visitorId != null &&
    winnerId != null &&
    (winnerId === localId || winnerId === visitorId)
  ) {
    const first =
      decision === "bat" ? winnerName : winnerId === localId ? teamB : teamA;
    battingFirstLine = `${first} bat first`;
  }

  return { tossLine, battingFirstLine };
}
