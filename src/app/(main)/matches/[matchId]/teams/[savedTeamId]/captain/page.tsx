import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { CaptainSelector } from "@/components/team-flow/captain-selector";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";

export const dynamic = "force-dynamic";

export default async function SavedTeamEditCaptainPage({
  params,
}: {
  params: Promise<{ matchId: string; savedTeamId: string }>;
}) {
  const { matchId: mid, savedTeamId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId) || !savedTeamId) notFound();

  const data = await loadSavedTeamFlowData(matchId, {
    type: "edit",
    savedTeamId,
  });
  const navBase = `/matches/${matchId}/teams/${savedTeamId}`;

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
      <CaptainSelector
        matchId={matchId}
        contestId={data.storeContestId}
        match={data.match}
        savedFlow={{ navigationBase: navBase }}
      />
    </div>
  );
}
