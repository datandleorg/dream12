import { NextResponse, type NextRequest } from "next/server";
import { withNextApiLogging } from "@/lib/api-with-logging";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { logCron } from "@/lib/server-log";
import { createServiceClient } from "@/lib/supabase/service";
import { runFinalizeScoringBatch } from "@/lib/finalize-match-scoring";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/finalize-scores";

async function handleGet(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  try {
    const supabase = createServiceClient();
    const result = await runFinalizeScoringBatch(supabase, 20);
    const durationMs = Date.now() - t0;
    console.log(`[dream12-api-cron] ${ROUTE} DONE`, { durationMs, ...result });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: true,
      status: 200,
      summary: result,
    });
    logCron({ route: ROUTE, ok: true, durationMs, summary: result as Record<string, unknown> });
    return NextResponse.json(result);
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
    logCron({ route: ROUTE, ok: false, durationMs, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withNextApiLogging(handleGet);
