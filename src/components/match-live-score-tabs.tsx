"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  LiveBattingRow,
  LiveBowlingRow,
  LiveInningsCard,
  LiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";
import { cn } from "@/lib/utils";

/** Locale-free so server and client HTML match (avoids hydration errors). */
function formatSnapshotUpdatedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return `${new Date(t).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function BattingScoreTable({ rows, empty }: { rows: LiveBattingRow[]; empty: string }) {
  if (!rows.length) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">{empty}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-muted/80 border-border border-b text-xs font-semibold text-foreground">
            <th className="px-2 py-2 pr-3">Batter</th>
            <th className="px-1 py-2 text-right font-medium">R</th>
            <th className="px-1 py-2 text-right font-medium">B</th>
            <th className="px-1 py-2 text-right font-medium">4s</th>
            <th className="px-1 py-2 text-right font-medium">6s</th>
            <th className="pl-1 py-2 pr-2 text-right font-medium">SR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={cn(
                "border-border/60 border-b last:border-0",
                i % 2 === 1 && "bg-muted/25",
              )}
            >
              <td className="max-w-[min(220px,45vw)] py-2 pr-3">
                <div className="text-primary font-medium">{r.name}</div>
                {r.dismissal ? (
                  <div className="text-muted-foreground mt-0.5 text-xs leading-snug">
                    {r.dismissal}
                  </div>
                ) : null}
              </td>
              <td className="px-1 py-2 text-right font-semibold tabular-nums">{r.runs}</td>
              <td className="text-muted-foreground px-1 py-2 text-right tabular-nums">
                {r.balls ?? "—"}
              </td>
              <td className="text-muted-foreground px-1 py-2 text-right tabular-nums">
                {r.fours ?? "—"}
              </td>
              <td className="text-muted-foreground px-1 py-2 text-right tabular-nums">
                {r.sixes ?? "—"}
              </td>
              <td className="text-muted-foreground py-2 pl-1 pr-2 text-right tabular-nums">
                {r.strikeRate ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BowlingScoreTable({ rows, empty }: { rows: LiveBowlingRow[]; empty: string }) {
  if (!rows.length) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">{empty}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-muted/80 border-border border-b text-xs font-semibold text-foreground">
            <th className="px-2 py-2 pr-2">Bowler</th>
            <th className="px-1 py-2 text-right font-medium">O</th>
            <th className="px-1 py-2 text-right font-medium">M</th>
            <th className="px-1 py-2 text-right font-medium">R</th>
            <th className="px-1 py-2 text-right font-medium">W</th>
            <th className="px-1 py-2 text-right font-medium">NB</th>
            <th className="px-1 py-2 text-right font-medium">WD</th>
            <th className="pl-1 py-2 pr-2 text-right font-medium">Econ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={cn(
                "border-border/60 border-b last:border-0",
                i % 2 === 1 && "bg-muted/25",
              )}
            >
              <td className="text-primary py-2 pr-2 font-medium">{r.name}</td>
              <td className="px-1 py-2 text-right tabular-nums">{r.overs}</td>
              <td className="text-muted-foreground px-1 py-2 text-right tabular-nums">
                {r.maidens ?? "—"}
              </td>
              <td className="px-1 py-2 text-right tabular-nums">{r.runs}</td>
              <td className="px-1 py-2 text-right font-medium tabular-nums">{r.wickets}</td>
              <td className="text-muted-foreground px-1 py-2 text-right tabular-nums">
                {r.noballs ?? "—"}
              </td>
              <td className="text-muted-foreground px-1 py-2 text-right tabular-nums">
                {r.wides ?? "—"}
              </td>
              <td className="text-muted-foreground py-2 pl-1 pr-2 text-right tabular-nums">
                {r.economy ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InningsScorecardBlock({ card }: { card: LiveInningsCard }) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2.5",
          "bg-emerald-800 text-white shadow-sm",
        )}
      >
        <span className="text-sm font-bold tracking-tight">{card.battingTeamName}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {card.headerLine.replace(`${card.battingTeamName} `, "")}
        </span>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
          Batting
        </p>
        <BattingScoreTable rows={card.battingRows} empty="No batting rows for this innings." />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
          Bowling
        </p>
        <BowlingScoreTable rows={card.bowlingRows} empty="No bowling rows for this innings." />
      </div>
    </div>
  );
}

export function MatchLiveScoreTabs({
  snapshot,
  className,
}: {
  snapshot: LiveSnapshot;
  className?: string;
}) {
  const useInningsCards =
    Array.isArray(snapshot.inningsCards) && snapshot.inningsCards.length > 0;

  return (
    <Tabs defaultValue="summary" className={cn("w-full", className)}>
      <TabsList variant="line" className="mb-3 w-full justify-start gap-1">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
      </TabsList>
      <TabsContent value="summary">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Match summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium tabular-nums">{snapshot.shortLine}</p>
            {snapshot.teamScores?.length ? (
              <ul className="text-muted-foreground space-y-1">
                {snapshot.teamScores.map((t, i) => (
                  <li key={i}>
                    {t.teamLabel}: {t.runs}/{t.wickets ?? "—"} ({t.overs ?? "—"} ov)
                  </li>
                ))}
              </ul>
            ) : null}
            {snapshot.summaryNote ? (
              <p className="text-muted-foreground text-xs">{snapshot.summaryNote}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Updated {formatSnapshotUpdatedAt(snapshot.updatedAt)}
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="scorecard">
        <div className="space-y-6">
          {useInningsCards ? (
            snapshot.inningsCards!.map((card, idx) => (
              <Card key={card.scoreboardKey ?? `${card.battingTeamId ?? "x"}-${idx}`}>
                <CardContent className="pt-6">
                  <InningsScorecardBlock card={card} />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Batting</CardTitle>
                </CardHeader>
                <CardContent>
                  <BattingScoreTable
                    rows={snapshot.battingRows ?? []}
                    empty="No batting rows in snapshot yet."
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Bowling</CardTitle>
                </CardHeader>
                <CardContent>
                  <BowlingScoreTable
                    rows={snapshot.bowlingRows ?? []}
                    empty="No bowling rows in snapshot yet."
                  />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
