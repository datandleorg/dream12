import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HomeUpcomingCard,
  type HomeMatchCardModel,
} from "@/components/home-upcoming-card";
import { MatchListSection } from "@/components/match-list-filter";
import {
  resolveHomeMatchListFilter,
  type MatchListFilter,
} from "@/lib/match-list-filter";
import { isContestVisibleToUser } from "@/lib/contest-visibility";
import { venueStageLabels } from "@/lib/match-venue-stage";

const matchColumns =
  "id, name, start_time, status, tournament_name, team_a, team_b, team_a_logo_url, team_b_logo_url, live_snapshot, sm_fixture_status, venue_id, stage_id, match_format, localteam_id, visitorteam_id, toss_winner_team_id, toss_decision";

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
  venue_id: number | null;
  stage_id: number | null;
  match_format: string | null;
  localteam_id: number | null;
  visitorteam_id: number | null;
  toss_winner_team_id: number | null;
  toss_decision: string | null;
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { count: liveCount } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("status", "live");

  const filter = resolveHomeMatchListFilter(raw, (liveCount ?? 0) > 0);

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

  const venueIds = [
    ...new Set(
      rows
        .map((m) => (m.venue_id != null ? Number(m.venue_id) : NaN))
        .filter((id) => Number.isFinite(id)),
    ),
  ];
  const stageIds = [
    ...new Set(
      rows
        .map((m) => (m.stage_id != null ? Number(m.stage_id) : NaN))
        .filter((id) => Number.isFinite(id)),
    ),
  ];

  const venueById = new Map<
    number,
    { name: string | null; city: string | null }
  >();
  const stageById = new Map<
    number,
    { name: string | null; code: string | null }
  >();

  if (venueIds.length > 0) {
    const { data: venueRows } = await supabase
      .from("sm_venues")
      .select("id,name,city")
      .in("id", venueIds);
    for (const v of venueRows ?? []) {
      venueById.set(Number(v.id), {
        name: v.name as string | null,
        city: v.city as string | null,
      });
    }
  }
  if (stageIds.length > 0) {
    const { data: stageRows } = await supabase
      .from("sm_stages")
      .select("id,name,code")
      .in("id", stageIds);
    for (const s of stageRows ?? []) {
      stageById.set(Number(s.id), {
        name: s.name as string | null,
        code: s.code as string | null,
      });
    }
  }

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
    const vid = m.venue_id != null ? Number(m.venue_id) : null;
    const sid = m.stage_id != null ? Number(m.stage_id) : null;
    const venueRow = vid != null && Number.isFinite(vid) ? venueById.get(vid) : null;
    const stageRow = sid != null && Number.isFinite(sid) ? stageById.get(sid) : null;
    const { venueLine, stageLine } = venueStageLabels(venueRow, stageRow);
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
      venue_line: venueLine,
      stage_line: stageLine,
      match_format: m.match_format?.trim() || null,
      localteam_id:
        m.localteam_id != null ? Number(m.localteam_id) : null,
      visitorteam_id:
        m.visitorteam_id != null ? Number(m.visitorteam_id) : null,
      toss_winner_team_id:
        m.toss_winner_team_id != null
          ? Number(m.toss_winner_team_id)
          : null,
      toss_decision:
        typeof m.toss_decision === "string" ? m.toss_decision : null,
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
      </div>

      <MatchListSection activeFilter={filter}>
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
