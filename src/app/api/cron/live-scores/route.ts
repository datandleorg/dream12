import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { aggregateTeamPoints } from "@/lib/live-scoring";
import { createServiceClient } from "@/lib/supabase/service";
import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { sportmonksFetch, sportmonksToken } from "@/lib/sportmonks/client";

export const dynamic = "force-dynamic";

/** Map Sportmonks livescore payload → stats by player id string (best-effort). */
function extractLiveStatsByPlayer(data: unknown): Record<string, Partial<NormalizedPlayerStats>> {
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

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: liveMatches } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "live");

  const ids = liveMatches?.map((m) => m.id) ?? [];
  if (!ids.length) {
    return NextResponse.json({ updated: 0, note: "No live matches in DB." });
  }

  let liveMap: Record<string, Partial<NormalizedPlayerStats>> = {};

  if (sportmonksToken()) {
    try {
      const json = (await sportmonksFetch("/livescores")) as { data?: unknown[] };
      const blob = json.data ?? [];
      for (const item of blob) {
        const merged = extractLiveStatsByPlayer(item);
        liveMap = { ...liveMap, ...merged };
      }
    } catch {
      liveMap = {};
    }
  }

  let updated = 0;

  for (const matchId of ids) {
    const { data: teams } = await supabase
      .from("user_teams")
      .select("id,user_id,captain_id,vice_captain_id")
      .eq("match_id", matchId);

    if (!teams?.length) continue;

    for (const team of teams) {
      const { data: rosterJoin } = await supabase
        .from("team_roster")
        .select("player_id, players ( sportmonks_id, role )")
        .eq("team_id", team.id);

      const roster =
        rosterJoin?.map((r) => {
          const p = r.players as unknown;
          const row =
            p && typeof p === "object" && !Array.isArray(p)
              ? (p as { sportmonks_id?: number | null; role?: string })
              : null;
          return {
            player_id: r.player_id as string,
            sportmonks_id: row?.sportmonks_id ?? null,
            role: row?.role ?? "BAT",
          };
        }) ?? [];

      if (!roster.length) continue;

      const points = aggregateTeamPoints(
        roster,
        team.captain_id as string,
        team.vice_captain_id as string,
        liveMap,
      );

      const { error } = await supabase
        .from("user_teams")
        .update({ total_points: points, updated_at: new Date().toISOString() })
        .eq("id", team.id);
      if (!error) updated += 1;
    }
  }

  return NextResponse.json({ updated, matches: ids.length });
}
