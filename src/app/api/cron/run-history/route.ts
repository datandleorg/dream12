import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { cronRunLogPath, readCronRunHistory } from "@/lib/cron-run-log";

export const dynamic = "force-dynamic";

/** Last N cron executions (JSONL-backed). Same auth as other cron routes. */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const n = Math.min(
    200,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50),
  );
  const runs = readCronRunHistory(n);
  return NextResponse.json({
    logFile: cronRunLogPath(),
    count: runs.length,
    runs,
  });
}
