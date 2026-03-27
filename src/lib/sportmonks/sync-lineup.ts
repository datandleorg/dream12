import { createServiceClient } from "@/lib/supabase/service";
import type { SmFixture, SmTeamInclude } from "./client";
import { SM_FIXTURE_LINEUP_INCLUDE, sportmonksFetch, sportmonksToken } from "./client";
import { isSportmonksFixtureId } from "./sportmonks-ids";
import { upsertSingleSmFixture } from "./sync-fixture-upsert";
import {
  extractSportmonksPositionName,
  inferRoleFromPositionLabel,
} from "./infer-role-from-position-label";
import { notifyLineupPublishedOnce } from "@/lib/notifications/lineup-notify";

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

type RawLineupRow = {
  player_id?: number;
  fullname?: string;
  player_name?: string;
  position?: string | { name?: string };
  team?: { name?: string };
  team_id?: number;
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
  const tid = row.team_id;
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
    detail = await sportmonksFetch<FixtureDetailResponse>(
      `/fixtures/${matchId}`,
      { include: SM_FIXTURE_LINEUP_INCLUDE },
    );
  } catch (e) {
    return {
      inserted: 0,
      note: e instanceof Error ? e.message : "fixture fetch failed",
    };
  }

  const fixture = detail.data;
  if (!fixture) {
    return { inserted: 0, note: "No fixture data in API response." };
  }

  const supabaseMeta = createServiceClient();
  const metaUpsert = await upsertSingleSmFixture(supabaseMeta, fixture);
  const metaNote = metaUpsert.ok ? undefined : `Fixture metadata: ${metaUpsert.error}`;

  const lineup = unwrapIncludedList<RawLineupRow>(fixture.lineup);
  if (!lineup.length) {
    return {
      inserted: 0,
      note: [metaNote, "No lineup on fixture (try after squads publish)."]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const supabase = supabaseMeta;
  const rows = lineup
    .map((l) => {
      const nested = nestedPlayerPayload(l);
      const sportmonksId = firstNum(l.player_id, nested?.id, nested?.player_id);
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
    })
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
    return {
      inserted: 0,
      note: [metaNote, "Lineup rows empty after map."].filter(Boolean).join(" · "),
    };
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

  await notifyLineupPublishedOnce(matchId);

  return { inserted: rows.length, note: metaNote };
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
