import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSavedMatchTeamsWithSummary } from "@/lib/saved-team-flow-data";
import { PickSavedTeamClient } from "@/components/pick-saved-team-client";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";

export const dynamic = "force-dynamic";

export default async function PickTeamForContestPage({
  params,
}: {
  params: Promise<{ matchId: string; contestId: string }>;
}) {
  const { matchId: mid, contestId } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/matches/${matchId}/contests/${contestId}/pick-team`)}`,
    );
  }

  const { data: contest } = await supabase
    .from("contests")
    .select("id,match_id")
    .eq("id", contestId)
    .maybeSingle();

  if (!contest || Number(contest.match_id) !== matchId) notFound();

  const { data: matchRow } = await supabase
    .from("matches")
    .select("team_a,team_b,status")
    .eq("id", matchId)
    .maybeSingle();

  const teamA = matchRow?.team_a ?? null;
  const teamB = matchRow?.team_b ?? null;
  const teams = await listSavedMatchTeamsWithSummary(matchId, teamA, teamB);

  const { data: myContestTeam } = await supabase
    .from("user_teams")
    .select("source_saved_match_team_id")
    .eq("contest_id", contestId)
    .eq("user_id", user.id)
    .maybeSingle();

  const currentContestSavedTeamId =
    (myContestTeam?.source_saved_match_team_id as string | null | undefined) ??
    null;

  const aShort = teamA?.trim() || "A";
  const bShort = teamB?.trim() || "B";
  const pitchTeamA = teamA?.trim() || "Team A";
  const pitchTeamB = teamB?.trim() || "Team B";
  const editLocked = isTeamEditLocked(String(matchRow?.status ?? ""));

  return (
    <div className="space-y-4 py-4">
      <div>
        <Link
          href={`/matches/${matchId}`}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Match
        </Link>
        <h1 className="text-lg font-semibold">Choose team</h1>
        <p className="text-muted-foreground text-sm">
          Pick a saved match team or build a new XI for this contest.
        </p>
      </div>

      <PickSavedTeamClient
        matchId={matchId}
        contestId={contestId}
        teams={teams}
        currentContestSavedTeamId={currentContestSavedTeamId}
        pitchTeamA={pitchTeamA}
        pitchTeamB={pitchTeamB}
        aShort={aShort}
        bShort={bShort}
        editLocked={editLocked}
      />
    </div>
  );
}
