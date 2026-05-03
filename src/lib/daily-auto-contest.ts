import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPrizeSlabs,
  grossFromEntryAndSpots,
  netPrizePoolFromGross,
  platformFeeFractionFromEnv,
  roundMoney,
  sumSlabAmounts,
} from "@/lib/fantasy/prize-slabs";
import {
  TODAY_SCHEDULE_FUTURE_MS,
  TODAY_SCHEDULE_MATCH_LIMIT,
  TODAY_SCHEDULE_PAST_MS,
} from "@/lib/today-schedule-monitor";

/** Platform auto contest: must match idempotency query and insert name exactly. */
export const DAILY_AUTO_CONTEST_NAME = "Daily Contest 50Rs";

export const DAILY_AUTO_CONTEST_ENTRY_FEE = 50;
export const DAILY_AUTO_CONTEST_MAX_PARTICIPANTS = 15;
export const DAILY_AUTO_CONTEST_WINNER_COUNT = 3;

export type EnsureDailyAutoContestsResult = {
  examined: number;
  created: number;
  skippedExisting: number;
  errors: number;
};

/**
 * For each upcoming match in the same time window as {@link runTodayScheduleMonitor},
 * ensure one platform contest exists (created_by null): Daily Contest 50Rs, ₹50 × 15 spots, 3 winners.
 */
export async function ensureDailyAutoContests(
  supabase: SupabaseClient,
): Promise<EnsureDailyAutoContestsResult> {
  const now = Date.now();
  const horizon = new Date(now + TODAY_SCHEDULE_FUTURE_MS).toISOString();
  const from = new Date(now - TODAY_SCHEDULE_PAST_MS).toISOString();

  const { data: rows, error: qErr } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "upcoming")
    .gte("start_time", from)
    .lte("start_time", horizon)
    .order("start_time", { ascending: true })
    .limit(TODAY_SCHEDULE_MATCH_LIMIT);

  if (qErr) {
    console.error("[daily-auto-contest] matches query failed:", qErr.message);
    return { examined: 0, created: 0, skippedExisting: 0, errors: 1 };
  }

  const feeFraction = platformFeeFractionFromEnv();
  const gross = grossFromEntryAndSpots(
    DAILY_AUTO_CONTEST_ENTRY_FEE,
    DAILY_AUTO_CONTEST_MAX_PARTICIPANTS,
  );
  const prizePool = netPrizePoolFromGross(gross, feeFraction);
  const prizeBreakup = buildPrizeSlabs(prizePool, DAILY_AUTO_CONTEST_WINNER_COUNT);
  if (Math.abs(sumSlabAmounts(prizeBreakup) - prizePool) > 0.05) {
    console.error("[daily-auto-contest] prize slabs do not sum to pool");
    return { examined: 0, created: 0, skippedExisting: 0, errors: 1 };
  }

  let examined = 0;
  let created = 0;
  let skippedExisting = 0;
  let errors = 0;

  for (const r of rows ?? []) {
    const matchId = Number(r.id);
    if (!Number.isFinite(matchId)) continue;
    examined += 1;

    const { data: existing, error: exErr } = await supabase
      .from("contests")
      .select("id")
      .eq("match_id", matchId)
      .eq("name", DAILY_AUTO_CONTEST_NAME)
      .is("created_by", null)
      .eq("entry_fee", DAILY_AUTO_CONTEST_ENTRY_FEE)
      .eq("max_participants", DAILY_AUTO_CONTEST_MAX_PARTICIPANTS)
      .maybeSingle();

    if (exErr) {
      errors += 1;
      continue;
    }
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const { error: insErr } = await supabase.from("contests").insert({
      match_id: matchId,
      name: DAILY_AUTO_CONTEST_NAME,
      entry_fee: roundMoney(DAILY_AUTO_CONTEST_ENTRY_FEE),
      prize_pool: roundMoney(prizePool),
      max_participants: DAILY_AUTO_CONTEST_MAX_PARTICIPANTS,
      created_by: null,
      creator_joined_at: null,
      winner_count: DAILY_AUTO_CONTEST_WINNER_COUNT,
      prize_breakup: prizeBreakup,
      is_flexible: true,
      gross_collected: gross,
    });

    if (insErr) {
      console.error(
        `[daily-auto-contest] insert failed match_id=${matchId}:`,
        insErr.message,
      );
      errors += 1;
    } else {
      created += 1;
    }
  }

  return { examined, created, skippedExisting, errors };
}
