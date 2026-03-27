import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: rows, error: qErr } = await supabase
    .from("contests")
    .select("id")
    .is("prizes_settled_at", null)
    .limit(25);

  if (qErr) {
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

  return NextResponse.json({ processed: results.length, results });
}
