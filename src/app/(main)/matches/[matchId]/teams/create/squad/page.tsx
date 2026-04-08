import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SquadPicker } from "@/components/team-flow/squad-picker";
import {
  fetchPlayersForMatch,
  type TeamFlowPlayerRow,
} from "@/lib/team-flow-data";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";
import { redirectIfSavedTeamEditLocked } from "@/lib/fantasy/saved-team-edit-server";
import {
  isSportmonksFixtureId,
  syncPlayersForMatch,
} from "@/lib/sportmonks/sync";

export const dynamic = "force-dynamic";

export default async function CreateSavedTeamSquadPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const sp = (await searchParams) ?? {};
  const freshRaw = sp.fresh;
  const freshStr = Array.isArray(freshRaw) ? freshRaw[0] : freshRaw;
  const forceEmptyClientSession =
    freshStr === "1" || freshStr === "true";

  let data = await loadSavedTeamFlowData(matchId, { type: "create" });
  redirectIfSavedTeamEditLocked(matchId, data.match.status);

  if (!data.players.length && isSportmonksFixtureId(matchId)) {
    await syncPlayersForMatch(matchId);
    const players = await fetchPlayersForMatch(matchId);
    data = { ...data, players };
  }

  const basePath = `/matches/${matchId}/teams/create`;
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
          forceEmptyClientSession={forceEmptyClientSession}
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
        forceEmptyClientSession={forceEmptyClientSession}
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
