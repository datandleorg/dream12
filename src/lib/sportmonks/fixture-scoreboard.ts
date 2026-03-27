import type { SmFixture } from "./client";
import { sportmonksFetch, sportmonksToken } from "./client";
import { isSportmonksFixtureId } from "./sportmonks-ids";

/** Rich includes for scoreboard snapshot (trimmed in DB by normalize-live-snapshot). */
export const SM_FIXTURE_SCOREBOARD_INCLUDE =
  "localteam,visitorteam,runs,batting,bowling,batting.player,bowling.player";

const SM_FIXTURE_SCOREBOARD_FALLBACK = "localteam,visitorteam,runs,batting,bowling";

/**
 * Fetch one fixture with scoreboard-style includes for live snapshot sync / on-demand refresh.
 */
export async function fetchFixtureScoreboardRaw(
  fixtureId: number,
): Promise<Record<string, unknown> | null> {
  if (!sportmonksToken() || !isSportmonksFixtureId(fixtureId)) return null;
  try {
    const json = await sportmonksFetch<{ data?: SmFixture & Record<string, unknown> }>(
      `/fixtures/${fixtureId}`,
      { include: SM_FIXTURE_SCOREBOARD_INCLUDE },
    );
    return (json.data as Record<string, unknown> | undefined) ?? null;
  } catch {
    try {
      const json = await sportmonksFetch<{ data?: SmFixture & Record<string, unknown> }>(
        `/fixtures/${fixtureId}`,
        { include: SM_FIXTURE_SCOREBOARD_FALLBACK },
      );
      return (json.data as Record<string, unknown> | undefined) ?? null;
    } catch {
      try {
        const json = await sportmonksFetch<{ data?: SmFixture & Record<string, unknown> }>(
          `/fixtures/${fixtureId}`,
          { include: "localteam,visitorteam" },
        );
        return (json.data as Record<string, unknown> | undefined) ?? null;
      } catch {
        return null;
      }
    }
  }
}

function extractFixtureId(item: unknown): number | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const id = o.fixture_id ?? o.id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  const nested = o.fixture;
  if (nested && typeof nested === "object") {
    const f = nested as Record<string, unknown>;
    const fid = f.id;
    if (typeof fid === "number" && Number.isFinite(fid)) return fid;
    if (typeof fid === "string" && /^\d+$/.test(fid)) return Number(fid);
  }
  return null;
}

/**
 * Livescores currently in play — map fixture id → raw payload for merge / skip full fetch.
 */
export async function fetchLivescoresNowByFixtureId(): Promise<
  Map<number, Record<string, unknown>>
> {
  const map = new Map<number, Record<string, unknown>>();
  if (!sportmonksToken()) return map;
  try {
    const json = (await sportmonksFetch("/livescores/now")) as { data?: unknown[] };
    for (const item of json.data ?? []) {
      if (!item || typeof item !== "object") continue;
      const id = extractFixtureId(item);
      if (id != null) map.set(id, item as Record<string, unknown>);
    }
  } catch {
    return map;
  }
  return map;
}
