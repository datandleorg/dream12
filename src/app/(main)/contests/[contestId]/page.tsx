import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardRealtime, type Row } from "@/components/leaderboard-realtime";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { isContestVisibleToUser } from "@/lib/contest-visibility";

export default async function ContestLeaderboardPage({
  params,
}: {
  params: Promise<{ contestId: string }>;
}) {
  const { contestId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: contest } = await supabase
    .from("contests")
    .select(
      "id,name,match_id,created_by,creator_joined_at, matches ( name )",
    )
    .eq("id", contestId)
    .single();

  if (!contest) notFound();
  if (
    !isContestVisibleToUser(
      {
        created_by: contest.created_by as string | null,
        creator_joined_at: contest.creator_joined_at as string | null,
      },
      user?.id,
    )
  ) {
    notFound();
  }

  const { data: teams } = await supabase
    .from("user_teams")
    .select("id,user_id,total_points")
    .eq("contest_id", contestId);

  const userIds = [...new Set((teams ?? []).map((t) => t.user_id))];
  const { data: profiles } = await supabase
    .from("profile_usernames")
    .select("id,username")
    .in("id", userIds);

  const nameByUser = new Map(
    (profiles ?? []).map((p) => [p.id, p.username as string]),
  );

  const initialRows: Row[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    user_id: t.user_id as string,
    total_points: Number(t.total_points),
    username: nameByUser.get(t.user_id as string) ?? null,
  }));

  const matchRel = contest.matches as unknown;
  const matchName =
    Array.isArray(matchRel) && matchRel[0] && typeof matchRel[0] === "object"
      ? String((matchRel[0] as { name?: string }).name ?? "Match")
      : matchRel && typeof matchRel === "object"
        ? String((matchRel as { name?: string }).name ?? "Match")
        : "Match";
  const title = contest.name?.trim() || `Contest · ${matchName}`;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">Live leaderboard</p>
        </div>
        <Link
          href={`/matches/${contest.match_id}/contests/${contestId}/squad`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex min-h-11 shrink-0 items-center justify-center",
          )}
        >
          My team
        </Link>
      </div>

      {!initialRows.length ? (
        <p className="text-muted-foreground text-sm">No teams yet.</p>
      ) : (
        <LeaderboardRealtime contestId={contestId} initialRows={initialRows} />
      )}
    </div>
  );
}
