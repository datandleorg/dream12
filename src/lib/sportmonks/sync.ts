import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture, SmFixturesResponse, SmTeamInclude } from "./client";
import { sportmonksFetch, sportmonksToken } from "./client";

const DEFAULT_UPCOMING_DAYS = 45;
const MAX_SYNC_PAGES = 10;
const FALLBACK_MAX_PAGES = 5;
const FALLBACK_HOURS_PAST = 36;
const FALLBACK_DAYS_AHEAD = 120;

function fixtureTitle(f: SmFixture): string {
  if (f.name?.trim()) return f.name.trim();
  const a = f.localteam?.name ?? "Team A";
  const b = f.visitorteam?.name ?? "Team B";
  return `${a} vs ${b}`;
}

function mapStatus(f: SmFixture): "upcoming" | "live" | "completed" {
  const live = f.live;
  if (live === true || live === 1) return "live";

  const startMs = f.starting_at ? Date.parse(f.starting_at) : NaN;
  const now = Date.now();
  const startsInFuture = Number.isFinite(startMs) && startMs > now;

  const s = (f.status ?? "").toLowerCase();
  if (s.includes("live") || s.includes("inn")) return "live";

  // IPL / Cricket v2: NS = Not Started; blog also mentions Scheduled pre-match
  if (s === "ns" || s.includes("scheduled") || s.includes("not started")) {
    return "upcoming";
  }

  // Not started yet → fantasy home should list it as upcoming even if API status is odd
  if (startsInFuture) {
    return "upcoming";
  }

  if (
    s.includes("finished") ||
    s.includes("completed") ||
    s.includes("aban") ||
    s.includes("abandon")
  ) {
    return "completed";
  }
  return "upcoming";
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function upcomingDateRange(): string {
  const daysRaw = process.env.SPORTMONKS_UPCOMING_DAYS;
  const days = daysRaw ? Math.min(90, Math.max(1, Number(daysRaw))) : DEFAULT_UPCOMING_DAYS;
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return `${utcDateString(start)},${utcDateString(end)}`;
}

type FixtureQueryOpts = {
  /** Omit filter[starts_between] (used when primary window returns nothing). */
  omitStartsBetween?: boolean;
  /** Default ascending by start time; use "-starting_at" for newest-first fallback pages. */
  sort?: string;
};

/**
 * Build query params for Cricket API v2.0 GET /fixtures (see SportMonks docs).
 */
function fixturesListParams(page: number, opts?: FixtureQueryOpts): Record<string, string> {
  const qs: Record<string, string> = {
    include: "localteam,visitorteam,league",
    sort: opts?.sort ?? "starting_at",
    page: String(page),
  };

  if (!opts?.omitStartsBetween) {
    qs["filter[starts_between]"] = upcomingDateRange();
  }

  const leagueId = process.env.SPORTMONKS_LEAGUE_ID?.trim();
  if (leagueId) {
    qs["filter[league_id]"] = leagueId;
  }

  const seasonId = process.env.SPORTMONKS_SEASON_ID?.trim();
  if (seasonId) {
    qs["filter[season_id]"] = seasonId;
  }

  return qs;
}

function passesFallbackWindow(f: SmFixture): boolean {
  if (!f.starting_at) return false;
  const t = Date.parse(f.starting_at);
  if (!Number.isFinite(t)) return false;
  const now = Date.now();
  const maxAhead = now + FALLBACK_DAYS_AHEAD * 86400000;
  const minBehind = now - FALLBACK_HOURS_PAST * 3600000;
  if (t > maxAhead || t < minBehind) return false;
  const s = (f.status ?? "").toLowerCase();
  if (t < now && (s.includes("finished") || s.includes("aban") || s.includes("completed"))) {
    return false;
  }
  return true;
}

/**
 * When filter[starts_between] returns no rows (plan/tier quirks or empty window), pull recent pages
 * sorted by newest start time and keep a bounded window around "now".
 */
async function fetchFixturesFallbackRecent(): Promise<SmFixture[]> {
  const seen = new Set<number>();
  const out: SmFixture[] = [];

  for (let page = 1; page <= FALLBACK_MAX_PAGES; page++) {
    const json = await sportmonksFetch<SmFixturesResponse>(
      "/fixtures",
      fixturesListParams(page, { omitStartsBetween: true, sort: "-starting_at" }),
    );
    const chunk = json.data ?? [];
    if (!chunk.length) break;

    for (const f of chunk) {
      if (!f.id || seen.has(f.id)) continue;
      if (!passesFallbackWindow(f)) continue;
      seen.add(f.id);
      out.push(f);
    }

    if (out.length >= 80) break;

    const lastPage = json.meta?.pagination?.last_page;
    if (typeof lastPage === "number" && page >= lastPage) break;
  }

  return out;
}

async function fetchAllFixturesInWindow(): Promise<{ data: SmFixture[]; usedFallback: boolean }> {
  const aggregated: SmFixture[] = [];

  for (let page = 1; page <= MAX_SYNC_PAGES; page++) {
    const json = await sportmonksFetch<SmFixturesResponse>("/fixtures", fixturesListParams(page));
    const chunk = json.data ?? [];
    if (!chunk.length) break;
    aggregated.push(...chunk);

    const lastPage = json.meta?.pagination?.last_page;
    if (typeof lastPage === "number" && page >= lastPage) break;
  }

  if (aggregated.length > 0) {
    return { data: aggregated, usedFallback: false };
  }

  const fallback = await fetchFixturesFallbackRecent();
  return { data: fallback, usedFallback: fallback.length > 0 };
}

/**
 * Upsert fixtures in a rolling date window. Uses Cricket v2 filters:
 * filter[starts_between], optional filter[league_id] / filter[season_id],
 * include=localteam,visitorteam,league, sort=starting_at, paginated.
 */
export async function syncMatches(): Promise<{ upserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { upserted: 0, note: "SPORTMONKS_API_TOKEN missing; skipped." };
  }

  let data: SmFixture[] = [];
  let usedFallback = false;
  try {
    const r = await fetchAllFixturesInWindow();
    data = r.data;
    usedFallback = r.usedFallback;
  } catch (e) {
    return {
      upserted: 0,
      note: e instanceof Error ? e.message : "Sportmonks fixtures fetch failed",
    };
  }

  if (!data.length) {
    return {
      upserted: 0,
      note:
        "No fixtures (set SPORTMONKS_API_TOKEN, run GET /api/cron/sync with CRON_SECRET; widen SPORTMONKS_UPCOMING_DAYS; check league/season IDs; or run SQL seed 20260328000000_seed_mock_data.sql).",
    };
  }

  const supabase = createServiceClient();
  const rows = data
    .filter((f) => f.id && f.starting_at)
    .map((f) => ({
      id: f.id,
      name: fixtureTitle(f),
      start_time: f.starting_at as string,
      status: mapStatus(f),
      tournament_name: f.league?.name?.trim() || null,
      team_a: f.localteam?.name?.trim() || null,
      team_b: f.visitorteam?.name?.trim() || null,
      team_a_logo_url: f.localteam?.image_path?.trim() || null,
      team_b_logo_url: f.visitorteam?.image_path?.trim() || null,
    }));

  if (!rows.length) {
    return { upserted: 0, note: "Fixtures missing id or starting_at." };
  }

  const { error } = await supabase.from("matches").upsert(rows, {
    onConflict: "id",
  });
  if (error) {
    return { upserted: 0, note: error.message };
  }
  return {
    upserted: rows.length,
    note: usedFallback ? "Used fallback fetch (no rows in starts_between window)." : undefined,
  };
}

