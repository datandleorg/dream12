import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SquadPicker } from "@/components/team-flow/squad-picker";
import {
  fetchPlayersForMatch,
  type TeamFlowPlayerRow,
} from "@/lib/team-flow-data";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";
import {
  isSportmonksFixtureId,
  syncPlayersForMatch,
} from "@/lib/sportmonks/sync";

export const dynamic = "force-dynamic";

export default async function SavedTeamCreateSquadPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  let data = await loadSavedTeamFlowData(matchId, { type: "create" });

  if (
    !data.players.length &&
    isSportmonksFixtureId(matchId)
  ) {
    await syncPlayersForMatch(matchId);
    const players = await fetchPlayersForMatch(matchId);
    data = { ...data, players };
  }

  if (!data.players.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col py-4">
        <HydrateTeamFlow
          contestId={data.storeContestId}
          players={data.players}
          initialRoster={data.initialRoster}
          initialCaptainId={data.initialCaptainId}
          initialViceId={data.initialViceId}
        />
        <p className="text-muted-foreground text-sm">
          No players in the pool yet for this match.
        </p>
      </div>
    );
  }

  const navBase = `/matches/${matchId}/teams/create`;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col py-2">
      <HydrateTeamFlow
        contestId={data.storeContestId}
        players={data.players}
        initialRoster={data.initialRoster}
        initialCaptainId={data.initialCaptainId}
        initialViceId={data.initialViceId}
      />
      <SquadPicker
        matchId={matchId}
        contestId={data.storeContestId}
        match={data.match}
        players={data.players as TeamFlowPlayerRow[]}
        savedFlow={{
          navigationBase: navBase,
          backHref: `/matches/${matchId}/teams`,
        }}
      />
    </div>
  );
}
