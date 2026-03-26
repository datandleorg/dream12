import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HomeUpcomingCard,
  type HomeMatchCardModel,
} from "@/components/home-upcoming-card";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("matches")
    .select(
      `
      id,
      name,
      start_time,
      status,
      tournament_name,
      team_a,
      team_b,
      team_a_logo_url,
      team_b_logo_url,
      contests ( prize_pool )
    `,
    )
    .in("status", ["upcoming", "live"])
    .order("start_time", { ascending: true });

  const matches: HomeMatchCardModel[] = (rows ?? []).map((m) => {
    const contests = (m as { contests?: { prize_pool: unknown }[] | null })
      .contests;
    const pools = (contests ?? []).map((c) => Number(c.prize_pool ?? 0));
    const max_prize_pool = pools.length ? Math.max(...pools) : 0;
    return {
      id: m.id,
      name: m.name,
      start_time: m.start_time,
      status: m.status,
      tournament_name: m.tournament_name,
      team_a: m.team_a,
      team_b: m.team_b,
      team_a_logo_url: m.team_a_logo_url,
      team_b_logo_url: m.team_b_logo_url,
      max_prize_pool,
    };
  });

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upcoming</h1>
        <p className="text-muted-foreground text-sm">
          Pick a match and join a contest.
        </p>
      </div>
      {!matches.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No upcoming matches</CardTitle>
            <CardDescription>
              Run sync or seed mock data in Supabase.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => (
            <HomeUpcomingCard key={m.id} match={m} />
          ))}
        </ul>
      )}
    </div>
  );
}
