"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Row = {
  id: string;
  user_id: string;
  total_points: number;
  username: string | null;
};

export function LeaderboardRealtime({
  contestId,
  initialRows,
}: {
  contestId: string;
  initialRows: Row[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.total_points - a.total_points),
    [rows],
  );

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
          };
          setRows((prev) => {
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
            const rest = prev.filter((r) => r.id !== next.id);
            return [
              ...rest,
              {
                id: next.id,
                user_id: next.user_id,
                total_points: pts,
                username,
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

  return (
    <ol className="space-y-2">
      {sorted.map((r, i) => (
        <li
          key={r.id}
          className={cn(
            "flex min-h-11 items-center justify-between rounded-xl border px-4 py-3 transition-colors",
            flash[r.id] === "up" && "bg-emerald-500/15",
            flash[r.id] === "down" && "bg-red-500/10",
          )}
        >
          <span className="text-muted-foreground w-8 font-medium tabular-nums">
            {i + 1}
          </span>
          <span className="flex-1 truncate font-medium">
            {r.username ?? r.user_id.slice(0, 8)}
          </span>
          <span className="tabular-nums font-semibold">
            {Number(r.total_points).toFixed(1)}
          </span>
        </li>
      ))}
    </ol>
  );
}
