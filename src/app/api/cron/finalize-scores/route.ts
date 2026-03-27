import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { runFinalizeScoringBatch } from "@/lib/finalize-match-scoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const result = await runFinalizeScoringBatch(supabase, 20);
  return NextResponse.json(result);
}
