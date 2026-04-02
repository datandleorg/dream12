export type SeasonLeaderboardRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  contests_played: number;
  contests_in_window: number;
  total_points: number;
  simple_avg: number;
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number(v);
}

/** Normalize RPC / JSON numeric fields into plain numbers for the client table. */
export function normalizeLeaderboardRows(
  raw: Record<string, unknown>[],
): SeasonLeaderboardRow[] {
  return raw.map((r) => ({
    user_id: String(r.user_id),
    username: String(r.username ?? ""),
    avatar_url:
      r.avatar_url != null && String(r.avatar_url).trim() !== ""
        ? String(r.avatar_url).trim()
        : null,
    contests_played: Math.trunc(num(r.contests_played)),
    contests_in_window: Math.trunc(num(r.contests_in_window)),
    total_points: num(r.total_points),
    simple_avg: num(r.simple_avg),
  }));
}
