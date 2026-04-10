"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  compareLeaderboardRows,
  contestTieMetasForSortedLeaderboard,
  projectedPrizeInrForTiedRow,
} from "@/lib/contest-prize";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type Row = {
  id: string;
  user_id: string;
  total_points: number;
  username: string | null;
  avatar_url: string | null;
  /** ISO join/created time for tie ordering (matches settlement). */
  created_at?: string | null;
};

/** Fixed locale + TZ so SSR and browser match (avoids hydration mismatch). */
const POINTS_UPDATED_AT_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function formatPointsUpdatedAtLabel(iso: string): string {
  return POINTS_UPDATED_AT_FORMAT.format(new Date(iso));
}

export function LeaderboardRealtime({
  contestId,
  initialRows,
  refreshNonce = 0,
  currentUserId = null,
  onRowSelect,
  payoutByTeamId = {},
  prizesSettled = false,
  prizeBreakup,
  teamCount,
  pointsUpdatedAt = null,
  opponentTeamPreviewLocked = false,
}: {
  contestId: string;
  initialRows: Row[];
  refreshNonce?: number;
  currentUserId?: string | null;
  onRowSelect?: (row: Row) => void;
  payoutByTeamId?: Record<string, number>;
  prizesSettled?: boolean;
  prizeBreakup?: unknown;
  teamCount?: number;
  pointsUpdatedAt?: string | null;
  /** When true, only the viewer's own row opens team preview (match still upcoming). */
  opponentTeamPreviewLocked?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});

  const sorted = useMemo(
    () => [...rows].sort(compareLeaderboardRows),
    [rows],
  );

  const tieMetas = useMemo(
    () => contestTieMetasForSortedLeaderboard(sorted),
    [sorted],
  );

  useEffect(() => {
    if (refreshNonce === 0) return;
    setRows(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when pull-to-refresh bumps nonce
  }, [refreshNonce]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`user_teams:${contestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_teams",
          filter: `contest_id=eq.${contestId}`,
        },
        (payload) => {
          const next = payload.new as {
            id: string;
            user_id: string;
            total_points: number;
            entry_fee_paid_at?: string | null;
          };
          setRows((prev) => {
            if (next.entry_fee_paid_at === null) {
              return prev.filter((r) => r.id !== next.id);
            }
            const old = prev.find((r) => r.id === next.id);
            const pts = Number(next.total_points);
            if (old && pts !== old.total_points) {
              setFlash((f) => ({
                ...f,
                [next.id]: pts > old.total_points ? "up" : "down",
              }));
              setTimeout(() => {
                setFlash((f) => {
                  const rest = { ...f };
                  delete rest[next.id];
                  return rest;
                });
              }, 1200);
            }
            const username =
              old?.username ??
              prev.find((r) => r.id === next.id)?.username ??
              null;
            const avatar_url =
              old?.avatar_url ??
              prev.find((r) => r.id === next.id)?.avatar_url ??
              null;
            const rest = prev.filter((r) => r.id !== next.id);
            return [
              ...rest,
              {
                id: next.id,
                user_id: next.user_id,
                total_points: pts,
                username,
                avatar_url,
                created_at: old?.created_at ?? null,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contestId]);

  const count = teamCount ?? sorted.length;

  return (
    <div className="space-y-2">
      {pointsUpdatedAt ? (
        <p className="text-muted-foreground px-0.5 text-center text-[11px] font-medium tracking-wide">
          Points last updated {formatPointsUpdatedAtLabel(pointsUpdatedAt)}
        </p>
      ) : null}
      <div className="text-muted-foreground grid grid-cols-[1fr_auto_auto] gap-2 border-b px-1 pb-2 text-xs font-semibold">
        <span>All teams ({count.toLocaleString("en-IN")})</span>
        <span className="text-right">Points</span>
        <span className="w-12 text-right">Rank</span>
      </div>
      <ol className="space-y-0 divide-y divide-border rounded-xl border bg-card">
        {sorted.map((r, i) => {
          const meta = tieMetas[i]!;
          const rank = meta.competitionRank;
          const won = prizesSettled ? payoutByTeamId[r.id] : undefined;
          const projected =
            !prizesSettled && prizeBreakup != null
              ? projectedPrizeInrForTiedRow(prizeBreakup, meta)
              : 0;
          const rowInteractive =
            Boolean(onRowSelect && currentUserId) &&
            (!opponentTeamPreviewLocked ||
              (currentUserId != null && r.user_id === currentUserId));
          const rowCls = cn(
            "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
            flash[r.id] === "up" && "bg-emerald-500/10",
            flash[r.id] === "down" && "bg-red-500/10",
            currentUserId && r.user_id === currentUserId && "bg-primary/8 ring-primary/20 ring-1",
            rowInteractive && "cursor-pointer hover:bg-muted/50",
            !rowInteractive && onRowSelect && currentUserId && "opacity-95",
            !rowInteractive && onRowSelect && !currentUserId && "opacity-90",
          );
          const inner = (
            <>
              <UserAvatar
                avatarUrl={r.avatar_url}
                username={r.username}
                userIdFallback={r.user_id}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {(r.username ?? r.user_id.slice(0, 8)).toUpperCase()}
                </div>
                {won != null && won > 0 ? (
                  <div className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold tabular-nums">
                    Won ₹{won.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>
                ) : !prizesSettled && projected > 0 ? (
                  <div className="text-muted-foreground text-xs tabular-nums">
                    Proj. ₹{projected.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums">
                  {Number(r.total_points).toLocaleString("en-IN", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1,
                  })}
                </div>
              </div>
              <div className="text-muted-foreground w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                #{rank}
              </div>
            </>
          );
          if (rowInteractive) {
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={rowCls}
                  onClick={() => onRowSelect?.(r)}
                >
                  {inner}
                </button>
              </li>
            );
          }
          return (
            <li key={r.id} className={rowCls}>
              {inner}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
