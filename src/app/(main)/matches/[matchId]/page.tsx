import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinContestButton } from "@/components/join-contest-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function MatchDetailPage({
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

  const { data: match } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b",
    )
    .eq("id", matchId)
    .single();

  if (!match) notFound();

  let balance = 0;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", user.id)
      .single();
    balance = Number(profile?.wallet_balance ?? 0);
  }

  const { data: contests } = await supabase
    .from("contests")
    .select("id,name,entry_fee,prize_pool,max_participants")
    .eq("match_id", matchId);

  const contestIds = (contests ?? []).map((c) => c.id);
  let filledByContest = new Map<string, number>();
  if (contestIds.length) {
    const { data: teamRows } = await supabase
      .from("user_teams")
      .select("contest_id")
      .in("contest_id", contestIds);
    for (const r of teamRows ?? []) {
      const id = r.contest_id as string;
      filledByContest.set(id, (filledByContest.get(id) ?? 0) + 1);
    }
  }

  const subtitle =
    match.team_a && match.team_b
      ? `${match.team_a} vs ${match.team_b}`
      : match.name;

  return (
    <div className="space-y-4 py-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            {match.tournament_name ? (
              <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
                {match.tournament_name}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold leading-tight">{subtitle}</h1>
          </div>
          <Badge variant="secondary">{match.status}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {new Date(match.start_time).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
      </div>

      <h2 className="text-lg font-medium">Contests</h2>
      {!contests?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No contests</CardTitle>
            <CardDescription>
              Add rows in the `contests` table for this match in Supabase.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {contests.map((c) => {
            const filled = filledByContest.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {c.name?.trim() || "Contest"}
                    </CardTitle>
                    <CardDescription>
                      Entry ₹{Number(c.entry_fee)} · Pool ₹
                      {Number(c.prize_pool)} · {filled}/
                      {c.max_participants} joined
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex flex-col gap-2 sm:flex-row">
                    {user ? (
                      <JoinContestButton
                        matchId={matchId}
                        contestId={c.id}
                        entryFee={Number(c.entry_fee)}
                        balance={balance}
                        label="Join"
                      />
                    ) : (
                      <Link
                        href={`/login?next=${encodeURIComponent(`/matches/${matchId}`)}`}
                        className={cn(
                          buttonVariants({ variant: "default" }),
                          "inline-flex min-h-11 w-full items-center justify-center sm:flex-1",
                        )}
                      >
                        Sign in to join
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
