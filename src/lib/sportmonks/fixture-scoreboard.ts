import type { SmFixture } from "./client";
import {
  SM_FIXTURE_PREMATCH_INCLUDE,
  sportmonksFetch,
  sportmonksToken,
} from "./client";
import { isSportmonksFixtureId } from "./sportmonks-ids";

/**
 * Rich includes for live/scoreboard sync. Use **`tosswon`** for winner/elected (Cricket v2); do not
 * use include `toss` — many plans return 400 for it.
 */
export const SM_FIXTURE_SCOREBOARD_INCLUDE =
  "localteam,visitorteam,runs,scoreboards,batting,batting.batsman,batting.catchstump,batting.batsmanout,batting.runoutby,batting.wicket,bowling,bowling.bowler,balls,lineup,tosswon";

/** If primary `include` exceeds URL limits or API rejects nested includes. */
const SM_FIXTURE_SCOREBOARD_FALLBACK_LINEUP =
  "localteam,visitorteam,runs,scoreboards,batting,bowling,balls,lineup,tosswon";

const SM_FIXTURE_SCOREBOARD_FALLBACK =
  "localteam,visitorteam,runs,batting,bowling,balls";

const SM_FIXTURE_SCOREBOARD_FALLBACK_MIN =
  "localteam,visitorteam,runs,batting,bowling";

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
        { include: SM_FIXTURE_SCOREBOARD_FALLBACK_LINEUP },
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
            { include: SM_FIXTURE_SCOREBOARD_FALLBACK_MIN },
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

const PREMATCH_INCLUDE_FALLBACKS = [
  SM_FIXTURE_PREMATCH_INCLUDE,
  "lineup,localteam,visitorteam,tosswon",
  "lineup,localteam,visitorteam",
  "tosswon,localteam,visitorteam",
  "tosswon",
  "lineup",
] as const;

/**
 * Lineup + fixture context; includes **`tosswon`** where possible (Cricket v2 toss winner / elected).
 */
export async function fetchFixturePrematchRaw(
  fixtureId: number,
): Promise<Record<string, unknown> | null> {
  if (!sportmonksToken() || !isSportmonksFixtureId(fixtureId)) return null;

  for (let i = 0; i < PREMATCH_INCLUDE_FALLBACKS.length; i++) {
    const include = PREMATCH_INCLUDE_FALLBACKS[i];
    try {
      const json = await sportmonksFetch<{ data?: SmFixture & Record<string, unknown> }>(
        `/fixtures/${fixtureId}`,
        { include },
      );
      const data = json.data as Record<string, unknown> | undefined;
      if (data != null && typeof data === "object") {
        if (i > 0) {
          console.log(
            `[dream12-sportmonks] fetchFixturePrematchRaw fixtureId=${fixtureId} include_tier=${i} include=${include}`,
          );
        }
        return data;
      }
      console.warn(
        `[dream12-sportmonks] fetchFixturePrematchRaw fixtureId=${fixtureId} include=${include} http_ok but missing json.data`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[dream12-sportmonks] fetchFixturePrematchRaw fixtureId=${fixtureId} include=${include} error=${msg.slice(0, 400)}`,
      );
    }
  }
  console.warn(
    `[dream12-sportmonks] fetchFixturePrematchRaw fixtureId=${fixtureId} all_include_tiers_failed`,
  );
  return null;
}

/** Minimal fixture for schedule/status (hourly today monitor, promotion fallback). */
export async function fetchFixtureMetaRaw(
  fixtureId: number,
): Promise<Record<string, unknown> | null> {
  if (!sportmonksToken() || !isSportmonksFixtureId(fixtureId)) return null;
  try {
    const json = await sportmonksFetch<{ data?: SmFixture & Record<string, unknown> }>(
      `/fixtures/${fixtureId}`,
      { include: "localteam,visitorteam,league,venue,stage" },
    );
    return (json.data as Record<string, unknown> | undefined) ?? null;
  } catch {
    return null;
  }
}
