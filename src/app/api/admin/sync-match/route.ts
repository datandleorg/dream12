import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-server";
import {
  MAX_MATCHES_PER_RUN,
  runLiveMatchTick,
  runLiveMatchTickForMatch,
} from "@/lib/live-match-tick";
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
    const result = await runLiveMatchTickForMatch(service, matchId, nowMap, {
      forceLineup: true,
    });
    return NextResponse.json({ matchId, ...result });
  }

  const batch = await runLiveMatchTick(service);
  return NextResponse.json({ ...batch, maxMatchesPerRun: MAX_MATCHES_PER_RUN });
}
