import type { SyncLogger } from "./sync-logger";
import { syncMatches } from "./sync-fixtures";
import { syncPlayers } from "./sync-lineup";
import {
  backfillSeasonTeamsFromMatches,
  markLatestSeasonCurrentForLeague,
  resolveActiveSeasonId,
  syncLeagues,
  syncSeasons,
  syncSeasonTeamsFromApi,
} from "./sync-reference";
import { hydrateMatchPlayersFromSeasonSquads, syncSquadsForSeason } from "./sync-squads";

export type FullSyncResult = {
  leagues: { upserted: number; note?: string };
  seasons: { upserted: number; note?: string };
  markCurrent?: { note?: string };
  activeSeasonId: number | null;
  seasonTeams?: { upsertedTeams: number; links: number; note?: string };
  backfillSeasonTeams?: { inserted: number; note?: string };
  squads?: { teams: number; rows: number; note?: string };
  squadHydrate?: { upserted: number; note?: string };
  matches: { upserted: number; note?: string };
  lineups: { processed: number; inserted: number; notes: string[] };
};

export type FullSyncOptions = {
  log?: SyncLogger;
};

function nowMs() {
  return Date.now();
}

/**
 * Ordered SportMonks sync for IPL-style usage.
 * Pass `log` for console + optional HTTP `logs` (see route ?verbose=1).
 */
export async function runFullSportmonksSync(options?: FullSyncOptions): Promise<FullSyncResult> {
  const log = options?.log;
  const tAll = nowMs();

  log?.entry("fullSync.config", {
    hasToken: Boolean(process.env.SPORTMONKS_API_TOKEN),
    leagueId: process.env.SPORTMONKS_LEAGUE_ID ?? null,
    seasonId: process.env.SPORTMONKS_SEASON_ID ?? null,
    squadInclude: process.env.SPORTMONKS_SQUAD_INCLUDE ?? "(default: no include)",
    baseUrl: process.env.SPORTMONKS_BASE_URL ?? "(default v2.0)",
  });

  let t = nowMs();
  const leagues = await syncLeagues();
  log?.entry("step.syncLeagues", { ...leagues, ms: nowMs() - t });

  t = nowMs();
  const seasons = await syncSeasons();
  log?.entry("step.syncSeasons", { ...seasons, ms: nowMs() - t });

  let markCurrent: { note?: string } | undefined;
  const leagueRaw = process.env.SPORTMONKS_LEAGUE_ID?.trim();
  if (leagueRaw && /^\d+$/.test(leagueRaw)) {
    t = nowMs();
    markCurrent = await markLatestSeasonCurrentForLeague(Number(leagueRaw));
    log?.entry("step.markLatestSeasonCurrentForLeague", {
      leagueId: Number(leagueRaw),
      ...markCurrent,
      ms: nowMs() - t,
    });
  }

  t = nowMs();
  const activeSeasonId = await resolveActiveSeasonId();
  log?.entry("step.resolveActiveSeasonId", { activeSeasonId, ms: nowMs() - t });

  t = nowMs();
  const matches = await syncMatches({ primarySeasonId: activeSeasonId });
  log?.entry("step.syncMatches", { ...matches, ms: nowMs() - t });

  let seasonTeams: { upsertedTeams: number; links: number; note?: string } | undefined;
  let backfillSeasonTeams: { inserted: number; note?: string } | undefined;
  let squads: { teams: number; rows: number; note?: string } | undefined;
  let squadHydrate: { upserted: number; note?: string } | undefined;

  if (activeSeasonId != null) {
    t = nowMs();
    seasonTeams = await syncSeasonTeamsFromApi(activeSeasonId);
    log?.entry("step.syncSeasonTeamsFromApi", { seasonId: activeSeasonId, ...seasonTeams, ms: nowMs() - t });

    t = nowMs();
    backfillSeasonTeams = await backfillSeasonTeamsFromMatches(activeSeasonId);
    log?.entry("step.backfillSeasonTeamsFromMatches", {
      seasonId: activeSeasonId,
      ...backfillSeasonTeams,
      ms: nowMs() - t,
    });

    t = nowMs();
    squads = await syncSquadsForSeason(activeSeasonId, log);
    log?.entry("step.syncSquadsForSeason.summary", { seasonId: activeSeasonId, ...squads, ms: nowMs() - t });

    t = nowMs();
    squadHydrate = await hydrateMatchPlayersFromSeasonSquads(activeSeasonId, log);
    log?.entry("step.hydrateMatchPlayersFromSeasonSquads", {
      seasonId: activeSeasonId,
      ...squadHydrate,
      ms: nowMs() - t,
    });
  } else {
    log?.entry("step.skipSeasonScoped", { reason: "activeSeasonId is null" });
  }

  t = nowMs();
  const lineups = await syncPlayers();
  log?.entry("step.syncPlayersLineups", {
    processed: lineups.processed,
    inserted: lineups.inserted,
    noteCount: lineups.notes.length,
    ms: nowMs() - t,
  });

  log?.entry("fullSync.complete", { totalMs: nowMs() - tAll });

  return {
    leagues,
    seasons,
    markCurrent,
    activeSeasonId,
    seasonTeams,
    backfillSeasonTeams,
    squads,
    squadHydrate,
    matches,
    lineups,
  };
}
