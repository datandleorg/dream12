import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { aggregateTeamPoints } from "@/lib/live-scoring";
import { createServiceClient } from "@/lib/supabase/service";
import { extractLiveStatsByPlayer } from "@/lib/extract-live-stats-by-player";
import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { sportmonksFetch, sportmonksToken } from "@/lib/sportmonks/client";

export const dynamic = "force-dynamic";

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
