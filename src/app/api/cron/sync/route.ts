import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runFullSportmonksSync } from "@/lib/sportmonks/sync";
import { SyncLogger } from "@/lib/sportmonks/sync-logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const verbose =
    request.nextUrl.searchParams.get("verbose") === "1" ||
    request.nextUrl.searchParams.get("verbose") === "true";

  const log = new SyncLogger(verbose ? 4000 : 2500);
  const result = await runFullSportmonksSync({ log });

  const body: Record<string, unknown> = {
    ...result,
    lineups: {
      processed: result.lineups.processed,
      inserted: result.lineups.inserted,
      notes: result.lineups.notes.slice(0, 20),
    },
  };

  if (verbose) {
    body.logs = log.getLines();
  }

  return NextResponse.json(body);
}
