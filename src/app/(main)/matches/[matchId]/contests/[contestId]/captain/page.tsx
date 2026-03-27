import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { CaptainSelector } from "@/components/team-flow/captain-selector";
import { loadTeamFlowData } from "@/lib/team-flow-data";

export const dynamic = "force-dynamic";

export default async function ContestCaptainPage({
  params,
}: {
  params: Promise<{ matchId: string; contestId: string }>;
}) {
  const { matchId: mid, contestId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const data = await loadTeamFlowData(matchId, contestId);

  return (
    <div className="py-2">
      <HydrateTeamFlow
        contestId={contestId}
        players={data.players}
        initialRoster={data.initialRoster}
        initialCaptainId={data.initialCaptainId}
        initialViceId={data.initialViceId}
        resetWhenNoSavedTeam={false}
      />
      <CaptainSelector
        matchId={matchId}
        contestId={contestId}
        match={data.match}
      />
    </div>
  );
}
