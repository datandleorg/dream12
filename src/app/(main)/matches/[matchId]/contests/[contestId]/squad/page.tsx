import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SquadPicker } from "@/components/team-flow/squad-picker";
import { loadTeamFlowData } from "@/lib/team-flow-data";

export default async function ContestSquadPage({
  params,
}: {
  params: Promise<{ matchId: string; contestId: string }>;
}) {
  const { matchId: mid, contestId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const data = await loadTeamFlowData(matchId, contestId);

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
          No players synced for this match yet. Seed players in Supabase or run
          sync.
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
