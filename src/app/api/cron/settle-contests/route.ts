import { NextResponse, type NextRequest } from "next/server";
import { withNextApiLogging } from "@/lib/api-with-logging";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { logCron } from "@/lib/server-log";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/settle-contests";

const SETTLE_PREREQ_NOTE =
  "Contest settlement runs only when the match is completed and scores are finalized (matches.scoring_finalized_at). Run /api/cron/finalize-scores or your admin flow first.";

async function handleGet(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  console.log(`[dream12-api-cron] ${ROUTE} START`);

  const supabase = createServiceClient();
  const { data: rows, error: qErr } = await supabase
    .from("contests")
    .select("id")
    .is("prizes_settled_at", null)
    .limit(25);

  if (qErr) {
    const durationMs = Date.now() - t0;
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { error: qErr.message },
    });
    logCron({ route: ROUTE, ok: false, durationMs, error: qErr.message });
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const results: unknown[] = [];
  const skipped: { contestId: string; reason: string }[] = [];

  for (const r of rows ?? []) {
    const contestId = r.id as string;
    const { data, error } = await supabase.rpc("settle_contest_prizes", {
      p_contest_id: contestId,
    });
    if (error) {
      results.push({ contestId, error: error.message });
      continue;
    }
    const payload = data as Record<string, unknown> | null;
    if (payload?.skipped && payload?.reason === "match_not_ready") {
      skipped.push({ contestId, reason: "match_not_ready" });
      continue;
    }
    results.push({ contestId, result: payload });
  }

  const durationMs = Date.now() - t0;
  const body = {
    processed: results.length,
    results,
    skipped,
    ...(skipped.length > 0 ? { note: SETTLE_PREREQ_NOTE } : {}),
  };
  console.log(`[dream12-api-cron] ${ROUTE} DONE`, {
    durationMs,
    processed: body.processed,
    skippedCount: skipped.length,
    pendingPrizesSettledAt: rows?.length ?? 0,
  });
  recordCronRun({
    route: ROUTE,
    durationMs,
    ok: true,
    status: 200,
    summary: body,
  });
  logCron({ route: ROUTE, ok: true, durationMs, summary: body as Record<string, unknown> });

  return NextResponse.json(body);
}

export const GET = withNextApiLogging(handleGet);
