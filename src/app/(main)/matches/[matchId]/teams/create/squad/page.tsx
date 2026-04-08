import { notFound } from "next/navigation";
import { SquadFlowPageShell } from "@/components/team-flow/squad-flow-page-shell";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";
import { redirectIfSavedTeamEditLocked } from "@/lib/fantasy/saved-team-edit-server";
import {
  ensurePlayersForMatch,
  truthySearchParam,
} from "@/lib/fantasy/squad-page-server";

export const dynamic = "force-dynamic";

export default async function CreateSavedTeamSquadPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const sp = (await searchParams) ?? {};
  const forceEmptyClientSession = truthySearchParam(sp, "fresh");

  let data = await loadSavedTeamFlowData(
    matchId,
    { type: "create" },
    { skipSportmonksRefresh: true },
  );
  redirectIfSavedTeamEditLocked(matchId, data.match.status);

  const players = await ensurePlayersForMatch(matchId, data.players);
  data = { ...data, players };

  const basePath = `/matches/${matchId}/teams/create`;
  const savedFlow = { basePath, backHref: `/matches/${matchId}/teams` };

  return (
    <SquadFlowPageShell
      contestId={data.storeContestId}
      players={data.players}
      initialRoster={data.initialRoster}
      initialCaptainId={data.initialCaptainId}
      initialViceId={data.initialViceId}
      forceEmptyClientSession={forceEmptyClientSession}
      match={data.match}
      matchId={matchId}
      savedFlow={savedFlow}
      emptyPoolMessage="No players in the pool yet for this match."
    />
  );
}
