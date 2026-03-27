"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LiveSnapshot } from "@/lib/sportmonks/normalize-live-snapshot";
import { cn } from "@/lib/utils";

function ScoreTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (!rows.length) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">{empty}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border border-b text-xs text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="pb-2 pr-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-border/60 border-b last:border-0">
              {cells.map((c, j) => (
                <td key={j} className="py-2 pr-2 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  const battingHeaders = ["Batter", "R", "B", "4s", "6s", "SR"];
  const battingRows =
    snapshot.battingRows?.map((r) => [
      r.name,
      r.runs,
      r.balls ?? "—",
      r.fours ?? "—",
      r.sixes ?? "—",
      r.strikeRate ?? "—",
    ]) ?? [];

  const bowlingHeaders = ["Bowler", "O", "M", "R", "W", "Econ"];
  const bowlingRows =
    snapshot.bowlingRows?.map((r) => [
      r.name,
      r.overs,
      r.maidens ?? "—",
      r.runs,
      r.wickets,
      r.economy ?? "—",
    ]) ?? [];

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
              Updated {new Date(snapshot.updatedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="scorecard">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Batting</CardTitle>
            </CardHeader>
            <CardContent>
              <ScoreTable
                headers={battingHeaders}
                rows={battingRows}
                empty="No batting rows in snapshot yet."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bowling</CardTitle>
            </CardHeader>
            <CardContent>
              <ScoreTable
                headers={bowlingHeaders}
                rows={bowlingRows}
                empty="No bowling rows in snapshot yet."
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
