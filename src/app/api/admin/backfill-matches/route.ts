import { NextResponse, type NextRequest } from "next/server";
import { withNextApiLogging } from "@/lib/api-with-logging";
import { verifyCronRequest } from "@/lib/cron-auth";
import { requireAdminService } from "@/lib/admin-server";
import { runBackfillMatchesBatch } from "@/lib/backfill-matches";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): Parameters<typeof runBackfillMatchesBatch>[1] {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  let matchIds: number[] | undefined;
  if (Array.isArray(o.matchIds)) {
    matchIds = o.matchIds.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  }
  return {
    limit: typeof o.limit === "number" ? o.limit : undefined,
    cursor:
      o.cursor === null
        ? null
        : typeof o.cursor === "number"
          ? o.cursor
          : undefined,
    includeBalls: o.includeBalls === true,
    recomputePoints: o.recomputePoints === true,
    seasonId:
      typeof o.seasonId === "number" && Number.isFinite(o.seasonId)
        ? o.seasonId
        : undefined,
    matchId:
      typeof o.matchId === "number" && Number.isFinite(o.matchId) ? o.matchId : undefined,
    matchIds,
  };
}

/**
 * Admin session or `Authorization: Bearer CRON_SECRET`. Batched match hydration (recovery after flush).
 */
async function handlePost(request: NextRequest) {
  const cronOk = verifyCronRequest(request);
  let supabase = createServiceClient();

  if (!cronOk) {
    const gate = await requireAdminService();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: 403 });
    }
    supabase = gate.service;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const opts = parseBody(body);
  const result = await runBackfillMatchesBatch(supabase, opts);
  return NextResponse.json(result);
}

export const POST = withNextApiLogging(handlePost);
