import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSavedMatchTeamsWithSummary } from "@/lib/saved-team-flow-data";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { MatchSavedTeamsTab } from "@/components/match-saved-teams-tab";

export const dynamic = "force-dynamic";

export default async function MatchTeamsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/matches/${matchId}/teams`)}`);

  const { data: matchRow } = await supabase
    .from("matches")
    .select("id,name,team_a,team_b,status")
    .eq("id", matchId)
    .maybeSingle();

  if (!matchRow) notFound();

  const teamA = matchRow.team_a ?? null;
  const teamB = matchRow.team_b ?? null;
  const teams = await listSavedMatchTeamsWithSummary(matchId, teamA, teamB);
  const locked = isTeamEditLocked(String(matchRow.status));

  const title =
    teamA && teamB ? `${teamA} vs ${teamB}` : (matchRow.name as string);

  return (
    <div className="space-y-4 py-4">
      <MatchSavedTeamsTab
        variant="page"
        matchId={matchId}
        teamA={teamA}
        teamB={teamB}
        title={title}
        locked={locked}
        teams={teams}
      />
    </div>
  );
}