/** SportMonks v2 nests includes as `{ data: T | T[] }` or a plain array. */
function unwrapIncludedList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && "data" in raw) {
    const d = (raw as { data?: unknown }).data;
    if (Array.isArray(d)) return d;
    if (d != null && typeof d === "object") return [d as T];
  }
  return [];
}

type NestedPlayer = {
  id?: number;
  player_id?: number;
  fullname?: string;
  display_name?: string;
  common_name?: string;
};

type RawLineupRow = {
  player_id?: number;
  fullname?: string;
  player_name?: string;
  position?: string | { name?: string };
  team?: { name?: string };
  team_id?: number;
  player?: NestedPlayer | { data?: NestedPlayer };
};

interface FixtureDetailResponse {
  data?: {
    id: number;
    localteam_id?: number;
    visitorteam_id?: number;
    localteam?: SmTeamInclude;
    visitorteam?: SmTeamInclude;
    lineup?: RawLineupRow[] | { data?: RawLineupRow[] };
  };
}

function nestedPlayerPayload(row: RawLineupRow): NestedPlayer | undefined {
  const p = row.player;
  if (!p || typeof p !== "object") return undefined;
  if ("data" in p && p.data && typeof p.data === "object") {
    return p.data as NestedPlayer;
  }
  return p as NestedPlayer;
}

