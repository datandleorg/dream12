import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import {
  collectPlayerIdKeys,
  mergeNodeIntoStats,
} from "@/lib/extract-live-stats-by-player";
import { parseCricketOversToDecimal } from "@/lib/live-stats-from-snapshot";

function unwrapData<T>(node: unknown): T | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as T;
  }
  return o as T;
}

/** Batting/bowling may be `{ data: [...] }` or a plain array. */
function asObjectArray(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  const u = unwrapData<Record<string, unknown>>(raw);
  if (u && Array.isArray(u.data)) {
    return (u.data as unknown[]).filter(
      (x) => x && typeof x === "object",
    ) as Record<string, unknown>[];
  }
  return [];
}

function wicketIsNotOut(row: Record<string, unknown>): boolean {
  const w = row.wicket;
  if (w && typeof w === "object" && w !== null) {
    const n = (w as { name?: unknown }).name;
    if (typeof n === "string" && n.trim().toLowerCase() === "not out") return true;
  }
  return false;
}

function dismissedFromScoreboardRow(row: Record<string, unknown>): boolean {
  if (row.dismissed != null || row.out != null) {
    return Boolean(row.dismissed ?? row.out);
  }
  if (wicketIsNotOut(row)) return false;
  const w = row.wicket_id;
  if (w == null) return false;
  if (typeof w === "object" && w !== null) return true;
  if (typeof w === "number") return w !== 0;
  if (typeof w === "string") {
    const t = w.trim();
    return t !== "" && t !== "0";
  }
  return Boolean(w);
}

/** Same rules as fantasy scoring: not-out wicket, no wicket_id, etc. */
export function isDismissedBattingScoreboardRow(
  row: Record<string, unknown>,
): boolean {
  return dismissedFromScoreboardRow(row);
}

function normalizeBattingRowForMerge(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    dismissed: dismissedFromScoreboardRow(row),
  };
}

/**
 * SportMonks `bowling.wickets` is assumed to count wickets credited to the bowler and to **exclude**
 * run-outs (standard stats provider convention). If production data shows otherwise, adjust here.
 */
function normalizeBowlingRowForMerge(row: Record<string, unknown>): Record<string, unknown> {
  const rawOvers = row.overs ?? row.oversBowled;
  let oversNum = 0;
  if (typeof rawOvers === "string") {
    oversNum = parseCricketOversToDecimal(rawOvers);
  } else if (typeof rawOvers === "number" && Number.isFinite(rawOvers)) {
    oversNum = rawOvers;
  }
  const concede = row.runs_conceded ?? row.conceded ?? row.runs;
  const { runs: _r, ...rest } = row;
  return {
    ...rest,
    runs_conceded: concede,
    conceded: concede,
    overs: oversNum,
    oversBowled: oversNum,
    maidens: row.maidens ?? row.medians,
  };
}

/**
 * Walk persisted (or merged) fixture `batting` / `bowling` only → stats keyed by SportMonks player id string.
 * Aligns with `extractLiveStatsByPlayer` + `mergeNodeIntoStats` field names.
 */
export function extractScoreboardRawToLiveMap(
  raw: unknown,
): Record<string, Partial<NormalizedPlayerStats>> {
  const out: Record<string, Partial<NormalizedPlayerStats>> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;

  for (const row of asObjectArray(r.batting)) {
    const n = normalizeBattingRowForMerge(row);
    const keys = collectPlayerIdKeys(n);
    if (!keys.size) continue;
    for (const key of keys) {
      out[key] = mergeNodeIntoStats(n, out[key] ?? {});
    }
  }

  for (const row of asObjectArray(r.bowling)) {
    const n = normalizeBowlingRowForMerge(row);
    const keys = collectPlayerIdKeys(n);
    if (!keys.size) continue;
    for (const key of keys) {
      out[key] = mergeNodeIntoStats(n, out[key] ?? {});
    }
  }

  mergeFieldingFromBattingRows(out, raw);
  return out;
}

