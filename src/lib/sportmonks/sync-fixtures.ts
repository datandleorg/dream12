import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture, SmFixturesResponse } from "./client";
import { SM_FIXTURE_LIST_INCLUDE, sportmonksFetch, sportmonksToken } from "./client";
import { upsertFromFixturesBatch } from "./sync-fixture-upsert";

const DEFAULT_UPCOMING_DAYS = 45;
const MAX_SYNC_PAGES = 10;
const FALLBACK_MAX_PAGES = 5;
const FALLBACK_HOURS_PAST = 36;
const FALLBACK_DAYS_AHEAD = 120;

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
    include: SM_FIXTURE_LIST_INCLUDE,
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

/**
 * Upsert fixtures; when `primarySeasonId` is set (resolved IPL / env season), loads that season's fixtures.
 */
export async function syncMatches(opts?: {
  primarySeasonId?: number | null;
}): Promise<{
  upserted: number;
  venuesUpserted: number;
  stagesUpserted: number;
  teamsUpserted: number;
  note?: string;
}> {
  if (!sportmonksToken()) {
    return {
      upserted: 0,
      venuesUpserted: 0,
      stagesUpserted: 0,
      teamsUpserted: 0,
      note: "SPORTMONKS_API_TOKEN missing; skipped.",
    };
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
      venuesUpserted: 0,
      stagesUpserted: 0,
      teamsUpserted: 0,
      note: e instanceof Error ? e.message : "Sportmonks fixtures fetch failed",
    };
  }

  if (!data.length) {
    return {
      upserted: 0,
      venuesUpserted: 0,
      stagesUpserted: 0,
      teamsUpserted: 0,
      note:
        "No fixtures (check SPORTMONKS_* env, league/season IDs, or SQL seed 20260328000000_seed_mock_data.sql).",
    };
  }

  const supabase = createServiceClient();
  const batch = await upsertFromFixturesBatch(supabase, data);

  if (batch.error) {
    return {
      upserted: 0,
      venuesUpserted: batch.venuesUpserted,
      stagesUpserted: batch.stagesUpserted,
      teamsUpserted: batch.teamsUpserted,
      note: batch.error,
    };
  }

  const parts: string[] = [];
  if (usedFallback) parts.push("Used fallback fetch (no rows in primary fixture query).");
  if (batch.note) parts.push(batch.note);

  return {
    upserted: batch.matchesUpserted,
    venuesUpserted: batch.venuesUpserted,
    stagesUpserted: batch.stagesUpserted,
    teamsUpserted: batch.teamsUpserted,
    note: parts.length ? parts.join(" ") : undefined,
  };
}
