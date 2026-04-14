import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SquadFlowPageShell } from "@/components/team-flow/squad-flow-page-shell";
import { StripFreshSearchParam } from "@/components/team-flow/strip-fresh-search-param";
import { loadTeamFlowData } from "@/lib/team-flow-data";
import {
  ensurePlayersForMatch,
  truthySearchParam,
} from "@/lib/fantasy/squad-page-server";
import { parseTeamFlowReturnPath } from "@/lib/team-flow-return-path";

/** Always read fresh `players.role` from DB after sync (no static cache of squad pool). */
export const dynamic = "force-dynamic";

export default async function ContestSquadPage({
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
  const buildFresh = truthySearchParam(sp, "fresh");
  const flowReturnPath = parseTeamFlowReturnPath(sp, {
    expectedContestId: contestId,
  });

  let data = await loadTeamFlowData(matchId, contestId, {
    resetContestDraft: buildFresh,
    skipSportmonksRefresh: true,
  });
  const players = await ensurePlayersForMatch(matchId, data.players);
  data = { ...data, players };

  return (
    <>
      {buildFresh ? (
        <Suspense fallback={null}>
          <StripFreshSearchParam />
        </Suspense>
      ) : null}
      <SquadFlowPageShell
        contestId={contestId}
        players={data.players}
        initialRoster={data.initialRoster}
        initialCaptainId={data.initialCaptainId}
        initialViceId={data.initialViceId}
        match={data.match}
        matchId={matchId}
        flowReturnPath={flowReturnPath}
        emptyPoolMessage="No players in the pool yet for this match. Run sync or check SportMonks data."
      />
    </>
  );
}
