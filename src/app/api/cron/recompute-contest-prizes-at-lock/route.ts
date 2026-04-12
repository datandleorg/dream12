import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runRecomputePrizesAfterJoinLock } from "@/lib/cron-contest-maintenance";
import { recordCronRun } from "@/lib/cron-run-log";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/recompute-contest-prizes-at-lock";

/**
 * @deprecated Prefer scheduled `GET /api/cron/contest-maintenance` (runs settle + recompute).
 * Scales `contests.gross_collected`, `prize_pool`, and `prize_breakup` to actual
 * Paid `user_teams` count (`entry_fee_paid_at` set) after join lock (1 min before start). No wallet payouts;
 * settlement still runs later via settle-contests or contest-maintenance.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  const supabase = createServiceClient();
  const result = await runRecomputePrizesAfterJoinLock(supabase);

  if (!result.ok) {
    const durationMs = Date.now() - t0;
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { error: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const durationMs = Date.now() - t0;
  const body = result.body;
  console.log(`[dream12-api-cron] ${ROUTE} DONE`, {
    durationMs,
    eligible: body.eligible,
    processed: body.processed,
  });
  recordCronRun({
    route: ROUTE,
    durationMs,
    ok: true,
    status: 200,
    summary: body,
  });

  return NextResponse.json(body);
}
