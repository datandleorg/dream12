import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/wallet-low-balance-reminder";

/** Default 7d between repeat reminders per user; max rows per run (see RPC caps). */
const DEFAULT_COOLDOWN_HOURS = 168;
const DEFAULT_MAX_INSERTS = 200;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("wallet_low_balance_reminder_run", {
      p_cooldown_hours: DEFAULT_COOLDOWN_HOURS,
      p_max_inserts: DEFAULT_MAX_INSERTS,
    });

    const durationMs = Date.now() - t0;

    if (error) {
      console.error(`[dream12-api-cron] ${ROUTE} RPC error`, error.message);
      recordCronRun({
        route: ROUTE,
        durationMs,
        ok: false,
        status: 500,
        summary: { error: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const summary = data as Record<string, unknown> | null;
    console.log(`[dream12-api-cron] ${ROUTE} DONE`, { durationMs, ...summary });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: true,
      status: 200,
      summary: summary ?? {},
    });
    return NextResponse.json(summary ?? {});
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
