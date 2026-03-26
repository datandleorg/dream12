import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateContestWizard } from "@/components/create-contest-wizard";

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

  const { data: match } = await supabase
    .from("matches")
    .select("id,name,start_time,tournament_name,team_a,team_b")
    .eq("id", matchId)
    .single();

  if (!match) notFound();

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

  return (
    <div className="py-2">
      <CreateContestWizard
        matchId={matchId}
        matchTitle={title}
        startIso={match.start_time}
        defaultContestName={defaultName}
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
