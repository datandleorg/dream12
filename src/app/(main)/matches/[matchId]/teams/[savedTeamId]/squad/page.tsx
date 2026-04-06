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

export default async function SavedTeamEditSquadPage({
  params,
}: {
  params: Promise<{ matchId: string; savedTeamId: string }>;
}) {
  const { matchId: mid, savedTeamId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId) || !savedTeamId) notFound();

  let data = await loadSavedTeamFlowData(matchId, {
    type: "edit",
    savedTeamId,
  });

  if (
    !data.players.length &&
    isSportmonksFixtureId(matchId)
  ) {
    await syncPlayersForMatch(matchId);
    const players = await fetchPlayersForMatch(matchId);
    data = { ...data, players };
  }

  const navBase = `/matches/${matchId}/teams/${savedTeamId}`;

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
