import { createServiceClient } from "@/lib/supabase/service";
import { sportmonksFetch, sportmonksToken } from "./client";
import { fetchAllPages } from "./pagination";

type SmLeagueApi = {
  id: number;
  name?: string;
  code?: string;
  image_path?: string;
  type?: string;
  updated_at?: string;
};

type SmSeasonApi = {
  id: number;
  league_id: number;
  name?: string;
  code?: string;
  starting_at?: string;
  ending_at?: string;
  updated_at?: string;
};

export function unwrapIncludedList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && "data" in raw) {
    const d = (raw as { data?: unknown }).data;
    if (Array.isArray(d)) return d;
    if (d != null && typeof d === "object") return [d as T];
  }
  return [];
}

/** One upsert must not list the same PK twice — paginated API responses sometimes repeat rows. */
function dedupeLeagues(rows: SmLeagueApi[]): SmLeagueApi[] {
  const map = new Map<number, SmLeagueApi>();
  for (const r of rows) {
    if (r.id != null && Number.isFinite(r.id)) map.set(r.id, r);
  }
  return [...map.values()];
}

function dedupeSeasons(rows: SmSeasonApi[]): SmSeasonApi[] {
  const map = new Map<number, SmSeasonApi>();
  for (const r of rows) {
    if (r.id != null && Number.isFinite(r.id)) map.set(r.id, r);
  }
  return [...map.values()];
}

export async function syncLeagues(): Promise<{ upserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { upserted: 0, note: "SPORTMONKS_API_TOKEN missing" };
  }
  try {
    const rows = dedupeLeagues(await fetchAllPages<SmLeagueApi>("/leagues", { sort: "name" }));
    if (!rows.length) return { upserted: 0, note: "No leagues in API response." };
    const supabase = createServiceClient();
    const payload = rows.map((l) => ({
      id: l.id,
      name: l.name?.trim() || `League ${l.id}`,
      code: l.code?.trim() ?? null,
      image_path: l.image_path?.trim() ?? null,
      league_type: l.type?.trim() ?? null,
      updated_at: l.updated_at ?? null,
    }));
    const { error } = await supabase.from("sm_leagues").upsert(payload, { onConflict: "id" });
    if (error) return { upserted: 0, note: error.message };
    return { upserted: payload.length };
  } catch (e) {
    return { upserted: 0, note: e instanceof Error ? e.message : "syncLeagues failed" };
  }
}

export async function syncSeasons(): Promise<{ upserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { upserted: 0, note: "SPORTMONKS_API_TOKEN missing" };
  }
  try {
    const rows = dedupeSeasons(await fetchAllPages<SmSeasonApi>("/seasons", { sort: "-id" }));
    if (!rows.length) return { upserted: 0, note: "No seasons in API response." };
    const supabase = createServiceClient();
    const payload = rows.map((s) => ({
      id: s.id,
      league_id: s.league_id,
      name: s.name?.trim() || `Season ${s.id}`,
      code: s.code?.trim() ?? null,
      starting_at: s.starting_at ?? null,
      ending_at: s.ending_at ?? null,
      is_current: false,
      updated_at: s.updated_at ?? null,
    }));
    const { error } = await supabase.from("sm_seasons").upsert(payload, { onConflict: "id" });
    if (error) return { upserted: 0, note: error.message };
    return { upserted: payload.length };
  } catch (e) {
    return { upserted: 0, note: e instanceof Error ? e.message : "syncSeasons failed" };
  }
}

export async function markLatestSeasonCurrentForLeague(
  leagueId: number,
): Promise<{ note?: string }> {
  const supabase = createServiceClient();
  await supabase.from("sm_seasons").update({ is_current: false }).eq("league_id", leagueId);
  const { data } = await supabase
    .from("sm_seasons")
    .select("id")
    .eq("league_id", leagueId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id) return { note: `No seasons for league_id=${leagueId}` };
  const { error } = await supabase
    .from("sm_seasons")
    .update({ is_current: true })
    .eq("id", data.id);
  if (error) return { note: error.message };
  return {};
}

