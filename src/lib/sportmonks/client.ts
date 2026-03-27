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
  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
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

/** Fixture shape from v2 GET /fixtures (with include=localteam,visitorteam,league) */
export interface SmFixture {
  id: number;
  starting_at?: string;
  name?: string;
  localteam?: SmTeamInclude;
  visitorteam?: SmTeamInclude;
  league?: SmLeagueInclude;
  league_id?: number;
  season_id?: number;
  localteam_id?: number;
  visitorteam_id?: number;
  status?: string;
  /** Cricket API uses 0/1 or boolean for in-progress */
  live?: boolean | number;
}

export interface SmFixturesResponse {
  data?: SmFixture[];
  meta?: {
    pagination?: {
      current_page?: number;
      last_page?: number;
    };
  };
}
