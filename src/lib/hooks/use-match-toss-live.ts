"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/**
 * Toss columns only — avoids parsing `live_snapshot` on every ball during squad pick.
 * Uses a distinct channel name from `useMatchLiveRow` so both can coexist if needed.
 */
export function useMatchTossLive(
  matchId: number,
  initial: { toss_winner_team_id: number | null; toss_decision: string | null },
): { tossWinnerTeamId: number | null; tossDecision: string | null } {
  const [tossWinnerTeamId, setTossWinnerTeamId] = useState<number | null>(
    initial.toss_winner_team_id,
  );
  const [tossDecision, setTossDecision] = useState<string | null>(
    initial.toss_decision,
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset when navigating or SSR toss payload changes */
    setTossWinnerTeamId(initial.toss_winner_team_id);
    setTossDecision(initial.toss_decision);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [matchId, initial.toss_winner_team_id, initial.toss_decision]);

  useEffect(() => {
    if (!Number.isFinite(matchId) || matchId <= 0) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`matches-toss:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if ("toss_winner_team_id" in row) {
            setTossWinnerTeamId(numOrNull(row.toss_winner_team_id));
          }
          if ("toss_decision" in row) {
            setTossDecision(strOrNull(row.toss_decision));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  useEffect(() => {
    if (!Number.isFinite(matchId) || matchId <= 0) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("matches")
          .select("toss_winner_team_id,toss_decision")
          .eq("id", matchId)
          .maybeSingle();
        if (error || !data) return;
        const d = data as Record<string, unknown>;
        if ("toss_winner_team_id" in d) {
          setTossWinnerTeamId(numOrNull(d.toss_winner_team_id));
        }
        if ("toss_decision" in d) {
          setTossDecision(strOrNull(d.toss_decision));
        }
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [matchId]);

  return { tossWinnerTeamId, tossDecision };
}
