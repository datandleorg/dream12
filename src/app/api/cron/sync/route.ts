import { NextResponse, type NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { syncMatches, syncPlayers } from "@/lib/sportmonks/sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await syncMatches();
  const players = await syncPlayers();

  return NextResponse.json({
    matches,
    players: {
      processed: players.processed,
      inserted: players.inserted,
      notes: players.notes.slice(0, 20),
    },
  });
}
