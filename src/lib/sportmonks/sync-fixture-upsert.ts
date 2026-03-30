import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmFixture, SmStageInclude, SmVenueInclude } from "./client";
import { mapMatchStatusFromSmFixture, smFixtureStatusLabel } from "./match-status-from-sm";

export { mapMatchStatusFromSmFixture } from "./match-status-from-sm";

export function fixtureTitle(f: SmFixture): string {
  if (f.name?.trim()) return f.name.trim();
  const a = f.localteam?.name ?? "Team A";
  const b = f.visitorteam?.name ?? "Team B";
  return `${a} vs ${b}`;
}

export function teamIdFromInclude(
  explicit: number | undefined,
  inc?: { id?: number },
): number | undefined {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  if (inc?.id != null && Number.isFinite(inc.id)) return inc.id;
  return undefined;
}

type TeamRow = {
  id: number;
  name: string;
  short_code: string | null;
  image_path: string | null;
};

type VenueRow = {
  id: number;
  country_id: number | null;
  name: string;
  city: string | null;
  image_path: string | null;
  capacity: number | null;
  floodlight: boolean | null;
  updated_at: string | null;
};

type StageRow = {
  id: number;
  league_id: number;
  season_id: number;
  name: string;
  code: string | null;
  stage_type: string | null;
  updated_at: string | null;
};

export type MatchUpsertRow = {
  id: number;
  name: string;
  start_time: string;
  status: "upcoming" | "live" | "completed" | "in_review";
  sm_fixture_status: string | null;
  tournament_name: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_logo_url: string | null;
  team_b_logo_url: string | null;
  league_id: number | null;
  season_id: number | null;
  localteam_id: number | null;
  visitorteam_id: number | null;
  venue_id: number | null;
  stage_id: number | null;
  match_format: string | null;
};

function venueIdFromFixture(f: SmFixture): number | undefined {
  const fromTop = f.venue_id;
  if (fromTop != null && Number.isFinite(fromTop)) return fromTop;
  const nested = f.venue?.id;
  if (nested != null && Number.isFinite(nested)) return nested;
  return undefined;
}

function stageIdFromFixture(f: SmFixture): number | undefined {
  const fromTop = f.stage_id;
  if (fromTop != null && Number.isFinite(fromTop)) return fromTop;
  const nested = f.stage?.id;
  if (nested != null && Number.isFinite(nested)) return nested;
  return undefined;
}

function venueRowFromInclude(v: SmVenueInclude): VenueRow | null {
  const id = v.id;
  if (id == null || !Number.isFinite(id)) return null;
  const name = v.name?.trim();
  if (!name) return null;
  return {
    id,
    country_id: v.country_id != null && Number.isFinite(v.country_id) ? v.country_id : null,
    name,
    city: v.city?.trim() ?? null,
    image_path: v.image_path?.trim() ?? null,
    capacity: v.capacity != null && Number.isFinite(v.capacity) ? v.capacity : null,
    floodlight:
      v.floodlight === true || v.floodlight === false
        ? v.floodlight
        : v.floodlight === 1
          ? true
          : v.floodlight === 0
            ? false
            : null,
    updated_at: v.updated_at ?? null,
  };
}

function stageRowFromInclude(
  stage: SmStageInclude,
  fallbackLeagueId: number | undefined,
  fallbackSeasonId: number | undefined,
): StageRow | null {
  const id = stage.id;
  if (id == null || !Number.isFinite(id)) return null;
  const leagueId = stage.league_id ?? fallbackLeagueId;
  const seasonId = stage.season_id ?? fallbackSeasonId;
  if (leagueId == null || !Number.isFinite(leagueId)) return null;
  if (seasonId == null || !Number.isFinite(seasonId)) return null;
  const name = stage.name?.trim() || `Stage ${id}`;
  return {
    id,
    league_id: leagueId,
    season_id: seasonId,
    name,
    code: stage.code?.trim() ?? null,
    stage_type: stage.type != null && String(stage.type).trim() ? String(stage.type).trim() : null,
    updated_at: stage.updated_at ?? null,
  };
}

function collectTeams(data: SmFixture[]): Map<number, TeamRow> {
  const teamRows = new Map<number, TeamRow>();
  for (const f of data) {
    const lid = teamIdFromInclude(f.localteam_id, f.localteam);
    if (lid != null && f.localteam?.name) {
      teamRows.set(lid, {
        id: lid,
        name: f.localteam.name.trim(),
        short_code: null,
        image_path: f.localteam.image_path?.trim() ?? null,
      });
    }
    const vid = teamIdFromInclude(f.visitorteam_id, f.visitorteam);
    if (vid != null && f.visitorteam?.name) {
      teamRows.set(vid, {
        id: vid,
        name: f.visitorteam.name.trim(),
        short_code: null,
        image_path: f.visitorteam.image_path?.trim() ?? null,
      });
    }
  }
  return teamRows;
}

function collectVenues(data: SmFixture[]): Map<number, VenueRow> {
  const map = new Map<number, VenueRow>();
  for (const f of data) {
    if (f.venue) {
      const row = venueRowFromInclude(f.venue);
      if (row) map.set(row.id, row);
    }
  }
  return map;
}

