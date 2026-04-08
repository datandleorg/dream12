import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { CaptainSelector } from "@/components/team-flow/captain-selector";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";

export const dynamic = "force-dynamic";

export default async function CreateSavedTeamCaptainPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const data = await loadSavedTeamFlowData(matchId, { type: "create" });
  const savedFlow = { basePath: `/matches/${matchId}/teams/create` };

  return (
    <div className="py-2">
      <HydrateTeamFlow
        contestId={data.storeContestId}
        players={data.players}
        initialRoster={data.initialRoster}
        initialCaptainId={data.initialCaptainId}
        initialViceId={data.initialViceId}
        resetWhenNoSavedTeam={false}
      />
      <CaptainSelector
        matchId={matchId}
        contestId={data.storeContestId}
        match={data.match}
        savedFlow={savedFlow}
      />
    </div>
  );
}
