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
      <div className="py-4">
        <HydrateTeamFlow
          contestId={contestId}
          players={data.players}
          initialRoster={data.initialRoster}
          initialCaptainId={data.initialCaptainId}
          initialViceId={data.initialViceId}
        />
        <p className="text-muted-foreground text-sm">
          No lineup from SportMonks for this match yet—squads often appear closer
          to the start. Re-run your sync job or seed players in Supabase for local
          testing.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
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