function collectStages(data: SmFixture[]): Map<number, StageRow> {
  const map = new Map<number, StageRow>();
  for (const f of data) {
    if (!f.stage) continue;
    const row = stageRowFromInclude(f.stage, f.league_id, f.season_id);
    if (row) map.set(row.id, row);
  }
  return map;
}

export function smFixtureToMatchRow(f: SmFixture): MatchUpsertRow | null {
  if (!f.id || !f.starting_at) return null;
  return {
    id: f.id,
    name: fixtureTitle(f),
    start_time: f.starting_at,
    status: mapMatchStatusFromSmFixture(f),
    sm_fixture_status: smFixtureStatusLabel(f),
    tournament_name: f.league?.name?.trim() || null,
    team_a: f.localteam?.name?.trim() || null,
    team_b: f.visitorteam?.name?.trim() || null,
    team_a_logo_url: f.localteam?.image_path?.trim() || null,
    team_b_logo_url: f.visitorteam?.image_path?.trim() || null,
    league_id: f.league_id ?? null,
    season_id: f.season_id ?? null,
    localteam_id: teamIdFromInclude(f.localteam_id, f.localteam) ?? null,
    visitorteam_id: teamIdFromInclude(f.visitorteam_id, f.visitorteam) ?? null,
    venue_id: venueIdFromFixture(f) ?? null,
    stage_id: stageIdFromFixture(f) ?? null,
    match_format: f.type?.trim() ? f.type.trim() : null,
  };
}

/** Fix venue_id: only set FK when we have a row in sm_venues (from nested venue or collected map). */
function normalizeMatchRow(f: SmFixture, venueIds: Set<number>, stageIds: Set<number>): MatchUpsertRow | null {
  const base = smFixtureToMatchRow(f);
  if (!base) return null;
  const vid = venueIdFromFixture(f);
  if (vid != null && !venueIds.has(vid)) {
    base.venue_id = null;
  }
  const sid = base.stage_id;
  if (sid != null && !stageIds.has(sid)) {
    base.stage_id = null;
  }
  return base;
}

export type UpsertFromFixturesBatchResult = {
  venuesUpserted: number;
  stagesUpserted: number;
  teamsUpserted: number;
  matchesUpserted: number;
  note?: string;
};

export async function upsertFromFixturesBatch(
  supabase: SupabaseClient,
  fixtures: SmFixture[],
): Promise<UpsertFromFixturesBatchResult & { error?: string }> {
  const venues = collectVenues(fixtures);
  const stages = collectStages(fixtures);
  const teams = collectTeams(fixtures);

  let venuesUpserted = 0;
  if (venues.size) {
    const { error } = await supabase.from("sm_venues").upsert([...venues.values()], {
      onConflict: "id",
    });
    if (error) return { venuesUpserted: 0, stagesUpserted: 0, teamsUpserted: 0, matchesUpserted: 0, error: `sm_venues: ${error.message}` };
    venuesUpserted = venues.size;
  }

  let stagesUpserted = 0;
  let stageIdsForFk = new Set<number>();
  let batchNote: string | undefined;
  if (stages.size) {
    const { error } = await supabase.from("sm_stages").upsert([...stages.values()], {
      onConflict: "id",
    });
    if (error) {
      batchNote = `sm_stages upsert failed (${error.message}); match rows will omit stage_id.`;
    } else {
      stagesUpserted = stages.size;
      stageIdsForFk = new Set(stages.keys());
    }
  }

  let teamsUpserted = 0;
  if (teams.size) {
    const { error } = await supabase.from("sm_teams").upsert([...teams.values()], {
      onConflict: "id",
    });
    if (error) {
      return {
        venuesUpserted,
        stagesUpserted,
        teamsUpserted: 0,
        matchesUpserted: 0,
        note: batchNote,
        error: `sm_teams: ${error.message}`,
      };
    }
    teamsUpserted = teams.size;
  }

  const venueIds = new Set(venues.keys());

  const rows: MatchUpsertRow[] = [];
  for (const f of fixtures) {
    const row = normalizeMatchRow(f, venueIds, stageIdsForFk);
    if (row) rows.push(row);
  }

  if (!rows.length) {
    return {
      venuesUpserted,
      stagesUpserted,
      teamsUpserted,
      matchesUpserted: 0,
      note: batchNote ?? "Fixtures missing id or starting_at.",
    };
  }

  const { error } = await supabase.from("matches").upsert(rows, { onConflict: "id" });
  if (error) {
    return {
      venuesUpserted,
      stagesUpserted,
      teamsUpserted,
      matchesUpserted: 0,
      note: batchNote,
      error: error.message,
    };
  }

  return {
    venuesUpserted,
    stagesUpserted,
    teamsUpserted,
    matchesUpserted: rows.length,
    note: batchNote,
  };
}

export async function upsertSingleSmFixture(
  supabase: SupabaseClient,
  f: SmFixture,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await upsertFromFixturesBatch(supabase, [f]);
  if (r.error) return { ok: false, error: r.error };
  if (r.matchesUpserted < 1) return { ok: false, error: r.note ?? "No match row upserted." };
  return { ok: true };
}
