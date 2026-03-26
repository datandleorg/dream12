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

/** Loose fixture shape from v2 list endpoints */
export interface SmFixture {
  id: number;
  starting_at?: string;
  name?: string;
  localteam?: { name?: string };
  visitorteam?: { name?: string };
  status?: string;
}

export interface SmFixturesResponse {
  data?: SmFixture[];
}
