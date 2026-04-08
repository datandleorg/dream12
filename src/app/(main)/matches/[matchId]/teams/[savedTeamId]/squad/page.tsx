import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SquadPicker } from "@/components/team-flow/squad-picker";
import {
  fetchPlayersForMatch,
  type TeamFlowPlayerRow,
} from "@/lib/team-flow-data";
import { redirectIfSavedTeamEditLocked } from "@/lib/fantasy/saved-team-edit-server";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";
import {
  isSportmonksFixtureId,
  syncPlayersForMatch,
} from "@/lib/sportmonks/sync";

export const dynamic = "force-dynamic";

export default async function EditSavedTeamSquadPage({
  params,
}: {
  params: Promise<{ matchId: string; savedTeamId: string }>;
}) {
  const { matchId: mid, savedTeamId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  let data = await loadSavedTeamFlowData(matchId, {
    type: "edit",
    savedTeamId,
  });
  redirectIfSavedTeamEditLocked(matchId, data.match.status);

  if (!data.players.length && isSportmonksFixtureId(matchId)) {
    await syncPlayersForMatch(matchId);
    const players = await fetchPlayersForMatch(matchId);
    data = { ...data, players };
  }

  const basePath = `/matches/${matchId}/teams/${savedTeamId}`;
  const savedFlow = { basePath, backHref: `/matches/${matchId}/teams` };

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
        savedFlow={savedFlow}
      />
    </div>
  );
}
