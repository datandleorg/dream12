import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";

/** True if this object likely carries per-player cricket stats (not just metadata). */
function hasStatLikeFields(o: Record<string, unknown>): boolean {
  return (
    "runs" in o ||
    "score" in o ||
    "run" in o ||
    "balls_faced" in o ||
    "balls" in o ||
    "ball" in o ||
    "b" in o ||
    "fours" in o ||
    "four" in o ||
    "sixes" in o ||
    "six" in o ||
    "wickets" in o ||
    "overs" in o ||
    "runs_conceded" in o ||
    "conceded" in o ||
    "catches" in o ||
    "stumpings" in o ||
    "maidens" in o ||
    "dismissed" in o ||
    "out" in o ||
    "wicket_id" in o
  );
}

function addKey(keys: Set<string>, v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) {
    keys.add(String(v));
    return;
  }
  if (typeof v === "string" && /^\d+$/.test(v.trim())) keys.add(v.trim());
}

/**
 * SportMonks v2 batting/bowling rows often use `id` for the player/lineup id; stats may omit `player_id`.
 * We align keys with `players.sportmonks_id` in our DB.
 */
/** @internal Exported for scoreboard JSONB extractor; keys align with `players.sportmonks_id`. */
export function collectPlayerIdKeys(o: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  addKey(keys, o.player_id);
  addKey(keys, o.playerId);
  addKey(keys, o.batsman_id);
  addKey(keys, o.bowler_id);
  const oid = o.id;
  if (
    typeof oid === "number" &&
    Number.isFinite(oid) &&
    hasStatLikeFields(o)
  ) {
    keys.add(String(oid));
  }
  return keys;
}

/** @internal Exported for scoreboard JSONB extractor. */
export function mergeNodeIntoStats(
  o: Record<string, unknown>,
  cur: Partial<NormalizedPlayerStats>,
): Partial<NormalizedPlayerStats> {
  const bowledLbw =
    o.bowled_lbw_dismissals ??
    o.bowledLbwDismissals ??
    o.dismissals_bowled_lbw;
  const rDirect = o.run_out_direct ?? o.runOutDirect;
  const rIndirect = o.run_out_indirect ?? o.runOutIndirect;
  return {
    ...cur,
    runs: Number(o.runs ?? o.run ?? o.score ?? cur.runs ?? 0),
    ballsFaced: Number(o.balls_faced ?? o.ball ?? o.balls ?? o.b ?? cur.ballsFaced ?? 0),
    fours: Number(o.fours ?? o.four ?? o.four_x ?? cur.fours ?? 0),
    sixes: Number(o.sixes ?? o.six ?? o.six_x ?? cur.sixes ?? 0),
    isDismissed: Boolean(o.dismissed ?? o.out ?? cur.isDismissed),
    wickets: Number(o.wickets ?? cur.wickets ?? 0),
    bowledLbwDismissals:
      bowledLbw != null ? Number(bowledLbw) : cur.bowledLbwDismissals,
    oversBowled: Number(o.overs ?? o.oversBowled ?? cur.oversBowled ?? 0),
    runsConceded: Number(o.runs_conceded ?? o.conceded ?? cur.runsConceded ?? 0),
    maidens: Number(o.maidens ?? o.medians ?? cur.maidens ?? 0),
    catches: Number(o.catches ?? cur.catches ?? 0),
    stumpings: Number(o.stumpings ?? cur.stumpings ?? 0),
    runOutDirect:
      rDirect != null ? Number(rDirect) : cur.runOutDirect,
    runOutIndirect:
      rIndirect != null ? Number(rIndirect) : cur.runOutIndirect,
    runOuts: Number(o.run_outs ?? o.runouts ?? cur.runOuts ?? 0),
  };
}

/** Map SportMonks livescore / fixture payload → stats by player id string (best-effort). */
export function extractLiveStatsByPlayer(
  data: unknown,
): Record<string, Partial<NormalizedPlayerStats>> {
  const out: Record<string, Partial<NormalizedPlayerStats>> = {};
  if (!data || typeof data !== "object") return out;

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const keys = collectPlayerIdKeys(o);
    if (keys.size > 0) {
      for (const key of keys) {
        const cur = out[key] ?? {};
        out[key] = mergeNodeIntoStats(o, cur);
      }
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  };

  visit(data);
  return out;
}
