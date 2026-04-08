import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SquadPicker } from "@/components/team-flow/squad-picker";
import type { SquadSavedFlow } from "@/components/team-flow/squad-picker-types";
import type { TeamFlowMatchRow, TeamFlowPlayerRow } from "@/lib/team-flow-data";

export function SquadFlowPageShell({
  contestId,
  players,
  initialRoster,
  initialCaptainId,
  initialViceId,
  forceEmptyClientSession = false,
  match,
  matchId,
  savedFlow,
  emptyPoolMessage,
}: {
  contestId: string;
  players: TeamFlowPlayerRow[];
  initialRoster: string[];
  initialCaptainId: string | null;
  initialViceId: string | null;
  forceEmptyClientSession?: boolean;
  match: TeamFlowMatchRow;
  matchId: number;
  savedFlow?: SquadSavedFlow;
  emptyPoolMessage: string;
}) {
  const hydrate = (
    <HydrateTeamFlow
      contestId={contestId}
      players={players}
      initialRoster={initialRoster}
      initialCaptainId={initialCaptainId}
      initialViceId={initialViceId}
      forceEmptyClientSession={forceEmptyClientSession}
    />
  );

  if (!players.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col py-4">
        {hydrate}
        <p className="text-muted-foreground text-sm">{emptyPoolMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col py-2">
      {hydrate}
      <SquadPicker
        matchId={matchId}
        contestId={contestId}
        match={match}
        players={players}
        savedFlow={savedFlow}
      />
    </div>
  );
}
