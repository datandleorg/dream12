import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";

/** Map SportMonks livescore / fixture payload → stats by player id string (best-effort). */
export function extractLiveStatsByPlayer(
  data: unknown,
): Record<string, Partial<NormalizedPlayerStats>> {
  const out: Record<string, Partial<NormalizedPlayerStats>> = {};
  if (!data || typeof data !== "object") return out;

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const pid = o.player_id ?? o.playerId;
    if (typeof pid === "number" || typeof pid === "string") {
      const key = String(pid);
      const cur = out[key] ?? {};
      out[key] = {
        ...cur,
        runs: Number(o.runs ?? o.run ?? cur.runs ?? 0),
        ballsFaced: Number(o.balls_faced ?? o.balls ?? cur.ballsFaced ?? 0),
        fours: Number(o.fours ?? o.four ?? cur.fours ?? 0),
        sixes: Number(o.sixes ?? o.six ?? cur.sixes ?? 0),
        isDismissed: Boolean(o.dismissed ?? o.out ?? cur.isDismissed),
        wickets: Number(o.wickets ?? cur.wickets ?? 0),
        oversBowled: Number(o.overs ?? o.oversBowled ?? cur.oversBowled ?? 0),
        runsConceded: Number(o.runs_conceded ?? o.conceded ?? cur.runsConceded ?? 0),
        maidens: Number(o.maidens ?? cur.maidens ?? 0),
        catches: Number(o.catches ?? cur.catches ?? 0),
        stumpings: Number(o.stumpings ?? cur.stumpings ?? 0),
        runOuts: Number(o.run_outs ?? o.runouts ?? cur.runOuts ?? 0),
      };
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  };

  visit(data);
  return out;
}
