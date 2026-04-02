import { createClient } from "@/lib/supabase/server";
import { SeasonLeaderboardClient } from "@/components/season-leaderboard-client";
import { normalizeLeaderboardRows } from "@/lib/season-leaderboard-rows";
import {
  resolveEffectiveSeasonId,
  type SeasonOption,
} from "@/lib/season-leaderboard-default";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MatchSeasonRow = {
  id: number;
  season_id: number | null;
  status: string;
  scoring_finalized_at: string | null;
};

function countMatchesBySeasonId(
  rows: MatchSeasonRow[] | null,
  filter?: (r: MatchSeasonRow) => boolean,
): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows ?? []) {
    if (r.season_id == null) continue;
    if (filter && !filter(r)) continue;
    const sid = Number(r.season_id);
    m.set(sid, (m.get(sid) ?? 0) + 1);
  }
  return m;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonQ } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: seasonRows, error: seasonErr } = await supabase
    .from("sm_seasons")
    .select("id, name, starting_at, is_current, league_id")
    .order("starting_at", { ascending: false, nullsFirst: true });

  if (process.env.NODE_ENV === "development" && seasonErr) {
    console.error("[leaderboard] sm_seasons:", seasonErr);
  }

  if (!seasonRows?.length) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Season leaderboard
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>No seasons loaded</CardTitle>
            <CardDescription>
              Sync SportMonks reference data so seasons appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const leagueIds = [...new Set(seasonRows.map((s) => Number(s.league_id)))];
  const { data: leagueRows } = await supabase
    .from("sm_leagues")
    .select("id, name")
    .in("id", leagueIds);

  const leagueNameById = new Map(
    (leagueRows ?? []).map((l) => [Number(l.id), String(l.name)]),
  );

  const seasons: SeasonOption[] = seasonRows.map((s) => ({
    id: Number(s.id),
    name: String(s.name),
    starting_at: s.starting_at ?? null,
    is_current: Boolean(s.is_current),
    leagueName: leagueNameById.get(Number(s.league_id)) ?? null,
  }));

  const { data: matchRowsRaw } = await supabase
    .from("matches")
    .select("id, season_id, status, scoring_finalized_at")
    .not("season_id", "is", null);

  const matchRows = (matchRowsRaw ?? []) as MatchSeasonRow[];

  const matchCountBySeasonId = countMatchesBySeasonId(matchRows);
  const finalizedMatchCountBySeasonId = countMatchesBySeasonId(
    matchRows,
    (r) =>
      r.status === "completed" &&
      r.scoring_finalized_at != null &&
      r.scoring_finalized_at !== "",
  );

  const effectiveSeasonId = resolveEffectiveSeasonId(
    seasons,
    matchCountBySeasonId,
    finalizedMatchCountBySeasonId,
    seasonQ,
  );

  if (effectiveSeasonId == null) {
    return (
      <div className="space-y-4 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Season leaderboard
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Could not pick a season</CardTitle>
            <CardDescription>
              Try again after reference data and matches are synced.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const finalizedMatchIds = matchRows
    .filter(
      (m) =>
        Number(m.season_id) === effectiveSeasonId &&
        m.status === "completed" &&
        m.scoring_finalized_at != null &&
        m.scoring_finalized_at !== "",
    )
    .map((m) => m.id);

  let contestsInWindow = 0;
  if (finalizedMatchIds.length > 0) {
    const { count } = await supabase
      .from("contests")
      .select("id", { count: "exact", head: true })
      .in("match_id", finalizedMatchIds);
    contestsInWindow = count ?? 0;
  }

  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    "season_leaderboard",
    {
      p_season_id: effectiveSeasonId,
    },
  );

  if (process.env.NODE_ENV === "development" && rpcErr) {
    console.error("[leaderboard] season_leaderboard RPC:", rpcErr);
  }

  const rows = normalizeLeaderboardRows(
    (rpcRows ?? []) as Record<string, unknown>[],
  );

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Season leaderboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Total points and average per contest across the selected season.
        </p>
      </div>

      {rpcErr ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load leaderboard</CardTitle>
            <CardDescription>
              {rpcErr.message ||
                "Apply the latest database migration (season_leaderboard) and try again."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <SeasonLeaderboardClient
          seasons={seasons}
          initialSeasonId={effectiveSeasonId}
          rows={rows}
          currentUserId={user?.id ?? ""}
          contestsInWindow={contestsInWindow}
        />
      )}
    </div>
  );
}
