import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SquadPicker } from "@/components/team-flow/squad-picker";
import {
  fetchPlayersForMatch,
  loadTeamFlowData,
} from "@/lib/team-flow-data";
import {
  isSportmonksFixtureId,
  syncPlayersForMatch,
} from "@/lib/sportmonks/sync";

/** Always read fresh `players.role` from DB after sync (no static cache of squad pool). */
export const dynamic = "force-dynamic";

export default async function ContestSquadPage({
  params,
}: {
  params: Promise<{ matchId: string; contestId: string }>;
}) {
  const { matchId: mid, contestId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  let data = await loadTeamFlowData(matchId, contestId);

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
          contestId={contestId}
          players={data.players}
          initialRoster={data.initialRoster}
          initialCaptainId={data.initialCaptainId}
          initialViceId={data.initialViceId}
        />
        <p className="text-muted-foreground text-sm">
          No players in the pool yet for this match. Run sync or check SportMonks data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col py-2">
      <HydrateTeamFlow
        contestId={contestId}
        players={data.players}
        initialRoster={data.initialRoster}
        initialCaptainId={data.initialCaptainId}
        initialViceId={data.initialViceId}
      />
      <SquadPicker
        matchId={matchId}
        contestId={contestId}
        match={data.match}
        players={data.players}
      />
    </div>
  );
}
