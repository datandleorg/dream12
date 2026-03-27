import { createServiceClient } from "@/lib/supabase/service";
import { sportmonksFetch, sportmonksToken } from "./client";
import type { SyncLogger } from "./sync-logger";
import {
  extractSportmonksPositionName,
  inferRoleFromPositionLabel,
} from "./infer-role-from-position-label";
import { unwrapIncludedList } from "./sync-reference";

type NestedPlayer = {
  id?: number;
  player_id?: number;
  fullname?: string;
  display_name?: string;
  common_name?: string;
  image_path?: string;
};

type RawSquadRow = {
  player_id?: number;
  fullname?: string;
  player_name?: string;
  position?: string | { name?: string };
  player?: NestedPlayer | { data?: NestedPlayer };
  id?: number;
  name?: string;
  full_name?: string;
  firstname?: string;
  lastname?: string;
  /** Flat player shape from `/teams/:id/squad/:season` (same as nested player). */
  image_path?: string;
};

function nestedPlayerPayload(row: RawSquadRow): NestedPlayer | undefined {
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

function squadPositionLabel(row: RawSquadRow): string | undefined {
  return extractSportmonksPositionName(row.position);
}

function creditHeuristic(): number {
  return 9;
}

/** Query params for squad — default matches naked curl (no include); optional SPORTMONKS_SQUAD_INCLUDE=e.g. player */
function squadRequestParams(): Record<string, string> {
  const inc = process.env.SPORTMONKS_SQUAD_INCLUDE?.trim();
  return inc ? { include: inc } : {};
}

function isLikelySquadEntry(x: unknown): boolean {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.player_id === "number") return true;
  if (typeof o.id === "number" && (typeof o.fullname === "string" || typeof o.name === "string"))
    return true;
  if (o.player && typeof o.player === "object") return true;
  return false;
}

