import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture } from "./client";
import { SM_FIXTURE_LINEUP_INCLUDE, sportmonksFetch, sportmonksToken } from "./client";
import { isSportmonksFixtureId } from "./sportmonks-ids";
import { upsertSingleSmFixture } from "./sync-fixture-upsert";
import {
  extractSportmonksPositionName,
  inferRoleFromPositionLabel,
} from "./infer-role-from-position-label";
import { notifyLineupPublishedOnce } from "@/lib/notifications/lineup-notify";

const LINEUP_LOG = "[sportmonks/sync-lineup]";
const lineupDebugEnabled = () =>
  process.env.DEBUG_SYNC_LINEUP === "1" || process.env.DEBUG_SYNC_LINEUP === "true";

function describeLineupPayload(raw: unknown): string {
  if (raw == null) return "absent";
  if (Array.isArray(raw)) return `array(len=${raw.length})`;
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o);
    const d = o.data;
    let inner = "data=missing";
    if (Array.isArray(d)) inner = `data=array(len=${d.length})`;
    else if (d != null && typeof d === "object") inner = "data=object(single)";
    else if (d != null) inner = `data=${typeof d}`;
    return `object(keys=${keys.join(",")}) ${inner}`;
  }
  return typeof raw;
}

/** SportMonks v2 nests includes as `{ data: T | T[] }` or a plain array. */
function unwrapIncludedList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && "data" in raw) {
    const d = (raw as { data?: unknown }).data;
    if (Array.isArray(d)) return d;
    if (d != null && typeof d === "object") return [d as T];
  }
  return [];
}

type NestedPlayer = {
  id?: number;
  player_id?: number;
  fullname?: string;
  display_name?: string;
  common_name?: string;
};

/** Pivot object on each entry when SM embeds `players` in `fixture.lineup[]`. */
type LineupPivotMeta = {
  team_id?: number;
  captain?: boolean;
  wicketkeeper?: boolean;
  substitution?: boolean;
};

type RawLineupRow = {
  /** Player id when the lineup row is an embedded `resource: "players"` object. */
  id?: number;
  player_id?: number;
  fullname?: string;
  player_name?: string;
  position?: string | { name?: string };
  team?: { name?: string };
  team_id?: number;
  /** Pivot meta (team_id, substitution, …) — not a nested player include. */
  lineup?: LineupPivotMeta;
  player?: NestedPlayer | { data?: NestedPlayer };
};

interface FixtureDetailResponse {
  data?: SmFixture & {
    lineup?: RawLineupRow[] | { data?: RawLineupRow[] };
  };
}

function nestedPlayerPayload(row: RawLineupRow): NestedPlayer | undefined {
  const p = row.player;
  if (!p || typeof p !== "object") return undefined;
  if ("data" in p && p.data && typeof p.data === "object") {
    return p.data as NestedPlayer;
  }
  return p as NestedPlayer;
}

/** Bench / inactive squad rows in embedded lineup payloads (`substitution: true`). */
function isSubstitutionLineupEntry(row: RawLineupRow): boolean {
  const m = row.lineup;
  if (!m || typeof m !== "object") return false;
  return m.substitution === true;
}

function lineupPivotTeamId(row: RawLineupRow): number | undefined {
  const m = row.lineup;
  if (!m || typeof m !== "object") return undefined;
  const tid = m.team_id;
  return typeof tid === "number" && Number.isFinite(tid) ? tid : undefined;
}

function lineupRowDebugLine(row: RawLineupRow, index: number): string {
  const nested = nestedPlayerPayload(row);
  const smid = firstNum(row.player_id, nested?.id, nested?.player_id, row.id);
  const nm =
    firstStr(
      row.fullname,
      row.player_name,
      nested?.fullname,
      nested?.display_name,
      nested?.common_name,
    ) ?? (smid != null ? `Player #${smid}` : undefined);
  const topKeys =
    row && typeof row === "object" ? Object.keys(row as object).slice(0, 25).join(",") : "?";
  return `#${index} keys=[${topKeys}] resolved sportmonksId=${smid ?? "—"} name=${nm ? `"${nm}"` : "—"}`;
}

