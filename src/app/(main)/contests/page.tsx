import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function MyContestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: teams } = await supabase
    .from("user_teams")
    .select(
      `
      id,
      total_points,
      contest_id,
      contests (
        id,
        name,
        match_id,
        entry_fee,
        prize_pool,
        matches ( name )
      )
    `,
    )
    .eq("user_id", user.id);

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">My contests</h1>
      {!teams?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No teams yet</CardTitle>
            <CardDescription>
              Open a match, join a contest, and build your XI.
            </CardDescription>
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "default" }),
                "mt-4 inline-flex min-h-11 w-full items-center justify-center",
              )}
            >
              Browse matches
            </Link>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {teams.map((t) => {
            const c = t.contests as unknown as {
              id: string;
              name: string | null;
              match_id: number;
              entry_fee: number;
              prize_pool: number;
              matches: { name: string } | null;
            } | null;
            const matchName = c?.matches?.name ?? "Match";
            const title = c?.name?.trim() || `Contest · ${matchName}`;
            return (
              <li key={t.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{title}</CardTitle>
                    <CardDescription>
                      Points: {Number(t.total_points).toFixed(1)} · Pool ₹
                      {Number(c?.prize_pool ?? 0)}
                    </CardDescription>
                    <div className="flex gap-2 pt-2">
                      <Link
                        href={`/contests/${c?.id}`}
                        className={cn(
                          buttonVariants({ variant: "secondary" }),
                          "inline-flex min-h-11 flex-1 items-center justify-center",
                        )}
                      >
                        Leaderboard
                      </Link>
                      <Link
                        href={`/matches/${c?.match_id}/contests/${c?.id}/squad`}
                        className={cn(
                          buttonVariants({ variant: "default" }),
                          "inline-flex min-h-11 flex-1 items-center justify-center",
                        )}
                      >
                        Edit team
                      </Link>
                    </div>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
