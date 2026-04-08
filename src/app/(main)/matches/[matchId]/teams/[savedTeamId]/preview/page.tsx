import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SavedMatchTeamPreview } from "@/components/team-flow/saved-match-team-preview";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";

export const dynamic = "force-dynamic";

export default async function EditSavedTeamPreviewPage({
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
      <SavedMatchTeamPreview
        matchId={matchId}
        match={data.match}
        mode="edit"
        savedTeamId={savedTeamId}
        slot={data.slot}
      />
    </div>
  );
}