function firstNum(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function firstStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function positionLabel(row: RawLineupRow): string | undefined {
  return extractSportmonksPositionName(row.position);
}

function teamNameForLineupRow(
  row: RawLineupRow,
  fixture: SmFixture,
): string {
  if (row.team?.name?.trim()) return row.team.name.trim();
  const tid = row.team_id ?? lineupPivotTeamId(row);
  if (tid != null && fixture.localteam_id === tid) {
    return fixture.localteam?.name?.trim() ?? "TBC";
  }
  if (tid != null && fixture.visitorteam_id === tid) {
    return fixture.visitorteam?.name?.trim() ?? "TBC";
  }
  return "TBC";
}

function creditHeuristic(): number {
  return 9;
}

/**
 * Apply `fixture.lineup` to `players` for this match (upsert + `in_playing_xi` flags).
 * Used after an HTTP fetch or when merging a live fixture payload that already includes `lineup`.
 *
 * `skipNotify`: use only for bulk backfills. Cron/live paths should omit it so `notifyLineupPublishedOnce`
 * runs; it is idempotent per match (`matches.lineup_notified_at`).
 */
export async function applyLineupFromFixturePayload(
  supabase: SupabaseClient,
  matchId: number,
  fixture: SmFixture & { lineup?: unknown },
  options?: { skipNotify?: boolean; metaNote?: string },
): Promise<{ inserted: number; note?: string }> {
  const metaNote = options?.metaNote;
  const rawLineup = fixture.lineup;
  if (lineupDebugEnabled()) {
    console.info(
      `${LINEUP_LOG} matchId=${matchId} applyLineup: raw.fixture.lineup ${describeLineupPayload(rawLineup)}`,
    );
  }

  const lineup = unwrapIncludedList<RawLineupRow>(rawLineup);
  if (!lineup.length) {
    console.warn(
      `${LINEUP_LOG} matchId=${matchId} no rows after unwrap (raw was ${describeLineupPayload(rawLineup)})`,
    );
    return {
      inserted: 0,
      note: [metaNote, "No lineup on fixture (try after squads publish)."]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const lineupForXi = lineup.filter((l) => !isSubstitutionLineupEntry(l));
  const subCount = lineup.length - lineupForXi.length;
  if (lineupDebugEnabled()) {
    console.info(
      `${LINEUP_LOG} matchId=${matchId} unwrapped lineup count=${lineup.length}` +
        (subCount > 0 ? ` (${subCount} substitution rows excluded from XI)` : ""),
    );
  }

  const mapped = lineupForXi.map((l) => {
    const nested = nestedPlayerPayload(l);
    const sportmonksId = firstNum(l.player_id, nested?.id, nested?.player_id, l.id);
    const name =
      firstStr(
        l.fullname,
        l.player_name,
        nested?.fullname,
        nested?.display_name,
        nested?.common_name,
      ) ??
      (sportmonksId != null ? `Player #${sportmonksId}` : undefined);
    return { sportmonksId, name, row: l };
  });

  let missingId = 0;
  let missingName = 0;
  for (const x of mapped) {
    if (x.sportmonksId == null) missingId += 1;
    if (x.name == null || x.name === "") missingName += 1;
  }

  const rows = mapped
    .filter((x) => x.sportmonksId != null && x.name)
    .map((x) => ({
      sportmonks_id: x.sportmonksId as number,
      match_id: matchId,
      name: x.name as string,
      team: teamNameForLineupRow(x.row, fixture),
      role: inferRoleFromPositionLabel(positionLabel(x.row)),
      credit_value: creditHeuristic(),
      in_playing_xi: true as const,
    }));

  if (!rows.length) {
    const sample = mapped
      .slice(0, 5)
      .map((_, i) => lineupRowDebugLine(lineupForXi[i]!, i))
      .join(" | ");
    console.warn(
      `${LINEUP_LOG} matchId=${matchId} lineup map produced 0 players: unwrapped=${lineup.length} xiCandidates=${lineupForXi.length} missingSportmonksId=${missingId} missingName=${missingName}. sample: ${sample}`,
    );
    return {
      inserted: 0,
      note: [metaNote, "Lineup rows empty after map."].filter(Boolean).join(" · "),
    };
  }

  if (lineupDebugEnabled()) {
    console.info(
      `${LINEUP_LOG} matchId=${matchId} mapped ${rows.length} XI players (from ${lineupForXi.length} non-substitution rows, ${lineup.length} unwrapped)`,
    );
  }

  const xiSportmonksIds = rows.map((r) => r.sportmonks_id);

  const { error } = await supabase.from("players").upsert(rows, {
    onConflict: "match_id,sportmonks_id",
  });

  if (error) {
    return {
      inserted: 0,
      note: [metaNote, error.message].filter(Boolean).join(" · "),
    };
  }

  const { error: clearErr } = await supabase
    .from("players")
    .update({ in_playing_xi: false })
    .eq("match_id", matchId)
    .not("sportmonks_id", "is", null);

  if (clearErr) {
    return {
      inserted: rows.length,
      note: [metaNote, `Lineup saved but could not clear XI flags: ${clearErr.message}`]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const { error: markErr } = await supabase
    .from("players")
    .update({ in_playing_xi: true })
    .eq("match_id", matchId)
    .in("sportmonks_id", xiSportmonksIds);

  if (markErr) {
    return {
      inserted: rows.length,
      note: [metaNote, `Lineup saved but could not mark XI: ${markErr.message}`]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (!options?.skipNotify) {
    await notifyLineupPublishedOnce(matchId);
  }

  if (lineupDebugEnabled()) {
    console.info(`${LINEUP_LOG} matchId=${matchId} applyLineup OK inserted=${rows.length}`);
  }

  return { inserted: rows.length, note: metaNote };
}

/**
 * Pull lineup for a fixture when Sportmonks includes `lineup` on the fixture detail.
 * Sets `in_playing_xi` for the match after a successful non-empty lineup sync.
 */
export async function syncPlayersForMatch(
  matchId: number,
): Promise<{ inserted: number; note?: string }> {
  if (!sportmonksToken()) {
    return { inserted: 0, note: "SPORTMONKS_API_TOKEN missing" };
  }

  let detail: FixtureDetailResponse;
  try {
    if (lineupDebugEnabled()) {
      console.info(
        `${LINEUP_LOG} matchId=${matchId} GET /fixtures/${matchId} include="${SM_FIXTURE_LINEUP_INCLUDE}"`,
      );
    }
    detail = await sportmonksFetch<FixtureDetailResponse>(
      `/fixtures/${matchId}`,
      { include: SM_FIXTURE_LINEUP_INCLUDE },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fixture fetch failed";
    console.warn(`${LINEUP_LOG} matchId=${matchId} fixture fetch failed: ${msg}`);
    return {
      inserted: 0,
      note: msg,
    };
  }

  const fixture = detail.data;
  if (!fixture) {
    console.warn(`${LINEUP_LOG} matchId=${matchId} API response had no data.fixture`);
    return { inserted: 0, note: "No fixture data in API response." };
  }

  if (lineupDebugEnabled()) {
    console.info(
      `${LINEUP_LOG} matchId=${matchId} fixture fetched id=${fixture.id ?? "?"} lineup ${describeLineupPayload(fixture.lineup)}`,
    );
  }

  const supabaseMeta = createServiceClient();
  const metaUpsert = await upsertSingleSmFixture(supabaseMeta, fixture);
  const metaNote = metaUpsert.ok ? undefined : `Fixture metadata: ${metaUpsert.error}`;

  return applyLineupFromFixturePayload(supabaseMeta, matchId, fixture, { metaNote });
}

const SYNC_PLAYERS_MATCH_LIMIT = 80;
const SYNC_PLAYERS_PROCESS_CAP = 40;

export async function syncPlayers(): Promise<{ processed: number; inserted: number; notes: string[] }> {
  const supabase = createServiceClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .in("status", ["upcoming", "live"])
    .order("start_time", { ascending: true })
    .limit(SYNC_PLAYERS_MATCH_LIMIT);

  const notes: string[] = [];
  let inserted = 0;
  const ids =
    matches
      ?.map((m) => Number(m.id))
      .filter((id) => isSportmonksFixtureId(id))
      .slice(0, SYNC_PLAYERS_PROCESS_CAP) ?? [];

  for (const id of ids) {
    const r = await syncPlayersForMatch(id);
    inserted += r.inserted;
    if (r.note) notes.push(`match ${id}: ${r.note}`);
  }
  return { processed: ids.length, inserted, notes };
}