export async function resolveActiveSeasonId(): Promise<number | null> {
  const supabase = createServiceClient();
  const env = process.env.SPORTMONKS_SEASON_ID?.trim();
  if (env && /^\d+$/.test(env)) return Number(env);

  const leagueRaw = process.env.SPORTMONKS_LEAGUE_ID?.trim();
  if (!leagueRaw || !/^\d+$/.test(leagueRaw)) return null;
  const leagueId = Number(leagueRaw);

  const { data: current } = await supabase
    .from("sm_seasons")
    .select("id")
    .eq("league_id", leagueId)
    .eq("is_current", true)
    .maybeSingle();
  if (current?.id != null) return Number(current.id);

  const { data: latest } = await supabase
    .from("sm_seasons")
    .select("id")
    .eq("league_id", leagueId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return latest?.id != null ? Number(latest.id) : null;
}

export async function syncSeasonTeamsFromApi(
  seasonId: number,
): Promise<{ upsertedTeams: number; links: number; note?: string }> {
  if (!sportmonksToken()) {
    return { upsertedTeams: 0, links: 0, note: "SPORTMONKS_API_TOKEN missing" };
  }
  try {
    const json = await sportmonksFetch<{
      data?: {
        id: number;
        teams?: unknown;
      };
    }>(`/seasons/${seasonId}`, { include: "teams" });
    const teams = unwrapIncludedList<{
      id: number;
      name?: string;
      code?: string;
      image_path?: string;
      updated_at?: string;
    }>(json.data?.teams);
    if (!teams.length) {
      return { upsertedTeams: 0, links: 0, note: "Season has no teams in include=teams." };
    }
    const teamById = new Map<
      number,
      { id: number; name?: string; code?: string; image_path?: string; updated_at?: string }
    >();
    for (const t of teams) {
      if (t.id != null && Number.isFinite(t.id)) teamById.set(t.id, t);
    }
    const uniqueTeams = [...teamById.values()];

    const supabase = createServiceClient();
    const teamPayload = uniqueTeams.map((t) => ({
      id: t.id,
      name: t.name?.trim() || `Team ${t.id}`,
      short_code: t.code?.trim() ?? null,
      image_path: t.image_path?.trim() ?? null,
      updated_at: t.updated_at ?? null,
    }));
    const { error: te } = await supabase.from("sm_teams").upsert(teamPayload, { onConflict: "id" });
    if (te) return { upsertedTeams: 0, links: 0, note: te.message };

    const linkRows = uniqueTeams.map((t) => ({ season_id: seasonId, team_id: t.id }));
    const { error: le } = await supabase.from("sm_season_team").upsert(linkRows, {
      onConflict: "season_id,team_id",
    });
    if (le) return { upsertedTeams: teamPayload.length, links: 0, note: le.message };
    return { upsertedTeams: teamPayload.length, links: linkRows.length };
  } catch (e) {
    return {
      upsertedTeams: 0,
      links: 0,
      note: e instanceof Error ? e.message : "syncSeasonTeamsFromApi failed",
    };
  }
}

export async function backfillSeasonTeamsFromMatches(
  seasonId: number,
): Promise<{ inserted: number; note?: string }> {
  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("matches")
    .select("localteam_id, visitorteam_id")
    .eq("season_id", seasonId);
  if (error) return { inserted: 0, note: error.message };
  const pairs = new Map<string, { season_id: number; team_id: number }>();
  for (const r of rows ?? []) {
    const a = r.localteam_id as number | null;
    const b = r.visitorteam_id as number | null;
    if (a != null) pairs.set(`${seasonId}-${a}`, { season_id: seasonId, team_id: a });
    if (b != null) pairs.set(`${seasonId}-${b}`, { season_id: seasonId, team_id: b });
  }
  const list = [...pairs.values()];
  if (!list.length) return { inserted: 0 };
  const { error: up } = await supabase.from("sm_season_team").upsert(list, {
    onConflict: "season_id,team_id",
  });
  if (up) return { inserted: 0, note: up.message };
  return { inserted: list.length };
}