function firstNum(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function positionLabel(row: RawLineupRow): string | undefined {
  const pos = row.position;
  if (typeof pos === "string") return pos;
  return pos?.name;
}

function teamNameForLineupRow(
  row: RawLineupRow,
  fixture: NonNullable<FixtureDetailResponse["data"]>,
): string {
  if (row.team?.name?.trim()) return row.team.name.trim();
  const tid = row.team_id;
  if (tid != null && fixture.localteam_id === tid) {
    return fixture.localteam?.name?.trim() ?? "TBC";
  }
  if (tid != null && fixture.visitorteam_id === tid) {
    return fixture.visitorteam?.name?.trim() ?? "TBC";
  }
  return "TBC";
}

const roleMap: Record<string, "BAT" | "BOWL" | "AR" | "WK"> = {
  batsman: "BAT",
  bowler: "BOWL",
  "all rounder": "AR",
  "all-rounder": "AR",
  wicketkeeper: "WK",
  "wicketkeeper batsman": "WK",
};

function inferRole(pos?: string): "BAT" | "BOWL" | "AR" | "WK" {
  if (!pos) return "BAT";
  const k = pos.toLowerCase();
  for (const [needle, r] of Object.entries(roleMap)) {
    if (k.includes(needle)) return r;
  }
  if (k.includes("wk")) return "WK";
  if (k.includes("bowl")) return "BOWL";
  return "BAT";
}

function creditHeuristic(): number {
  return 9;
}

/**
 * Pull lineup for a fixture when Sportmonks includes `lineup` on the fixture detail.
 * Handles v2 `{ lineup: { data: [...] } }` plus `player_name` / `fullname` on each row (Cricket
 * fixture detail does not allow `lineup.player` on all plans—omit nested player include).
 */
export async function syncPlayersForMatch(
  matchId: number,
): Promise<{ inserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { inserted: 0, note: "SPORTMONKS_API_TOKEN missing" };
  }

  let detail: FixtureDetailResponse;
  try {
    detail = await sportmonksFetch<FixtureDetailResponse>(
      `/fixtures/${matchId}`,
      { include: "lineup,localteam,visitorteam" },
    );
  } catch (e) {
    return {
      inserted: 0,
      note: e instanceof Error ? e.message : "fixture fetch failed",
    };
  }

  const fixture = detail.data;
  if (!fixture) {
    return { inserted: 0, note: "No fixture data in API response." };
  }

  const lineup = unwrapIncludedList<RawLineupRow>(fixture.lineup);
  if (!lineup.length) {
    return { inserted: 0, note: "No lineup on fixture (try after squads publish)." };
  }

  const supabase = createServiceClient();
  const rows = lineup
    .map((l) => {
      const nested = nestedPlayerPayload(l);
      const sportmonksId = firstNum(l.player_id, nested?.id, nested?.player_id);
      const name =
        firstStr(
          l.fullname,
          l.player_name,
          nested?.fullname,
          nested?.display_name,
          nested?.common_name,
        ) ??
        (sportmonksId != null ? `Player #${sportmonksId}` : undefined);
      return { sportmonksId, name, row: l };
    })
    .filter((x) => x.sportmonksId != null && x.name)
    .map((x) => ({
      sportmonks_id: x.sportmonksId as number,
      match_id: matchId,
      name: x.name as string,
      team: teamNameForLineupRow(x.row, fixture),
      role: inferRole(positionLabel(x.row)),
      credit_value: creditHeuristic(),
    }));

  if (!rows.length) return { inserted: 0, note: "Lineup rows empty after map." };

  const { error } = await supabase.from("players").upsert(rows, {
    onConflict: "match_id,sportmonks_id",
  });

  if (error) {
    return { inserted: 0, note: error.message };
  }
  return { inserted: rows.length };
}

/** Matches seeded in 20260328000000_seed_mock_data.sql use ids 900001–900099; not in SportMonks. */
export function isSportmonksFixtureId(id: number): boolean {
  return id < 900_001 || id > 909_999;
}

const SYNC_PLAYERS_MATCH_LIMIT = 80;
const SYNC_PLAYERS_PROCESS_CAP = 40;

export async function syncPlayers(): Promise<{ processed: number; inserted: number; notes: string[] }> {
  const supabase = createServiceClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .in("status", ["upcoming", "live"])
    .order("start_time", { ascending: true })
    .limit(SYNC_PLAYERS_MATCH_LIMIT);

  const notes: string[] = [];
  let inserted = 0;
  const ids =
    matches
      ?.map((m) => Number(m.id))
      .filter((id) => isSportmonksFixtureId(id))
      .slice(0, SYNC_PLAYERS_PROCESS_CAP) ?? [];

  for (const id of ids) {
    const r = await syncPlayersForMatch(id);
    inserted += r.inserted;
    if (r.note) notes.push(`match ${id}: ${r.note}`);
  }
  return { processed: ids.length, inserted, notes };
}
