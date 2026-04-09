import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { ensureDailyAutoContests } from "@/lib/daily-auto-contest";
import { createServiceClient } from "@/lib/supabase/service";
import { runTodayScheduleMonitor } from "@/lib/today-schedule-monitor";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/today-schedule";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  try {
    const supabase = createServiceClient();
    const result = await runTodayScheduleMonitor(supabase);
    const dailyAutoContests = await ensureDailyAutoContests(supabase);
    const durationMs = Date.now() - t0;
    const body = { ...result, dailyAutoContests };
    console.log(`[dream12-api-cron] ${ROUTE} DONE`, { durationMs, ...body });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: true,
      status: 200,
      summary: body,
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