function wicketLabel(row: Record<string, unknown>): string {
  const w = row.wicket;
  if (w && typeof w === "object" && w !== null) {
    const n = (w as { name?: unknown }).name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  return "";
}

function numericOrNestedPlayerId(field: unknown): number | null {
  if (typeof field === "number" && Number.isFinite(field)) return field;
  if (field && typeof field === "object" && field !== null) {
    const id = (field as { id?: unknown }).id;
    if (typeof id === "number" && Number.isFinite(id)) return id;
  }
  return null;
}

function isRunOutWicket(lower: string): boolean {
  return lower.includes("run out") || lower.includes("run-out") || lower.includes("runout");
}

function isStumpingWicket(lower: string): boolean {
  if (lower.includes("catch")) return false;
  return lower.includes("stump") || lower.includes("stumped");
}

function isCaughtAndBowledWicket(lower: string): boolean {
  return lower.includes("caught") && (lower.includes("bowl") || lower.includes("bowler"));
}

function isBowledWicket(lower: string): boolean {
  return lower.includes("bowled") && !isCaughtAndBowledWicket(lower);
}

function isLbwWicket(lower: string): boolean {
  return lower.includes("lbw");
}

function isCatchDismissalWicket(lower: string): boolean {
  return lower.includes("catch") || lower.includes("caught");
}

function bumpCatch(
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  sportmonksId: string,
  delta = 1,
) {
  const cur = liveMap[sportmonksId] ?? {};
  liveMap[sportmonksId] = {
    ...cur,
    catches: (cur.catches ?? 0) + delta,
  };
}

function bumpStumping(
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  sportmonksId: string,
  delta = 1,
) {
  const cur = liveMap[sportmonksId] ?? {};
  liveMap[sportmonksId] = {
    ...cur,
    stumpings: (cur.stumpings ?? 0) + delta,
  };
}

function bumpRunOutDirect(
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  sportmonksId: string,
  delta = 1,
) {
  const cur = liveMap[sportmonksId] ?? {};
  liveMap[sportmonksId] = {
    ...cur,
    runOutDirect: (cur.runOutDirect ?? 0) + delta,
  };
}

function bumpRunOutIndirect(
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  sportmonksId: string,
  delta = 1,
) {
  const cur = liveMap[sportmonksId] ?? {};
  liveMap[sportmonksId] = {
    ...cur,
    runOutIndirect: (cur.runOutIndirect ?? 0) + delta,
  };
}

function bumpBowledLbw(
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  sportmonksId: string,
  delta = 1,
) {
  const cur = liveMap[sportmonksId] ?? {};
  liveMap[sportmonksId] = {
    ...cur,
    bowledLbwDismissals: (cur.bowledLbwDismissals ?? 0) + delta,
  };
}

/**
 * Credits catches, stumpings, run-outs, and bowled/LBW bonus wickets from dismissed batting rows.
 * Expects nested includes (catchstump, wicket, runoutby, …) when available; otherwise no-ops for that row.
 */
export function mergeFieldingFromBattingRows(
  liveMap: Record<string, Partial<NormalizedPlayerStats>>,
  raw: unknown,
): void {
  if (!raw || typeof raw !== "object") return;
  const batting = (raw as Record<string, unknown>).batting;

  for (const row of asObjectArray(batting)) {
    if (!dismissedFromScoreboardRow(row)) continue;
    const name = wicketLabel(row);
    const lower = name.toLowerCase();
    if (!lower) continue;

    const dismissedBatsmanId = numericOrNestedPlayerId(row.player_id ?? row.batsman);
    const bowlerId =
      numericOrNestedPlayerId(row.bowling_player_id) ?? numericOrNestedPlayerId(row.bowler);
    const catchFielderId =
      numericOrNestedPlayerId(row.catch_stump_player_id) ??
      numericOrNestedPlayerId(row.catchstump);
    const runoutById =
      numericOrNestedPlayerId(row.runout_by_id) ?? numericOrNestedPlayerId(row.runoutby);
    let secondRunOutId =
      numericOrNestedPlayerId(row.batsmanout_id) ?? numericOrNestedPlayerId(row.batsmanout);
    if (
      secondRunOutId != null &&
      dismissedBatsmanId != null &&
      secondRunOutId === dismissedBatsmanId
    ) {
      secondRunOutId = null;
    }

    if (isRunOutWicket(lower)) {
      if (
        runoutById != null &&
        secondRunOutId != null &&
        runoutById !== secondRunOutId
      ) {
        bumpRunOutIndirect(liveMap, String(runoutById));
        bumpRunOutIndirect(liveMap, String(secondRunOutId));
      } else if (runoutById != null) {
        bumpRunOutDirect(liveMap, String(runoutById));
      }
      continue;
    }

    if (isStumpingWicket(lower)) {
      if (catchFielderId != null) bumpStumping(liveMap, String(catchFielderId));
      continue;
    }

    if (isCaughtAndBowledWicket(lower)) {
      if (bowlerId != null) bumpCatch(liveMap, String(bowlerId));
      continue;
    }

    if (isBowledWicket(lower) || isLbwWicket(lower)) {
      if (bowlerId != null) bumpBowledLbw(liveMap, String(bowlerId));
      continue;
    }

    if (isCatchDismissalWicket(lower)) {
      if (catchFielderId != null) bumpCatch(liveMap, String(catchFielderId));
    }
  }
}
