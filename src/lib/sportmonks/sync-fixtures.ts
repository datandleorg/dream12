import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture, SmFixturesResponse } from "./client";
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

  if (s === "ns" || s.includes("scheduled") || s.includes("not started")) {
    return "upcoming";
  }

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
  omitStartsBetween?: boolean;
  sort?: string;
  /** Prefer season-scoped fixture lists (IPL current season). */
  seasonIdFilter?: number;
};

/**
 * Build query params for Cricket API v2.0 GET /fixtures.
 * When `seasonIdFilter` is set, uses filter[season_id] and skips the date window.
 */
function fixturesListParams(page: number, opts?: FixtureQueryOpts): Record<string, string> {
  const qs: Record<string, string> = {
    include: "localteam,visitorteam,league",
    sort: opts?.sort ?? "starting_at",
    page: String(page),
  };

  const envSeason = process.env.SPORTMONKS_SEASON_ID?.trim();
  const seasonNum =
    opts?.seasonIdFilter ??
    (envSeason && /^\d+$/.test(envSeason) ? Number(envSeason) : undefined);

  if (seasonNum != null && Number.isFinite(seasonNum)) {
    qs["filter[season_id]"] = String(seasonNum);
  } else if (!opts?.omitStartsBetween) {
    qs["filter[starts_between]"] = upcomingDateRange();
  }

  const leagueId = process.env.SPORTMONKS_LEAGUE_ID?.trim();
  if (leagueId) {
    qs["filter[league_id]"] = leagueId;
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

async function fetchFixturesFallbackRecent(
  seasonIdFilter?: number,
): Promise<SmFixture[]> {
  const seen = new Set<number>();
  const out: SmFixture[] = [];

  for (let page = 1; page <= FALLBACK_MAX_PAGES; page++) {
    const json = await sportmonksFetch<SmFixturesResponse>(
      "/fixtures",
      fixturesListParams(page, {
        omitStartsBetween: true,
        sort: "-starting_at",
        seasonIdFilter,
      }),
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

async function fetchAllFixturesInWindow(seasonIdFilter?: number): Promise<{
  data: SmFixture[];
  usedFallback: boolean;
}> {
  const aggregated: SmFixture[] = [];

  for (let page = 1; page <= MAX_SYNC_PAGES; page++) {
    const json = await sportmonksFetch<SmFixturesResponse>(
      "/fixtures",
      fixturesListParams(page, { seasonIdFilter }),
    );
    const chunk = json.data ?? [];
    if (!chunk.length) break;
    aggregated.push(...chunk);

    const lastPage = json.meta?.pagination?.last_page;
    if (typeof lastPage === "number" && page >= lastPage) break;
  }

  if (aggregated.length > 0) {
    return { data: aggregated, usedFallback: false };
  }

  const fallback = await fetchFixturesFallbackRecent(seasonIdFilter);
  return { data: fallback, usedFallback: fallback.length > 0 };
}

function teamIdFromInclude(
  explicit: number | undefined,
  inc?: { id?: number },
): number | undefined {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  if (inc?.id != null && Number.isFinite(inc.id)) return inc.id;
  return undefined;
}

/**
 * Upsert fixtures; when `primarySeasonId` is set (resolved IPL / env season), loads that season's fixtures.
 */
export async function syncMatches(opts?: {
  primarySeasonId?: number | null;
}): Promise<{ upserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { upserted: 0, note: "SPORTMONKS_API_TOKEN missing; skipped." };
  }

  const seasonIdFilter =
    opts?.primarySeasonId != null && Number.isFinite(opts.primarySeasonId)
      ? opts.primarySeasonId
      : undefined;

  let data: SmFixture[] = [];
  let usedFallback = false;
  try {
    const r = await fetchAllFixturesInWindow(seasonIdFilter);
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
        "No fixtures (check SPORTMONKS_* env, league/season IDs, or SQL seed 20260328000000_seed_mock_data.sql).",
    };
  }

  const supabase = createServiceClient();

  const teamRows = new Map<
    number,
    { id: number; name: string; short_code: string | null; image_path: string | null }
  >();
  for (const f of data) {
    const lid = teamIdFromInclude(f.localteam_id, f.localteam as { id?: number } | undefined);
    if (lid != null && f.localteam?.name) {
      teamRows.set(lid, {
        id: lid,
        name: f.localteam.name.trim(),
        short_code: null,
        image_path: f.localteam.image_path?.trim() ?? null,
      });
    }
    const vid = teamIdFromInclude(f.visitorteam_id, f.visitorteam as { id?: number } | undefined);
    if (vid != null && f.visitorteam?.name) {
      teamRows.set(vid, {
        id: vid,
        name: f.visitorteam.name.trim(),
        short_code: null,
        image_path: f.visitorteam.image_path?.trim() ?? null,
      });
    }
  }
  if (teamRows.size) {
    const { error: teamErr } = await supabase.from("sm_teams").upsert([...teamRows.values()], {
      onConflict: "id",
    });
    if (teamErr) {
      return { upserted: 0, note: `sm_teams upsert: ${teamErr.message}` };
    }
  }

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
      league_id: f.league_id ?? null,
      season_id: f.season_id ?? null,
      localteam_id: teamIdFromInclude(
        f.localteam_id,
        f.localteam as { id?: number } | undefined,
      ),
      visitorteam_id: teamIdFromInclude(
        f.visitorteam_id,
        f.visitorteam as { id?: number } | undefined,
      ),
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
    note: usedFallback ? "Used fallback fetch (no rows in primary fixture query)." : undefined,
  };
}
