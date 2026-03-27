import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { runFullSportmonksSync } from "@/lib/sportmonks/sync";
import { SyncLogger } from "@/lib/sportmonks/sync-logger";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/sync";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START (full SportMonks sync)`);

  const verbose =
    request.nextUrl.searchParams.get("verbose") === "1" ||
    request.nextUrl.searchParams.get("verbose") === "true";

  try {
    const log = new SyncLogger(verbose ? 4000 : 2500);
    const result = await runFullSportmonksSync({ log });
    const durationMs = Date.now() - t0;

    const body: Record<string, unknown> = {
      ...result,
      lineups: {
        processed: result.lineups.processed,
        inserted: result.lineups.inserted,
        notes: result.lineups.notes.slice(0, 20),
      },
    };

    if (verbose) {
      body.logs = log.getLines();
    }

    const summary = {
      durationMs,
      matches: result.matches,
      lineups: body.lineups,
      activeSeasonId: result.activeSeasonId,
    };
    console.log(`[dream12-api-cron] ${ROUTE} DONE`, summary);
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: true,
      status: 200,
      summary,
    });

    return NextResponse.json(body);
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dream12-api-cron] ${ROUTE} ERROR`, { durationMs, msg });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { error: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
