import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-server";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { syncPlayersForMatch } from "@/lib/sportmonks/sync-lineup";

export const dynamic = "force-dynamic";

/**
 * Admin-only: fetch SportMonks fixture lineup and refresh `players.in_playing_xi` for one match.
 * Works for any `matches.status` (including `completed`) — unlike batch `syncPlayers()` which only
 * considers upcoming/live fixtures.
 *
 * POST JSON: `{ "matchId": 12345 }` (SportMonks fixture id = `matches.id`).
 */
export async function POST(request: Request) {
  const gate = await requireAdminService();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  let matchId: number | undefined;
  try {
    const body = (await request.json()) as { matchId?: number };
    if (body?.matchId != null && Number.isFinite(Number(body.matchId))) {
      matchId = Number(body.matchId);
    }
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with numeric matchId" },
      { status: 400 },
    );
  }

  if (matchId == null) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  if (!isSportmonksFixtureId(matchId)) {
    return NextResponse.json(
      { error: "matchId must be a SportMonks fixture id (not a local test id)" },
      { status: 400 },
    );
  }

  const { data: match, error: matchErr } = await gate.service
    .from("matches")
    .select("id,status")
    .eq("id", matchId)
    .maybeSingle();

  if (matchErr) {
    return NextResponse.json({ error: matchErr.message }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const result = await syncPlayersForMatch(matchId);
  return NextResponse.json({
    matchId,
    status: match.status,
    ...result,
  });
}
