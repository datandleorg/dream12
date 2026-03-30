import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateContestWizard } from "@/components/create-contest-wizard";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { platformFeeFractionFromEnv } from "@/lib/fantasy/prize-slabs";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";

export default async function CreateContestPage({
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
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/matches/${matchId}/create-contest`)}`);
  }

  if (isSportmonksFixtureId(matchId)) {
    await refreshMatchFromSportmonks(matchId);
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id,name,start_time,status,tournament_name,team_a,team_b")
    .eq("id", matchId)
    .single();

  if (!match) notFound();

  const statusKey = String(match.status).toLowerCase();
  if (statusKey !== "upcoming") {
    redirect(`/matches/${matchId}`);
  }

  if (isTeamEditLocked(match.start_time)) {
    redirect(`/matches/${matchId}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  const title =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  const defaultName = `Contest by ${profile?.username?.trim() || "You"}`;
  const platformFeeFraction = platformFeeFractionFromEnv();

  return (
    <div className="py-2">
      <CreateContestWizard
        matchId={matchId}
        matchTitle={title}
        startIso={match.start_time}
        defaultContestName={defaultName}
        platformFeeFraction={platformFeeFraction}
      />
      <p className="text-muted-foreground mt-4 px-1 text-center text-xs">
        After continuing you must pick your XI and save — your contest stays private until then.{" "}
        <Link
          href={`/matches/${matchId}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          Back to contests
        </Link>
      </p>
    </div>
  );
}
