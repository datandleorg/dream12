"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SeasonOption } from "@/lib/season-leaderboard-default";
import { formatSeasonLabel } from "@/lib/season-leaderboard-default";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { PullToRefresh } from "@/components/pull-to-refresh";
import type { SeasonLeaderboardRow } from "@/lib/season-leaderboard-rows";

type SortKey = "username" | "contests_played" | "total_points" | "simple_avg";

type SortDir = "asc" | "desc";

function tiebreak(a: SeasonLeaderboardRow, b: SeasonLeaderboardRow): number {
  const tp = b.total_points - a.total_points;
  if (tp !== 0) return tp;
  const cp = b.contests_played - a.contests_played;
  if (cp !== 0) return cp;
  return a.user_id.localeCompare(b.user_id);
}

function comparePrimary(
  a: SeasonLeaderboardRow,
  b: SeasonLeaderboardRow,
  key: SortKey,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  if (key === "username") {
    const c = a.username.localeCompare(b.username) * sign;
    if (c !== 0) return c;
    return 0;
  }
  const va = a[key];
  const vb = b[key];
  if (va !== vb) return (va - vb) * sign;
  return 0;
}

function sortRows(
  rows: SeasonLeaderboardRow[],
  key: SortKey,
  dir: SortDir,
): SeasonLeaderboardRow[] {
  return [...rows].sort((a, b) => {
    const p = comparePrimary(a, b, key, dir);
    if (p !== 0) return p;
    return tiebreak(a, b);
  });
}

function fmtScore(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

export function SeasonLeaderboardClient({
  seasons,
  initialSeasonId,
  rows,
  currentUserId,
  contestsInWindow,
}: {
  seasons: SeasonOption[];
  initialSeasonId: number;
  rows: SeasonLeaderboardRow[];
  currentUserId: string;
  contestsInWindow: number;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("total_points");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir),
    [rows, sortKey, sortDir],
  );

  const onSeasonChange = (nextId: string) => {
    router.replace(`/leaderboard?season=${encodeURIComponent(nextId)}`);
  };

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "username" ? "asc" : "desc");
    }
  };

  const headerCls = (key: SortKey) =>
    cn(
      "cursor-pointer select-none tap-app hover:text-foreground",
      sortKey === key && "text-primary",
    );

  const sortHint = (key: SortKey) =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <PullToRefresh scrollContainerClassName="max-h-[min(65dvh,720px)]">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="season-leaderboard-season">Season</Label>
          <select
            id="season-leaderboard-season"
            className={cn(
              "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-11 w-full rounded-md border px-3 py-2 text-sm",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            )}
            value={String(initialSeasonId)}
            onChange={(e) => onSeasonChange(e.target.value)}
          >
            {seasons.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {formatSeasonLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          Rankings use contests from matches that are{" "}
          <span className="text-foreground font-medium">completed</span> with{" "}
          <span className="text-foreground font-medium">finalized scoring</span>.
          Total fantasy points and average points per contest (
          {contestsInWindow > 0
            ? `${contestsInWindow} contest${contestsInWindow === 1 ? "" : "s"} in this season window`
            : "no contests in this season window yet"}
          ).
        </p>

        {contestsInWindow === 0 ? (
          <p className="text-muted-foreground text-sm">
            No finalized contests this season yet. Check back after matches finish
            scoring.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No fantasy entries in this season window yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead
                  className={headerCls("username")}
                  onClick={() => onHeaderClick("username")}
                >
                  User{sortHint("username")}
                </TableHead>
                <TableHead
                  className={cn(headerCls("contests_played"), "text-right")}
                  onClick={() => onHeaderClick("contests_played")}
                >
                  Contests{sortHint("contests_played")}
                </TableHead>
                <TableHead
                  className={cn(headerCls("total_points"), "text-right")}
                  onClick={() => onHeaderClick("total_points")}
                >
                  Total{sortHint("total_points")}
                </TableHead>
                <TableHead
                  className={cn(headerCls("simple_avg"), "text-right")}
                  onClick={() => onHeaderClick("simple_avg")}
                >
                  Avg{sortHint("simple_avg")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow
                  key={r.user_id}
                  className={cn(
                    r.user_id === currentUserId && "bg-primary/8 ring-primary/20 ring-1",
                  )}
                >
                  <TableCell className="text-muted-foreground font-medium">
                    {i + 1}
                  </TableCell>
                  <TableCell className="max-w-[10rem] font-medium">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserAvatar
                        avatarUrl={r.avatar_url}
                        username={r.username}
                        userIdFallback={r.user_id}
                        size="sm"
                      />
                      <span className="truncate">{r.username || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.contests_played}/{r.contests_in_window}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtScore(r.total_points)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtScore(r.simple_avg)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PullToRefresh>
  );
}
