import { notFound } from "next/navigation";
import { HydrateTeamFlow } from "@/components/team-flow/hydrate-team-flow";
import { CaptainSelector } from "@/components/team-flow/captain-selector";
import { loadTeamFlowData } from "@/lib/team-flow-data";
import { parseTeamFlowReturnPath } from "@/lib/team-flow-return-path";

export const dynamic = "force-dynamic";

export default async function ContestCaptainPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string; contestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { matchId: mid, contestId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const sp = (await searchParams) ?? {};
  const flowReturnPath = parseTeamFlowReturnPath(sp, {
    expectedContestId: contestId,
  });

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
        flowReturnPath={flowReturnPath}
      />
    </div>
  );
}
