import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { SavedTeamPitchPreview } from "@/components/team-flow/saved-team-pitch-preview";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";

export const dynamic = "force-dynamic";

export default async function SavedTeamCreatePreviewPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const data = await loadSavedTeamFlowData(matchId, { type: "create" });
  const navBase = `/matches/${matchId}/teams/create`;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-1 flex-col py-2">
      <HydrateTeamFlow
        contestId={data.storeContestId}
        players={data.players}
        initialRoster={data.initialRoster}
        initialCaptainId={data.initialCaptainId}
        initialViceId={data.initialViceId}
        resetWhenNoSavedTeam={false}
      />
      <SavedTeamPitchPreview
        matchId={matchId}
        match={data.match}
        navigationBase={navBase}
        mode={{ type: "create" }}
      />
    </div>
  );
}
