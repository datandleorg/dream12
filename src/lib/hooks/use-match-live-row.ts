"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildLiveSnapshotFromFixture,
  parseLiveSnapshot,
  type LiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";

export type MatchLiveRowArgs = {
  matchId: number;
  live_snapshot: unknown;
  live_snapshot_at: string | null;
  status: string;
  sm_fixture_status: string | null;
  sm_fixture_note?: string | null;
  /** Persisted scoreboard fragment; kept in sync for rich scorecard (nested wicket/bowler rows). */
  fixture_scoreboard_raw?: unknown;
  /**
   * When the server already merged a fresher snapshot (e.g. resolveLiveSnapshotForPage),
   * use this for the first paint; DB + realtime remain the source of truth after.
   */
  initialParsedSnapshot?: LiveSnapshot | null;
  toss_winner_team_id?: number | null;
  toss_decision?: string | null;
};

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function snapshotFromInitial(args: MatchLiveRowArgs): LiveSnapshot {
  if (args.initialParsedSnapshot) return args.initialParsedSnapshot;
  return (
    parseLiveSnapshot(args.live_snapshot) ?? buildLiveSnapshotFromFixture(null)
  );
}

/**
 * Subscribes to `public.matches` UPDATE for one fixture (authenticated users only; RLS).
 */
export function useMatchLiveRow(args: MatchLiveRowArgs): {
  snapshot: LiveSnapshot;
  liveSnapshotAt: string | null;
  status: string;
  smFixtureStatus: string | null;
  smFixtureNote: string | null;
  fixtureScoreboardRaw: unknown;
  tossWinnerTeamId: number | null;
  tossDecision: string | null;
} {
  const { matchId } = args;

  const [snapshot, setSnapshot] = useState<LiveSnapshot>(() =>
    snapshotFromInitial(args),
  );
  const [liveSnapshotAt, setLiveSnapshotAt] = useState<string | null>(
    args.live_snapshot_at,
  );
  const [status, setStatus] = useState(args.status);
  const [smFixtureStatus, setSmFixtureStatus] = useState<string | null>(
    args.sm_fixture_status,
  );
  const [smFixtureNote, setSmFixtureNote] = useState<string | null>(
    args.sm_fixture_note ?? null,
  );
  const [fixtureScoreboardRaw, setFixtureScoreboardRaw] = useState<unknown>(
    () => args.fixture_scoreboard_raw,
  );
  const [tossWinnerTeamId, setTossWinnerTeamId] = useState<number | null>(
    args.toss_winner_team_id ?? null,
  );
  const [tossDecision, setTossDecision] = useState<string | null>(
    args.toss_decision ?? null,
  );

  useEffect(() => {
    setSnapshot(snapshotFromInitial(args));
    setLiveSnapshotAt(args.live_snapshot_at);
    setStatus(args.status);
    setSmFixtureStatus(args.sm_fixture_status);
    setSmFixtureNote(args.sm_fixture_note ?? null);
    setFixtureScoreboardRaw(args.fixture_scoreboard_raw);
    setTossWinnerTeamId(args.toss_winner_team_id ?? null);
    setTossDecision(args.toss_decision ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when navigating to another match or new SSR payload
  }, [
    matchId,
    args.live_snapshot_at,
    args.status,
    args.sm_fixture_status,
    args.sm_fixture_note,
    args.initialParsedSnapshot,
    args.toss_winner_team_id,
    args.toss_decision,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    typeof args.live_snapshot === "object" && args.live_snapshot !== null
      ? JSON.stringify(args.live_snapshot)
      : String(args.live_snapshot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    typeof args.fixture_scoreboard_raw === "object" &&
    args.fixture_scoreboard_raw !== null
      ? JSON.stringify(args.fixture_scoreboard_raw)
      : String(args.fixture_scoreboard_raw ?? ""),
  ]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`matches:${matchId}`)
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
          if (row.live_snapshot != null) {
            const next =
              parseLiveSnapshot(row.live_snapshot) ??
              buildLiveSnapshotFromFixture(null);
            setSnapshot(next);
          }
          if ("live_snapshot_at" in row) {
            if (typeof row.live_snapshot_at === "string") {
              setLiveSnapshotAt(row.live_snapshot_at);
            } else if (row.live_snapshot_at === null) {
              setLiveSnapshotAt(null);
            }
          }
          if (typeof row.status === "string" && row.status) {
            setStatus(row.status);
          }
          if ("sm_fixture_status" in row) {
            if (typeof row.sm_fixture_status === "string") {
              setSmFixtureStatus(row.sm_fixture_status);
            } else if (row.sm_fixture_status === null) {
              setSmFixtureStatus(null);
            }
          }
          if ("sm_fixture_note" in row) {
            if (typeof row.sm_fixture_note === "string") {
              setSmFixtureNote(row.sm_fixture_note);
            } else if (row.sm_fixture_note === null) {
              setSmFixtureNote(null);
            }
          }
          if ("fixture_scoreboard_raw" in row) {
            setFixtureScoreboardRaw(row.fixture_scoreboard_raw);
          }
          if ("toss_winner_team_id" in row) {
            const n = numOrNull(row.toss_winner_team_id);
            setTossWinnerTeamId(n);
          }
          if ("toss_decision" in row) {
            const s = strOrNull(row.toss_decision);
            setTossDecision(s);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("matches")
          .select(
            "live_snapshot,live_snapshot_at,status,sm_fixture_status,sm_fixture_note,fixture_scoreboard_raw,toss_winner_team_id,toss_decision",
          )
          .eq("id", matchId)
          .maybeSingle();
        if (error || !data) return;
        const d = data as Record<string, unknown>;
        if (d.live_snapshot != null) {
          setSnapshot(
            parseLiveSnapshot(d.live_snapshot) ??
              buildLiveSnapshotFromFixture(null),
          );
        }
        if (typeof d.live_snapshot_at === "string" || d.live_snapshot_at === null) {
          setLiveSnapshotAt(
            typeof d.live_snapshot_at === "string" ? d.live_snapshot_at : null,
          );
        }
        if (typeof d.status === "string" && d.status) setStatus(d.status);
        if (
          typeof d.sm_fixture_status === "string" ||
          d.sm_fixture_status === null
        ) {
          setSmFixtureStatus(
            typeof d.sm_fixture_status === "string"
              ? d.sm_fixture_status
              : null,
          );
        }
        if (
          typeof d.sm_fixture_note === "string" ||
          d.sm_fixture_note === null
        ) {
          setSmFixtureNote(
            typeof d.sm_fixture_note === "string" ? d.sm_fixture_note : null,
          );
        }
        if ("fixture_scoreboard_raw" in d) {
          setFixtureScoreboardRaw(d.fixture_scoreboard_raw);
        }
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

  return {
    snapshot,
    liveSnapshotAt,
    status,
    smFixtureStatus,
    smFixtureNote,
    fixtureScoreboardRaw,
    tossWinnerTeamId,
    tossDecision,
  };
}
