import type { TeamBreakdownLine } from "@/lib/live-scoring";

function sortBreakdownLines(lines: TeamBreakdownLine[]): TeamBreakdownLine[] {
  return [...lines].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.player_name.localeCompare(b.player_name, undefined, { sensitivity: "base" });
  });
}

export function ContestTeamPointsBreakdown({ lines }: { lines: TeamBreakdownLine[] }) {
  const sorted = sortBreakdownLines(lines);
  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
        Points by player
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead>
            <tr className="border-b border-border/80 bg-muted/40 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-2 pl-3">Player</th>
              <th className="px-1 py-2 text-right">Perf</th>
              <th className="px-1 py-2 text-right">XI</th>
              <th className="px-2 py-2 pr-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((line) => (
              <tr
                key={line.player_id}
                className="border-border/60 border-b last:border-0 [&:nth-child(even)]:bg-muted/20"
              >
                <td className="max-w-[min(200px,55vw)] px-2 py-2 pl-3 align-top">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground" title={line.player_name}>
                      {line.player_name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground text-[10px] tabular-nums">
                        {line.team_label} · {line.role}
                      </span>
                      {line.is_captain ? (
                        <span className="rounded bg-red-600 px-1 py-px text-[9px] font-bold text-white">
                          C
                        </span>
                      ) : null}
                      {line.is_vice_captain ? (
                        <span className="rounded bg-amber-500 px-1 py-px text-[9px] font-bold text-zinc-900">
                          VC
                        </span>
                      ) : null}
                      {line.missing_stats ? (
                        <span className="text-muted-foreground text-[9px]">No SM id</span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="text-muted-foreground px-1 py-2 text-right align-top tabular-nums">
                  {line.perf_points.toFixed(1)}
                </td>
                <td className="text-muted-foreground px-1 py-2 text-right align-top tabular-nums">
                  {line.xi_bonus > 0 ? `+${line.xi_bonus}` : "0"}
                </td>
                <td className="px-2 py-2 pr-3 text-right align-top font-semibold tabular-nums text-foreground">
                  {line.points.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-[11px] leading-snug">
        Total includes captain (2×) or vice-captain (1.5×) on{" "}
        <span className="text-foreground/90">performance + starting XI</span> for that player.
      </p>
    </div>
  );
}
