import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import {
  HomeUpcomingCard,
  type HomeMatchCardModel,
} from "@/components/home-upcoming-card";
import { MatchListSection } from "@/components/match-list-filter";
import {
  parseMatchListFilter,
  type MatchListFilter,
} from "@/lib/match-list-filter";
import { isContestVisibleToUser } from "@/lib/contest-visibility";

const matchColumns =
  "id, name, start_time, status, tournament_name, team_a, team_b, team_a_logo_url, team_b_logo_url, live_snapshot, sm_fixture_status";

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
  live_snapshot: unknown;
  sm_fixture_status: string | null;
};

const EMPTY_COPY: Record<MatchListFilter, string> = {
  live: "No live matches right now.",
  upcoming: "No upcoming matches.",
  completed: "No completed matches yet.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: raw } = await searchParams;
  const filter = parseMatchListFilter(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase.from("matches").select(matchColumns);
  query =
    filter === "completed"
      ? query.in("status", ["completed", "in_review"]).order("start_time", { ascending: false })
      : query.eq("status", filter).order("start_time", { ascending: true });

  const { data: statusRows, error: matchErr } = await query;

  if (process.env.NODE_ENV === "development" && matchErr) {
    console.error("[home] matches query error:", matchErr);
  }

  const rows = (statusRows ?? []) as MatchRow[];

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
      live_snapshot: m.live_snapshot,
      sm_fixture_status: m.sm_fixture_status,
    };
  });

  const subtitle =
    filter === "live"
      ? "Matches in progress — pick a match and join a contest."
      : filter === "upcoming"
        ? "Starting soon — pick a match and join a contest."
        : "Past matches — open for results and contests you joined.";

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
        <Link
          href="/leaderboard"
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            "tap-app mt-1 inline-flex min-h-9 px-0",
          )}
        >
          Season leaderboard
        </Link>
      </div>

      <MatchListSection>
        {!matches.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{EMPTY_COPY[filter]}</CardTitle>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-3">
            {matches.map((m) => (
              <HomeUpcomingCard key={String(m.id)} match={m} />
            ))}
          </ul>
        )}
      </MatchListSection>
    </div>
  );
}
