import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { PitchPreview } from "@/components/team-flow/pitch-preview";
import { loadTeamFlowData } from "@/lib/team-flow-data";

export default async function ContestPreviewPage({
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
      <PitchPreview
        matchId={matchId}
        contestId={contestId}
        match={data.match}
        contest={data.contest}
        hasExistingTeam={data.hasExistingTeam}
      />
    </div>
  );
}
