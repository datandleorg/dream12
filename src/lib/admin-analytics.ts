import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminBusinessAnalytics = {
  registeredUsers: number;
  activeUsers: number;
  deactivatedUsers: number;
  newUsersLast30Days: number;
  totalContests: number;
  userCreatedContests: number;
  totalEntries: number;
  avgEntriesPerContest: number | null;
  sumGrossCollected: number;
  sumPrizePool: number;
  matchesByStatus: Record<string, number>;
};

function countOrZero(res: { count: number | null; error: Error | null }): number {
  if (res.error) return 0;
  return res.count ?? 0;
}

const MATCH_STATUSES = ["upcoming", "live", "completed", "in_review"] as const;

/** Parallel Supabase reads; aggregates contest money in JS. Admin RLS must allow profile reads. */
export async function loadAdminBusinessAnalytics(
  supabase: SupabaseClient,
): Promise<AdminBusinessAnalytics> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffIso = cutoff.toISOString();

  const [
    profilesTotal,
    profilesActive,
    profilesDeactivated,
    profilesNew,
    contestsTotal,
    contestsUserCreated,
    entriesTotal,
    contestMoney,
    ...matchCountResults
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", cutoffIso),
    supabase.from("contests").select("*", { count: "exact", head: true }),
    supabase.from("contests").select("*", { count: "exact", head: true }).not("created_by", "is", null),
    supabase.from("user_teams").select("*", { count: "exact", head: true }),
    supabase.from("contests").select("gross_collected, prize_pool"),
    ...MATCH_STATUSES.map((status) =>
      supabase.from("matches").select("*", { count: "exact", head: true }).eq("status", status),
    ),
  ]);

  const totalContests = countOrZero(contestsTotal);
  const totalEntries = countOrZero(entriesTotal);

  let sumGrossCollected = 0;
  let sumPrizePool = 0;
  if (!contestMoney.error && contestMoney.data) {
    for (const row of contestMoney.data) {
      const g = row.gross_collected as string | number | null | undefined;
      const p = row.prize_pool as string | number | null | undefined;
      sumGrossCollected += Number(g ?? 0) || 0;
      sumPrizePool += Number(p ?? 0) || 0;
    }
  }

  const matchesByStatus: Record<string, number> = {};
  MATCH_STATUSES.forEach((status, i) => {
    matchesByStatus[status] = countOrZero(matchCountResults[i]!);
  });

  return {
    registeredUsers: countOrZero(profilesTotal),
    activeUsers: countOrZero(profilesActive),
    deactivatedUsers: countOrZero(profilesDeactivated),
    newUsersLast30Days: countOrZero(profilesNew),
    totalContests,
    userCreatedContests: countOrZero(contestsUserCreated),
    totalEntries,
    avgEntriesPerContest: totalContests > 0 ? totalEntries / totalContests : null,
    sumGrossCollected,
    sumPrizePool,
    matchesByStatus,
  };
}
