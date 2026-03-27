import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { syncScoreboardSnapshots } from "@/lib/sportmonks/sync-scoreboards";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncScoreboardSnapshots();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
