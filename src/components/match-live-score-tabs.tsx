"use client";

import { useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildInningsCardsFromScoreboardRaw,
  completedTeamScoreLines,
  formatMatchResultSummary,
  isSnapshotShortLinePlaceholder,
  type LiveBattingRow,
  type LiveBowlingRow,
  type LiveInningsCard,
  type LiveSnapshot,
} from "@/lib/sportmonks/normalize-live-snapshot";
import { cn } from "@/lib/utils";

/** Locale-free so server and client HTML match (avoids hydration errors). */
function formatSnapshotUpdatedAt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return `${new Date(t).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function isNotOutBattingRow(row: LiveBattingRow): boolean {
  const d = row.dismissal;
  if (d == null) return true;
  const t = String(d).trim();
  if (t.length === 0) return true;
  return t.toLowerCase() === "not out";
}

function shouldShowDismissalSubline(row: LiveBattingRow): boolean {
  const d = row.dismissal;
  if (d == null) return false;
  const t = String(d).trim();
  if (t.length === 0) return false;
  return t.toLowerCase() !== "not out";
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
                <div className="text-primary font-medium">
                  <span>{r.name}</span>
                  {isNotOutBattingRow(r) ? (
                    <span
                      className="ml-0.5 font-semibold text-foreground"
                      aria-label="Not out"
                      title="Not out"
                    >
                      *
                    </span>
                  ) : null}
                </div>
                {shouldShowDismissalSubline(r) ? (
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

function InningsScorecardBlock({
  card,
  compact,
  showDetailTables = true,
}: {
  card: LiveInningsCard;
  compact?: boolean;
  /** When false, only the team total strip (no batting/bowling tables). */
  showDetailTables?: boolean;
}) {
  const header = (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md text-white shadow-sm",
        "bg-emerald-800",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
      )}
    >
      <span
        className={cn(
          "font-bold tracking-tight",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {card.battingTeamName}
      </span>
      <span
        className={cn(
          "font-mono font-semibold tabular-nums",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {card.headerLine.replace(`${card.battingTeamName} `, "")}
      </span>
    </div>
  );

  if (!showDetailTables) {
    return header;
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {header}
      <div>
        <p
          className={cn(
            "text-muted-foreground font-semibold uppercase tracking-wide",
            compact ? "mb-1.5 text-[10px]" : "mb-2 text-xs",
          )}
        >
          Batting
        </p>
        <BattingScoreTable rows={card.battingRows} empty="No batting rows for this innings." />
      </div>
      <div>
        <p
          className={cn(
            "text-muted-foreground font-semibold uppercase tracking-wide",
            compact ? "mb-1.5 text-[10px]" : "mb-2 text-xs",
          )}
        >
          Bowling
        </p>
        <BowlingScoreTable rows={card.bowlingRows} empty="No bowling rows for this innings." />
      </div>
    </div>
  );
}

function SnapshotScoreSummaryBody({
  snapshot,
  compact,
  isCompleted = false,
}: {
  snapshot: LiveSnapshot;
  compact?: boolean;
  /** Per-team scores + optional winner line; no duplicate totals-only line. */
  isCompleted?: boolean;
}) {
  const resultLine = isCompleted ? formatMatchResultSummary(snapshot) : null;
  const teamLines = isCompleted ? completedTeamScoreLines(snapshot) : [];
  const hasShort = !isSnapshotShortLinePlaceholder(snapshot);

  return (
    <div className={cn("space-y-3", compact ? "text-xs" : "text-sm")}>
      {isCompleted ? (
        <>
          {teamLines.length > 0 ? (
            <ul
              className={cn(
                "text-foreground space-y-1 font-medium tabular-nums [&>li]:list-none",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {teamLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : hasShort ? (
            <p className="font-medium tabular-nums">{snapshot.shortLine}</p>
          ) : null}
          {resultLine ? (
            <p
              className={cn(
                "font-semibold text-foreground",
                compact ? "text-sm" : "text-base",
              )}
            >
              {resultLine}
            </p>
          ) : null}
        </>
      ) : hasShort ? (
        <p className="font-medium tabular-nums">{snapshot.shortLine}</p>
      ) : snapshot.teamScores?.length ? (
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
    </div>
  );
}

/**
 * `full`: batting/bowling tables (live / in-progress).
 * `short`: innings total strips and/or summary lines only (completed matches).
 */
export function MatchSnapshotScorecardContent({
  snapshot,
  className,
  compact = false,
  variant = "full",
}: {
  snapshot: LiveSnapshot;
  className?: string;
  compact?: boolean;
  variant?: "full" | "short";
}) {
  const useInningsCards =
    Array.isArray(snapshot.inningsCards) && snapshot.inningsCards.length > 0;

  const denseTables = cn(
    compact &&
      "[&_table]:text-[11px] [&_th]:px-1 [&_th]:py-1.5 [&_th]:text-[10px] [&_td]:px-1 [&_td]:py-1.5",
  );

  if (variant === "short") {
    return (
      <div className={cn(className)}>
        <Card className={cn(compact && "border-border/80 shadow-none")}>
          <CardContent className={cn(compact ? "px-3 pb-3 pt-3" : "pt-6")}>
            <SnapshotScoreSummaryBody snapshot={snapshot} compact={compact} isCompleted />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3", className)}>
      {useInningsCards ? (
        snapshot.inningsCards!.map((card, idx) => (
          <Card
            key={card.scoreboardKey ?? `${card.battingTeamId ?? "x"}-${idx}`}
            className={cn(compact && "border-border/80 shadow-none")}
          >
            <CardContent className={cn(compact ? "px-3 pb-3 pt-3" : "pt-6")}>
              <div className={denseTables}>
                <InningsScorecardBlock card={card} compact={compact} />
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <div className={denseTables}>
          <Card className={cn(compact ? "border-border/80 shadow-none" : "border-border/80 mb-3 shadow-none")}>
            <CardHeader className={cn(compact ? "pb-1.5 pt-3" : "pb-2")}>
              <CardTitle className={cn(compact ? "text-sm" : "text-base")}>
                Batting
              </CardTitle>
            </CardHeader>
            <CardContent className={cn(compact && "px-3 pb-3")}>
              <BattingScoreTable
                rows={snapshot.battingRows ?? []}
                empty="No batting rows in snapshot yet."
              />
            </CardContent>
          </Card>
          <Card className={cn(compact && "border-border/80 shadow-none")}>
            <CardHeader className={cn(compact ? "pb-1.5 pt-3" : "pb-2")}>
              <CardTitle className={cn(compact ? "text-sm" : "text-base")}>
                Bowling
              </CardTitle>
            </CardHeader>
            <CardContent className={cn(compact && "px-3 pb-3")}>
              <BowlingScoreTable
                rows={snapshot.bowlingRows ?? []}
                empty="No bowling rows in snapshot yet."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function MatchLiveScoreTabs({
  snapshot,
  fixtureScoreboardRaw,
  className,
  isCompleted = false,
  tossSummary,
}: {
  snapshot: LiveSnapshot;
  /** Authoritative batting/bowling trees from DB; when present, scorecard uses them for dismissal detail. */
  fixtureScoreboardRaw?: unknown;
  className?: string;
  /** Affects summary copy only; full scorecard still shown below. */
  isCompleted?: boolean;
  /** Toss / batting first; shown at the top when provided. */
  tossSummary?: ReactNode;
}) {
  const rawJson =
    fixtureScoreboardRaw != null && typeof fixtureScoreboardRaw === "object"
      ? JSON.stringify(fixtureScoreboardRaw)
      : String(fixtureScoreboardRaw ?? "");

  const scorecardSnapshot = useMemo((): LiveSnapshot => {
    const cards = buildInningsCardsFromScoreboardRaw(fixtureScoreboardRaw);
    if (cards.length > 0) {
      return { ...snapshot, inningsCards: cards };
    }
    return snapshot;
  }, [snapshot, rawJson]);

  return (
    <div className={cn("w-full space-y-4", className)}>
      {tossSummary ? <div>{tossSummary}</div> : null}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Match summary</CardTitle>
        </CardHeader>
        <CardContent>
          <SnapshotScoreSummaryBody snapshot={snapshot} isCompleted={isCompleted} />
        </CardContent>
      </Card>
      <div className="space-y-3">
        <p className="text-muted-foreground px-0.5 text-xs font-semibold uppercase tracking-wide">
          Scorecard
        </p>
        <MatchSnapshotScorecardContent snapshot={scorecardSnapshot} className="space-y-6" />
      </div>
    </div>
  );
}
