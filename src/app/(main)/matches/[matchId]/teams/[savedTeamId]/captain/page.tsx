import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { CaptainSelector } from "@/components/team-flow/captain-selector";
import { redirectIfSavedTeamEditLocked } from "@/lib/fantasy/saved-team-edit-server";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";
import { savedTeamEditReturnFlow } from "@/lib/safe-return-to";

export const dynamic = "force-dynamic";

export default async function EditSavedTeamCaptainPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string; savedTeamId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { matchId: mid, savedTeamId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const sp = (await searchParams) ?? {};
  const { stepQuerySuffix } = savedTeamEditReturnFlow(sp.returnTo, matchId);

  const data = await loadSavedTeamFlowData(matchId, {
    type: "edit",
    savedTeamId,
  });
  redirectIfSavedTeamEditLocked(matchId, data.match.status);
  const savedFlow = {
    basePath: `/matches/${matchId}/teams/${savedTeamId}`,
    stepQuerySuffix,
  };

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
