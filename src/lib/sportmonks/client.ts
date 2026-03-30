const DEFAULT_BASE = "https://cricket.sportmonks.com/api/v2.0";

export function sportmonksBaseUrl(): string {
  return (
    process.env.SPORTMONKS_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE
  );
}

export function sportmonksToken(): string | undefined {
  return process.env.SPORTMONKS_API_TOKEN;
}

export async function sportmonksFetch<T = unknown>(
  path: string,
  searchParams?: Record<string, string>,
): Promise<T> {
  const token = sportmonksToken();
  if (!token) {
    throw new Error("SPORTMONKS_API_TOKEN is not set");
  }
  const url = new URL(path.startsWith("http") ? path : `${sportmonksBaseUrl()}${path}`);
  url.searchParams.set("api_token", token);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sportmonks ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

/** Team / league includes from Cricket API v2 list/detail responses */
export interface SmTeamInclude {
  id?: number;
  name?: string;
  /** Often a full URL or CDN path from SportMonks */
  image_path?: string;
}

export interface SmLeagueInclude {
  name?: string;
  code?: string;
}

/** Venue include from GET /fixtures with include=venue */
export interface SmVenueInclude {
  id?: number;
  country_id?: number;
  name?: string;
  city?: string;
  image_path?: string;
  capacity?: number;
  floodlight?: boolean;
  updated_at?: string;
}

/** Stage include from GET /fixtures with include=stage */
export interface SmStageInclude {
  id?: number;
  league_id?: number;
  season_id?: number;
  name?: string;
  code?: string;
  type?: string | null;
  updated_at?: string;
}

/** Fixture shape from v2 GET /fixtures (with full includes for sync) */
export interface SmFixture {
  id: number;
  starting_at?: string;
  name?: string;
  /** e.g. T20, ODI */
  type?: string;
  localteam?: SmTeamInclude;
  visitorteam?: SmTeamInclude;
  league?: SmLeagueInclude;
  league_id?: number;
  season_id?: number;
  localteam_id?: number;
  visitorteam_id?: number;
  venue_id?: number;
  stage_id?: number;
  venue?: SmVenueInclude;
  stage?: SmStageInclude;
  status?: string;
  /** Cricket API uses 0/1 or boolean for in-progress */
  live?: boolean | number;
  toss?: unknown;
  /** Cricket v2 fixture root (often with `include=tosswon`). */
  toss_won_team_id?: number;
  elected?: string;
  tosswon?: unknown;
}

/** Include strings shared by list sync, lineup sync, and on-demand detail fetch */
export const SM_FIXTURE_LIST_INCLUDE =
  "localteam,visitorteam,league,venue,stage";

export const SM_FIXTURE_LINEUP_INCLUDE =
  "lineup,localteam,visitorteam,league,venue,stage";

/** Prematch: lineup + `tosswon` (not `toss` — that include is rejected on many plans). */
export const SM_FIXTURE_PREMATCH_INCLUDE =
  "lineup,localteam,visitorteam,league,venue,stage,tosswon";

export interface SmFixturesResponse {
  data?: SmFixture[];
  meta?: {
    pagination?: {
      current_page?: number;
      last_page?: number;
    };
  };
}
