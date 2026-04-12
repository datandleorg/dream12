import type { SupabaseClient } from "@supabase/supabase-js";

export const SETTLE_PREREQ_NOTE =
  "Contest settlement runs only when the match is completed and scores are finalized (matches.scoring_finalized_at). Run /api/cron/finalize-scores or your admin flow first.";

export type SettleContestsResultBody = {
  processed: number;
  results: unknown[];
  skipped: { contestId: string; reason: string }[];
  note?: string;
};

export type RecomputePrizesAtLockResultBody = {
  eligible: number;
  processed: number;
  results: unknown[];
};

export async function runSettleContests(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; body: SettleContestsResultBody; pendingPrizesSettledAt: number }
  | { ok: false; error: string }
> {
  const { data: rows, error: qErr } = await supabase
    .from("contests")
    .select("id")
    .is("prizes_settled_at", null)
    .limit(25);

  if (qErr) {
    return { ok: false, error: qErr.message };
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

  const body: SettleContestsResultBody = {
    processed: results.length,
    results,
    skipped,
    ...(skipped.length > 0 ? { note: SETTLE_PREREQ_NOTE } : {}),
  };

  return {
    ok: true,
    body,
    pendingPrizesSettledAt: rows?.length ?? 0,
  };
}

/**
 * Scales `contests.gross_collected`, `prize_pool`, and `prize_breakup` to actual
 * paid `user_teams` count after join lock. No wallet payouts; settlement runs via settle step.
 */
export async function runRecomputePrizesAfterJoinLock(
  supabase: SupabaseClient,
): Promise<{ ok: true; body: RecomputePrizesAtLockResultBody } | { ok: false; error: string }> {
  const { data: idRows, error: listErr } = await supabase.rpc(
    "contest_ids_eligible_for_join_lock_prize_recompute",
    { p_limit: 50 },
  );

  if (listErr) {
    return { ok: false, error: listErr.message };
  }

  const results: unknown[] = [];
  const rows = (idRows ?? []) as { contest_id?: string }[];
  for (const row of rows) {
    const contestId = row.contest_id;
    if (!contestId) continue;
    const { data, error } = await supabase.rpc("recompute_contest_prizes_after_join_lock", {
      p_contest_id: contestId,
    });
    if (error) {
      results.push({ contestId, error: error.message });
      continue;
    }
    results.push({ contestId, result: data });
  }

  return {
    ok: true,
    body: {
      eligible: rows.length,
      processed: results.length,
      results,
    },
  };
}
