import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Legacy URL — contest team picker lives on the contest page Teams tab. */
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

  redirect(`/contests/${contestId}?tab=teams`);
}
