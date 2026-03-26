import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture, SmFixturesResponse } from "./client";
import { sportmonksFetch, sportmonksToken } from "./client";

function fixtureTitle(f: SmFixture): string {
  if (f.name?.trim()) return f.name.trim();
  const a = f.localteam?.name ?? "Team A";
  const b = f.visitorteam?.name ?? "Team B";
  return `${a} vs ${b}`;
}

function mapStatus(raw?: string): "upcoming" | "live" | "completed" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("live") || s.includes("inn")) return "live";
  if (s.includes("finished") || s.includes("completed") || s.includes("abandon"))
    return "completed";
  return "upcoming";
}

/**
 * Upsert upcoming fixtures. Uses league filter when SPORTMONKS_LEAGUE_ID is set,
 * otherwise fetches the first page of fixtures (tune in dashboard).
 */
export async function syncMatches(): Promise<{ upserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { upserted: 0, note: "SPORTMONKS_API_TOKEN missing; skipped." };
  }

  const leagueId = process.env.SPORTMONKS_LEAGUE_ID;
  let data: SmFixture[] = [];

  try {
    const qs: Record<string, string> = { per_page: "50" };
    if (leagueId) {
      qs.filters = `leagues:${leagueId}`;
    }
    const json = await sportmonksFetch<SmFixturesResponse>("/fixtures", qs);
    data = json.data ?? [];
  } catch (e) {
    return {
      upserted: 0,
      note: e instanceof Error ? e.message : "Sportmonks fixtures fetch failed",
    };
  }

  if (!data.length) {
    return { upserted: 0, note: "No fixtures returned (check league filter / token)." };
  }

  const supabase = createServiceClient();
  const rows = data
    .filter((f) => f.id && f.starting_at)
    .map((f) => ({
      id: f.id,
      name: fixtureTitle(f),
      start_time: f.starting_at as string,
      status: mapStatus(f.status),
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
  return { upserted: rows.length };
}

type LineupPlayer = {
  player_id?: number;
  fullname?: string;
  position?: { name?: string };
  team?: { name?: string };
};

interface FixtureDetailResponse {
  data?: {
    id: number;
    lineup?: LineupPlayer[];
  };
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
      { include: "lineup" },
    );
  } catch (e) {
    return {
      inserted: 0,
      note: e instanceof Error ? e.message : "fixture fetch failed",
    };
  }

  const fixture = detail.data;
  const lineup = fixture?.lineup;
  if (!lineup?.length) {
    return { inserted: 0, note: "No lineup on fixture (try after squads publish)." };
  }

  const supabase = createServiceClient();
  const rows = lineup
    .filter((l) => l.player_id && l.fullname)
    .map((l) => ({
      sportmonks_id: l.player_id as number,
      match_id: matchId,
      name: l.fullname as string,
      team: l.team?.name ?? "TBC",
      role: inferRole(l.position?.name),
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

export async function syncPlayers(): Promise<{ processed: number; inserted: number; notes: string[] }> {
  const supabase = createServiceClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "upcoming")
    .limit(20);

  const notes: string[] = [];
  let inserted = 0;
  const ids = matches?.map((m) => m.id) ?? [];
  for (const id of ids) {
    const r = await syncPlayersForMatch(Number(id));
    inserted += r.inserted;
    if (r.note) notes.push(`match ${id}: ${r.note}`);
  }
  return { processed: ids.length, inserted, notes };
}
