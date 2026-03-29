import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { runLiveMatchTick } from "@/lib/live-match-tick";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/live-match-tick";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  try {
    const supabase = createServiceClient();
    const result = await runLiveMatchTick(supabase);
    const durationMs = Date.now() - t0;
    console.log(`[dream12-api-cron] ${ROUTE} DONE`, { durationMs, ...result });
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
