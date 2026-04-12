import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  runRecomputePrizesAfterJoinLock,
  runSettleContests,
} from "@/lib/cron-contest-maintenance";
import { recordCronRun } from "@/lib/cron-run-log";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/contest-maintenance";

/**
 * Single scheduled job: settle contests with null `prizes_settled_at`, then recompute
 * prize rows after join lock. Replaces separate `/api/cron/settle-contests` and
 * `/api/cron/recompute-contest-prizes-at-lock` cron entries.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  const supabase = createServiceClient();

  const settle = await runSettleContests(supabase);
  if (!settle.ok) {
    const durationMs = Date.now() - t0;
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { phase: "settle", error: settle.error },
    });
    return NextResponse.json({ error: settle.error, phase: "settle" }, { status: 500 });
  }

  const recompute = await runRecomputePrizesAfterJoinLock(supabase);
  if (!recompute.ok) {
    const durationMs = Date.now() - t0;
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: {
        phase: "recompute",
        error: recompute.error,
        settle: settle.body,
      },
    });
    return NextResponse.json(
      { error: recompute.error, phase: "recompute", settle: settle.body },
      { status: 500 },
    );
  }

  const durationMs = Date.now() - t0;
  const body = { settle: settle.body, recompute: recompute.body };
  console.log(`[dream12-api-cron] ${ROUTE} DONE`, {
    durationMs,
    settleProcessed: settle.body.processed,
    settleSkipped: settle.body.skipped.length,
    recomputeEligible: recompute.body.eligible,
    recomputeProcessed: recompute.body.processed,
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
