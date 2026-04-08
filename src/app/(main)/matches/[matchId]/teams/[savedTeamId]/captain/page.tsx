import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { CaptainSelector } from "@/components/team-flow/captain-selector";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";

export const dynamic = "force-dynamic";

export default async function EditSavedTeamCaptainPage({
  params,
}: {
  params: Promise<{ matchId: string; savedTeamId: string }>;
}) {
  const { matchId: mid, savedTeamId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const data = await loadSavedTeamFlowData(matchId, {
    type: "edit",
    savedTeamId,
  });
  const savedFlow = { basePath: `/matches/${matchId}/teams/${savedTeamId}` };

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
