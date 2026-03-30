"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_WINNER_COUNTS,
  buildPrizeSlabs,
  grossFromEntryAndSpots,
  netPrizePoolFromGross,
  platformFeeFractionFromEnv,
  roundMoney,
  sumSlabAmounts,
} from "@/lib/fantasy/prize-slabs";

export type CreateContestResult =
  | { ok: true; contestId: string }
  | { ok: false; message: string };

function mapRpcError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("not authenticated")) return "Sign in again to create a contest.";
  if (m.includes("deadline")) return "Team lock deadline has passed for this match.";
  if (m.includes("prize slab")) return "Invalid prize breakdown. Refresh and try again.";
  if (m.includes("sum")) return "Prize slabs must match the prize pool.";
  if (m.includes("spots")) return "Choose a valid number of spots (2–10000).";
  if (m.includes("winner count")) return "Choose a valid number of winners.";
  return msg;
}

export async function createContestAction(input: {
  matchId: number;
  name: string;
  entryFee: number;
  maxParticipants: number;
  winnerCount: number;
  grossCollected: number;
  isFlexible: boolean;
}): Promise<CreateContestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  if (!ALLOWED_WINNER_COUNTS.includes(input.winnerCount as (typeof ALLOWED_WINNER_COUNTS)[number])) {
    return { ok: false, message: "Invalid winner count." };
  }
  if (input.maxParticipants < 2 || input.maxParticipants > 10000) {
    return { ok: false, message: "Spots must be between 2 and 10000." };
  }
  if (input.entryFee < 0) {
    return { ok: false, message: "Invalid amounts." };
  }

  const gross = grossFromEntryAndSpots(input.entryFee, input.maxParticipants);
  if (Math.abs(gross - roundMoney(input.grossCollected)) > 0.05) {
    return { ok: false, message: "Contest totals do not match. Refresh and try again." };
  }

  const feeFraction = platformFeeFractionFromEnv();
  const prizePool = netPrizePoolFromGross(gross, feeFraction);
  const prizeBreakup = buildPrizeSlabs(prizePool, input.winnerCount);
  if (Math.abs(sumSlabAmounts(prizeBreakup) - prizePool) > 0.05) {
    return { ok: false, message: "Could not build prize breakdown. Try again." };
  }

  const { data: contestId, error } = await supabase.rpc("create_user_contest", {
    p_match_id: input.matchId,
    p_name: input.name,
    p_entry_fee: input.entryFee,
    p_max_participants: input.maxParticipants,
    p_prize_pool: prizePool,
    p_winner_count: input.winnerCount,
    p_prize_breakup: prizeBreakup,
    p_gross_collected: gross,
    p_is_flexible: input.isFlexible,
  });

  if (error) {
    return { ok: false, message: mapRpcError(error.message) };
  }
  if (!contestId) {
    return { ok: false, message: "Could not create contest." };
  }

  const id = contestId as string;
  revalidatePath(`/matches/${input.matchId}`);
  revalidatePath("/");
  return { ok: true, contestId: id };
}
