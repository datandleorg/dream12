import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/settle-contests";

export async function GET(request: NextRequest) {
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
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const results: unknown[] = [];
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
      continue;
    }
    results.push({ contestId, result: payload });
  }

  const durationMs = Date.now() - t0;
  const body = { processed: results.length, results };
  console.log(`[dream12-api-cron] ${ROUTE} DONE`, { durationMs, processed: body.processed });
  recordCronRun({
    route: ROUTE,
    durationMs,
    ok: true,
    status: 200,
    summary: body,
  });

  return NextResponse.json(body);
}
