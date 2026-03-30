import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-server";
import {
  MAX_MATCHES_PER_RUN,
  runLiveMatchTickForMatch,
  runMatchPipeline,
} from "@/lib/live-match-tick";
import type { DbMatchStatus } from "@/lib/sportmonks/match-status-from-sm";
import { fetchLivescoresNowByFixtureId } from "@/lib/sportmonks/fixture-scoreboard";

export const dynamic = "force-dynamic";

/**
 * Admin-only: same pipeline as cron live tick (single match or batch of live matches).
 * POST JSON body `{ "matchId": 12345 }` for one fixture; omit body to process up to MAX_MATCHES_PER_RUN live matches.
 */
export async function POST(request: Request) {
  const gate = await requireAdminService();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  let matchId: number | undefined;
  try {
    const body = (await request.json()) as { matchId?: number };
    if (body?.matchId != null && Number.isFinite(Number(body.matchId))) {
      matchId = Number(body.matchId);
    }
  } catch {
    /* empty body → batch */
  }

  const service = gate.service;

  if (matchId != null) {
    let nowMap;
    try {
      nowMap = await fetchLivescoresNowByFixtureId();
    } catch {
      nowMap = new Map<number, Record<string, unknown>>();
    }
    const { data: row } = await service
      .from("matches")
      .select("status,last_lineup_sync_at")
      .eq("id", matchId)
      .maybeSingle();
    const st = String(row?.status ?? "live");
    const previousDbStatus: DbMatchStatus =
      st === "upcoming" || st === "live" || st === "completed" || st === "in_review"
        ? st
        : "live";
    const result = await runLiveMatchTickForMatch(service, matchId, nowMap, {
      previousDbStatus,
      lastLineupSyncAt: row?.last_lineup_sync_at as string | null,
      forceLineup: true,
    });
    return NextResponse.json({ matchId, ...result });
  }

  const batch = await runMatchPipeline(service);
  return NextResponse.json({ ...batch, maxMatchesPerRun: MAX_MATCHES_PER_RUN });
}
