import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { syncScoreboardSnapshots } from "@/lib/sportmonks/sync-scoreboards";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/sync-scoreboards";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START (every-2m scoreboard snapshots)`);

  try {
    const result = await syncScoreboardSnapshots();
    const durationMs = Date.now() - t0;
    console.log(`[dream12-api-cron] ${ROUTE} DONE`, {
      durationMs,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      fixtureIds: result.ids,
    });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: true,
      status: 200,
      summary: result,
    });
    return NextResponse.json(result);
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : "Sync failed";
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
