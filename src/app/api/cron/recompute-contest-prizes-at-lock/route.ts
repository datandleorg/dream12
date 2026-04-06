import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/recompute-contest-prizes-at-lock";

/**
 * Scales `contests.gross_collected`, `prize_pool`, and `prize_breakup` to actual
 * Paid `user_teams` count (`entry_fee_paid_at` set) after join lock (1 min before start). No wallet payouts;
 * settlement still runs later via settle-contests.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  const supabase = createServiceClient();
  const { data: idRows, error: listErr } = await supabase.rpc(
    "contest_ids_eligible_for_join_lock_prize_recompute",
    { p_limit: 50 },
  );

  if (listErr) {
    const durationMs = Date.now() - t0;
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { error: listErr.message },
    });
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const results: unknown[] = [];
  const rows = (idRows ?? []) as { contest_id?: string }[];
  for (const row of rows) {
    const contestId = row.contest_id;
    if (!contestId) continue;
    const { data, error } = await supabase.rpc("recompute_contest_prizes_after_join_lock", {
      p_contest_id: contestId,
    });
    if (error) {
      results.push({ contestId, error: error.message });
      continue;
    }
    results.push({ contestId, result: data });
  }

  const durationMs = Date.now() - t0;
  const body = {
    eligible: rows.length,
    processed: results.length,
    results,
  };
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
