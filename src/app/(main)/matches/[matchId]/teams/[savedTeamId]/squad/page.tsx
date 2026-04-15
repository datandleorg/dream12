import { notFound } from "next/navigation";
import { SquadFlowPageShell } from "@/components/team-flow/squad-flow-page-shell";
import { loadSavedTeamFlowData } from "@/lib/saved-team-flow-data";
import { redirectIfSavedTeamEditLocked } from "@/lib/fantasy/saved-team-edit-server";
import { ensurePlayersForMatch } from "@/lib/fantasy/squad-page-server";
import { savedTeamEditReturnFlow } from "@/lib/safe-return-to";

export const dynamic = "force-dynamic";

export default async function EditSavedTeamSquadPage({
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
  const { backHref, stepQuerySuffix } = savedTeamEditReturnFlow(
    sp.returnTo,
    matchId,
  );

  let data = await loadSavedTeamFlowData(
    matchId,
    { type: "edit", savedTeamId },
    { skipSportmonksRefresh: true },
  );
  redirectIfSavedTeamEditLocked(matchId, data.match.status);

  const players = await ensurePlayersForMatch(matchId, data.players);
  data = { ...data, players };

  const basePath = `/matches/${matchId}/teams/${savedTeamId}`;
  const savedFlow = { basePath, backHref, stepQuerySuffix };

  return (
    <SquadFlowPageShell
      contestId={data.storeContestId}
      players={data.players}
      initialRoster={data.initialRoster}
      initialCaptainId={data.initialCaptainId}
      initialViceId={data.initialViceId}
      match={data.match}
      matchId={matchId}
      savedFlow={savedFlow}
      emptyPoolMessage="No players in the pool yet for this match."
    />
  );
}