/** Find first array of squad-like objects nested in the JSON tree. */
function findSquadArrayDeep(node: unknown, depth: number): RawSquadRow[] {
  if (depth > 10) return [];
  if (Array.isArray(node)) {
    if (node.length && node.every(isLikelySquadEntry)) return node as RawSquadRow[];
    for (const item of node) {
      const inner = findSquadArrayDeep(item, depth + 1);
      if (inner.length) return inner;
    }
    return [];
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) {
      const inner = findSquadArrayDeep(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  return [];
}

/** Normalize SportMonks v2 squad responses (shape varies by endpoint / includes). */
function parseSquadRowsFromResponse(json: unknown, log?: SyncLogger): RawSquadRow[] {
  if (json == null || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const data = root.data;

  if (Array.isArray(data) && data.length) {
    log?.entry("squad.parse", { path: "data[]", length: data.length });
    return data as RawSquadRow[];
  }

  if (data && typeof data === "object") {
    const dObj = data as Record<string, unknown>;
    const inner = dObj.data;
    if (Array.isArray(inner) && inner.length) {
      log?.entry("squad.parse", { path: "data.data[]", length: inner.length });
      return inner as RawSquadRow[];
    }
    for (const key of ["squad", "squads", "players"]) {
      const v = dObj[key];
      const list = unwrapIncludedList<RawSquadRow>(v);
      if (list.length) {
        log?.entry("squad.parse", { path: `data.${key}`, length: list.length });
        return list;
      }
    }
  }

  for (const key of ["squad", "squads"]) {
    const v = root[key];
    const list = unwrapIncludedList<RawSquadRow>(v);
    if (list.length) {
      log?.entry("squad.parse", { path: key, length: list.length });
      return list;
    }
  }

  const deep = findSquadArrayDeep(json, 0);
  if (deep.length) {
    log?.entry("squad.parse", { path: "nested[]", length: deep.length });
    return deep;
  }

  log?.entry("squad.parse", {
    path: "none",
    topKeys: Object.keys(root),
    dataShape:
      data === undefined
        ? "undefined"
        : Array.isArray(data)
          ? `array(${data.length})`
          : typeof data,
  });
  return [];
}

/**
 * `/teams/{id}/squad/{season}` often returns `{ data: { id, image_path, squad: [...] } }`.
 * Update `sm_teams.image_path` from that shell when present.
 */
function teamMetaFromSquadEndpointResponse(
  json: unknown,
  expectedTeamId: number,
): { image_path: string; updated_at: string | null } | null {
  if (json == null || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const id = typeof d.id === "number" && Number.isFinite(d.id) ? d.id : null;
  if (id !== expectedTeamId) return null;
  const image_path = firstStr(d.image_path as string | undefined);
  if (!image_path) return null;
  const updated_at = firstStr(d.updated_at as string | undefined) ?? null;
  return { image_path, updated_at };
}

function squadJsonShape(json: unknown): Record<string, unknown> {
  if (json == null || typeof json !== "object") return { root: typeof json };
  const root = json as Record<string, unknown>;
  const data = root.data;
  const out: Record<string, unknown> = { topKeys: Object.keys(root) };
  if (Array.isArray(data)) {
    out.data = `array(len=${data.length})`;
    const first = data[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      out.firstRowKeys = Object.keys(first as object).slice(0, 15);
    }
  } else if (data && typeof data === "object") {
    out.dataKeys = Object.keys(data as object);
  } else {
    out.dataType = typeof data;
  }
  return out;
}

function rowToDbPayload(
  seasonId: number,
  teamId: number,
  row: RawSquadRow,
): {
  season_id: number;
  team_id: number;
  player_sportmonks_id: number;
  player_name: string;
  position_label: string | null;
  photo_url: string | null;
} | null {
  const nested = nestedPlayerPayload(row);
  const pid = firstNum(row.player_id, row.id, nested?.id, nested?.player_id);
  const combinedName =
    row.firstname || row.lastname
      ? `${row.firstname ?? ""} ${row.lastname ?? ""}`.trim()
      : undefined;
  const name =
    firstStr(
      row.fullname,
      row.player_name,
      row.name,
      row.full_name,
      combinedName,
      nested?.fullname,
      nested?.display_name,
      nested?.common_name,
    ) ?? (pid != null ? `Player #${pid}` : undefined);
  if (pid == null || !name) return null;
  const photo = firstStr(nested?.image_path, row.image_path) ?? null;
  return {
    season_id: seasonId,
    team_id: teamId,
    player_sportmonks_id: pid,
    player_name: name,
    position_label: squadPositionLabel(row) ?? null,
    photo_url: photo,
  };
}

export async function syncSquadsForSeason(
  seasonId: number,
  log?: SyncLogger,
): Promise<{ teams: number; rows: number; note?: string }> {
  if (!sportmonksToken()) {
    return { teams: 0, rows: 0, note: "SPORTMONKS_API_TOKEN missing" };
  }
  const supabase = createServiceClient();
  const { data: st, error } = await supabase
    .from("sm_season_team")
    .select("team_id")
    .eq("season_id", seasonId);
  if (error) return { teams: 0, rows: 0, note: error.message };
  const teamIds = [...new Set((st ?? []).map((x) => Number(x.team_id)))];
  if (!teamIds.length) {
    return { teams: 0, rows: 0, note: "No teams in sm_season_team for this season." };
  }

  log?.entry("syncSquadsForSeason.start", {
    seasonId,
    teamCount: teamIds.length,
    squadQueryParams: squadRequestParams(),
  });

  let totalRows = 0;
  const notes: string[] = [];

  for (const teamId of teamIds) {
    try {
      const path = `/teams/${teamId}/squad/${seasonId}`;
      const json = await sportmonksFetch<unknown>(path, squadRequestParams());
      const list = parseSquadRowsFromResponse(json, log);

      if (!list.length) {
        log?.entry("squad.empty", { teamId, seasonId, shape: squadJsonShape(json) });
        notes.push(`team ${teamId}: empty squad`);
        continue;
      }

      log?.entry("squad.fetched", { teamId, seasonId, parsedRows: list.length });

      const teamMeta = teamMetaFromSquadEndpointResponse(json, teamId);
      if (teamMeta) {
        const patch: { image_path: string; updated_at?: string } = {
          image_path: teamMeta.image_path,
        };
        if (teamMeta.updated_at) patch.updated_at = teamMeta.updated_at;
        const { error: teamImgErr } = await supabase
          .from("sm_teams")
          .update(patch)
          .eq("id", teamId);
        if (teamImgErr) {
          log?.entry("squad.teamImageUpdateError", { teamId, message: teamImgErr.message });
        } else {
          log?.entry("squad.teamImageUpdated", { teamId });
        }
      }

      const payload = list.map((row) => rowToDbPayload(seasonId, teamId, row)).filter(Boolean) as {
        season_id: number;
        team_id: number;
        player_sportmonks_id: number;
        player_name: string;
        position_label: string | null;
        photo_url: string | null;
      }[];

      if (!payload.length) {
        notes.push(`team ${teamId}: no mappable player ids`);
        continue;
      }

      const { error: up } = await supabase.from("sm_season_squad").upsert(payload, {
        onConflict: "season_id,team_id,player_sportmonks_id",
      });
      if (up) {
        log?.entry("squad.upsertError", { teamId, message: up.message });
        notes.push(`team ${teamId}: ${up.message}`);
        continue;
      }
      totalRows += payload.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      log?.entry("squad.fetchError", { teamId, message: msg });
      notes.push(`team ${teamId}: ${msg}`);
    }
  }

  log?.entry("syncSquadsForSeason.done", { teams: teamIds.length, rows: totalRows });

  return {
    teams: teamIds.length,
    rows: totalRows,
    note: notes.length ? notes.slice(0, 16).join("; ") : undefined,
  };
}

export async function hydrateMatchPlayersFromSeasonSquads(
  seasonId: number,
  log?: SyncLogger,
): Promise<{ upserted: number; note?: string }> {
  const supabase = createServiceClient();
  const { data: matches, error: me } = await supabase
    .from("matches")
    .select("id, localteam_id, visitorteam_id")
    .eq("season_id", seasonId)
    .in("status", ["upcoming", "live"]);
  if (me) return { upserted: 0, note: me.message };
  log?.entry("hydrateMatchPlayers.matches", {
    seasonId,
    count: matches?.length ?? 0,
  });
  if (!matches?.length) return { upserted: 0, note: "No upcoming/live matches for season." };

  const { data: squad, error: se } = await supabase
    .from("sm_season_squad")
    .select("team_id, player_sportmonks_id, player_name, position_label, photo_url")
    .eq("season_id", seasonId);
  if (se) return { upserted: 0, note: se.message };
  log?.entry("hydrateMatchPlayers.squadRows", {
    seasonId,
    count: squad?.length ?? 0,
  });
  if (!squad?.length) return { upserted: 0, note: "No sm_season_squad rows." };

  const squadByTeam = new Map<number, typeof squad>();
  for (const row of squad) {
    const tid = Number(row.team_id);
    if (!squadByTeam.has(tid)) squadByTeam.set(tid, []);
    squadByTeam.get(tid)!.push(row);
  }

  const { data: teamsMeta } = await supabase.from("sm_teams").select("id, name");
  const teamName = new Map<number, string>();
  for (const t of teamsMeta ?? []) {
    teamName.set(Number(t.id), (t.name as string) || `Team ${t.id}`);
  }

  const matchIds = matches.map((m) => Number(m.id));
  const { data: existing } = await supabase
    .from("players")
    .select("match_id, sportmonks_id, in_playing_xi")
    .in("match_id", matchIds);

  const xiKey = (mid: number, smid: number) => `${mid}:${smid}`;
  const xiMap = new Map<string, boolean | null>();
  for (const p of existing ?? []) {
    const smid = p.sportmonks_id as number | null;
    if (smid == null) continue;
    xiMap.set(xiKey(Number(p.match_id), smid), p.in_playing_xi as boolean | null);
  }

  type PlayerRow = {
    sportmonks_id: number;
    match_id: number;
    name: string;
    team: string;
    role: "BAT" | "BOWL" | "AR" | "WK";
    credit_value: number;
    photo_url: string | null;
    in_playing_xi: boolean | null;
  };

  const toUpsert: PlayerRow[] = [];

  for (const m of matches) {
    const mid = Number(m.id);
    const lt = m.localteam_id as number | null;
    const vt = m.visitorteam_id as number | null;
    const sides = [lt, vt].filter((x): x is number => x != null);
    for (const tid of sides) {
      const rows = squadByTeam.get(tid);
      if (!rows) continue;
      const tname = teamName.get(tid) ?? `Team ${tid}`;
      for (const r of rows) {
        const smid = Number(r.player_sportmonks_id);
        const prev = xiMap.get(xiKey(mid, smid));
        toUpsert.push({
          sportmonks_id: smid,
          match_id: mid,
          name: r.player_name as string,
          team: tname,
          role: inferRoleFromPositionLabel((r.position_label as string) ?? undefined),
          credit_value: creditHeuristic(),
          photo_url: (r.photo_url as string | null) ?? null,
          in_playing_xi: prev !== undefined ? prev : null,
        });
      }
    }
  }

  if (!toUpsert.length) return { upserted: 0, note: "No player rows built from squads." };

  const chunkSize = 80;
  let n = 0;
  for (let i = 0; i < toUpsert.length; i += chunkSize) {
    const chunk = toUpsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("players").upsert(chunk, {
      onConflict: "match_id,sportmonks_id",
    });
    if (error) return { upserted: n, note: error.message };
    n += chunk.length;
  }

  log?.entry("hydrateMatchPlayers.done", { upserted: n });

  return { upserted: n };
}
