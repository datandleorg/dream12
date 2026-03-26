import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HomeUpcomingCard,
  type HomeMatchCardModel,
} from "@/components/home-upcoming-card";
import { isContestVisibleToUser } from "@/lib/contest-visibility";

const matchColumns =
  "id, name, start_time, status, tournament_name, team_a, team_b, team_a_logo_url, team_b_logo_url";

type MatchRow = {
  id: number | string;
  name: string;
  start_time: string;
  status: string;
  tournament_name: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_logo_url: string | null;
  team_b_logo_url: string | null;
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowIso = new Date().toISOString();

  const [{ data: statusRows, error: errUpcoming }, { data: futureCompletedRows, error: errFuture }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(matchColumns)
        .in("status", ["upcoming", "live"])
        .order("start_time", { ascending: true }),
      supabase
        .from("matches")
        .select(matchColumns)
        .eq("status", "completed")
        .gt("start_time", nowIso)
        .order("start_time", { ascending: true }),
    ]);

  if (process.env.NODE_ENV === "development" && (errUpcoming || errFuture)) {
    console.error("[home] matches query error:", errUpcoming ?? errFuture);
  }

  const byId = new Map<number, MatchRow>();
  for (const m of (statusRows ?? []) as MatchRow[]) {
    byId.set(Number(m.id), m);
  }
  for (const m of (futureCompletedRows ?? []) as MatchRow[]) {
    if (!byId.has(Number(m.id))) byId.set(Number(m.id), m);
  }
  const rows = [...byId.values()].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  const matchIds = rows.map((m) => Number(m.id));
  const contestsByMatchId = new Map<
    number,
    { prize_pool: unknown; created_by: string | null; creator_joined_at: string | null }[]
  >();

  if (matchIds.length > 0) {
    const { data: contestRows, error: contestErr } = await supabase
      .from("contests")
      .select("match_id, prize_pool, created_by, creator_joined_at")
      .in("match_id", matchIds);

    if (process.env.NODE_ENV === "development" && contestErr) {
      console.error("[home] contests query error:", contestErr);
    }

    for (const c of contestRows ?? []) {
      const mid = Number((c as { match_id: number | string }).match_id);
      const row = c as {
        match_id: number | string;
        prize_pool: unknown;
        created_by: string | null;
        creator_joined_at: string | null;
      };
      if (!contestsByMatchId.has(mid)) contestsByMatchId.set(mid, []);
      contestsByMatchId.get(mid)!.push({
        prize_pool: row.prize_pool,
        created_by: row.created_by ?? null,
        creator_joined_at: row.creator_joined_at ?? null,
      });
    }
  }

  const matches: HomeMatchCardModel[] = rows.map((m) => {
    const contestsRaw = contestsByMatchId.get(Number(m.id)) ?? [];
    const visible = contestsRaw.filter((c) =>
      isContestVisibleToUser(
        {
          created_by: c.created_by,
          creator_joined_at: c.creator_joined_at,
        },
        user?.id,
      ),
    );
    const pools = visible.map((c) => Number(c.prize_pool ?? 0));
    const max_prize_pool = pools.length ? Math.max(...pools) : 0;
    return {
      id: Number(m.id),
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
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => (
            <HomeUpcomingCard key={String(m.id)} match={m} />
          ))}
        </ul>
      )}
    </div>
  );
}
