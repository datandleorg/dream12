"use client";

import { Fragment, useMemo } from "react";
import type { ContestTeamsCompareResult } from "@/app/actions/contest-teams-compare";
import type { TeamBreakdownLine } from "@/lib/live-scoring";
import type { BuilderPlayer } from "@/stores/team-builder";
import { cn } from "@/lib/utils";

type CompareOk = Extract<ContestTeamsCompareResult, { ok: true }>;

function sortLinesByPoints(lines: TeamBreakdownLine[]): TeamBreakdownLine[] {
  return [...lines].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return a.player_name.localeCompare(b.player_name, undefined, { sensitivity: "base" });
  });
}

function selectionPctMap(players: BuilderPlayer[]): Map<string, number | null | undefined> {
  const m = new Map<string, number | null | undefined>();
  for (const p of players) {
    m.set(String(p.id), p.selection_pct);
  }
  return m;
}

function contributionShare(points: number, teamTotal: number): number {
  if (!Number.isFinite(teamTotal) || teamTotal <= 0) return 0;
  return Math.min(1, Math.max(0, points / teamTotal));
}

function ContributionBar({
  fraction,
  align = "left",
}: {
  fraction: number;
  align?: "left" | "right";
}) {
  const widthPct = Math.min(100, Math.max(0, fraction * 100));
  const fillClass =
    "h-full rounded-full bg-gradient-to-r from-primary/50 to-primary/85 dark:from-primary/40 dark:to-primary/70";

  return (
    <div
      className={cn(
        "mt-1.5 h-2 w-full max-w-[9rem] overflow-hidden rounded-full bg-muted/90 ring-1 ring-border/40",
        align === "left" && "relative",
        align === "right" && "ml-auto",
      )}
      title={`${widthPct.toFixed(1)}% of this team total`}
    >
      {align === "left" ? (
        <div
          className={cn(fillClass, "absolute top-0 right-0")}
          style={{ width: `${widthPct}%` }}
        />
      ) : (
        <div className={fillClass} style={{ width: `${widthPct}%` }} />
      )}
    </div>
  );
}

function CaptainViceBadges({
  isCaptain,
  isViceCaptain,
  className,
}: {
  isCaptain: boolean;
  isViceCaptain: boolean;
  className?: string;
}) {
  if (!isCaptain && !isViceCaptain) return null;
  return (
    <div className={cn("flex flex-wrap gap-0.5", className)}>
      {isCaptain ? (
        <span className="rounded bg-red-600 px-1 py-px text-[8px] font-bold uppercase text-white">
          C
        </span>
      ) : null}
      {isViceCaptain ? (
        <span className="rounded bg-amber-500 px-1 py-px text-[8px] font-bold uppercase text-zinc-900">
          VC
        </span>
      ) : null}
    </div>
  );
}

function PlayerCell({
  line,
  teamTotal,
  pctByPlayerId,
  align,
}: {
  line: TeamBreakdownLine;
  teamTotal: number;
  pctByPlayerId: Map<string, number | null | undefined>;
  align: "left" | "right";
}) {
  const pct = pctByPlayerId.get(String(line.player_id));
  const share = contributionShare(line.points, teamTotal);
  return (
    <div className={cn("min-w-0 px-1", align === "right" && "text-right")}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1",
          align === "right" && "flex-row-reverse justify-start",
        )}
      >
        <p
          className={cn(
            "truncate text-sm font-semibold leading-snug",
            align === "right" && "text-right",
          )}
          title={line.player_name}
        >
          {line.player_name}
        </p>
        <CaptainViceBadges
          isCaptain={line.is_captain}
          isViceCaptain={line.is_vice_captain}
          className={cn(align === "right" && "flex-row-reverse")}
        />
      </div>
      <p
        className={cn(
          "text-muted-foreground mt-0.5 text-[10px]",
          align === "right" && "text-right",
        )}
      >
        {line.team_label} · {line.role}
      </p>
      {typeof pct === "number" && Number.isFinite(pct) ? (
        <p
          className={cn(
            "mt-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400/90",
            align === "right" && "text-right",
          )}
        >
          {pct.toFixed(1)}% picked
        </p>
      ) : null}
      <ContributionBar fraction={share} align={align} />
    </div>
  );
}

function EmptyPlayerCell({ align }: { align: "left" | "right" }) {
  return (
    <div
      className={cn(
        "text-muted-foreground min-h-[4.5rem] px-1 text-xs italic opacity-50",
        align === "left" ? "text-left" : "text-right",
      )}
    >
      —
    </div>
  );
}

function buildCompareLists(
  viewerLines: TeamBreakdownLine[],
  opponentLines: TeamBreakdownLine[],
  commonPlayerIds: Set<string>,
) {
  const viewerCommon = sortLinesByPoints(
    viewerLines.filter((l) => commonPlayerIds.has(String(l.player_id))),
  );
  const viewerOnly = sortLinesByPoints(
    viewerLines.filter((l) => !commonPlayerIds.has(String(l.player_id))),
  );
  const oppById = new Map(opponentLines.map((l) => [String(l.player_id), l]));
  const opponentCommon = viewerCommon
    .map((vl) => oppById.get(String(vl.player_id)))
    .filter((x): x is TeamBreakdownLine => x != null);
  const opponentOnly = sortLinesByPoints(
    opponentLines.filter((l) => !commonPlayerIds.has(String(l.player_id))),
  );
  return { viewerCommon, opponentCommon, viewerOnly, opponentOnly };
}

export function ContestTeamCompareView({
  data,
  opponentDisplayName,
}: {
  data: CompareOk;
  opponentDisplayName: string;
}) {
  const v = data.viewer;
  const o = data.opponent;
  const viewerTotal = v.computedTotal;
  const opponentTotal = o.computedTotal;

  const commonPlayerIds = useMemo(
    () => new Set(data.common.map((c) => String(c.player_id))),
    [data.common],
  );

  const { viewerCommon, opponentCommon, viewerOnly, opponentOnly } = useMemo(
    () => buildCompareLists(v.lines, o.lines, commonPlayerIds),
    [v.lines, o.lines, commonPlayerIds],
  );

  const viewerPct = useMemo(() => selectionPctMap(v.pitch.selected), [v.pitch.selected]);
  const oppPct = useMemo(() => selectionPctMap(o.pitch.selected), [o.pitch.selected]);

  const diffRows = Math.max(viewerOnly.length, opponentOnly.length);

  const diff = viewerTotal - opponentTotal;

  return (
    <div className="space-y-3">
      {!v.statsAvailable && !o.statsAvailable ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border border-dashed px-3 py-2 text-xs">
          Live stats are still syncing. Points show starting XI bonus and performance where data exists.
        </p>
      ) : null}

      <p className="text-muted-foreground text-center text-sm tabular-nums">
        <span className="font-semibold text-foreground">You {viewerTotal.toFixed(1)}</span>
        <span className="mx-1.5">·</span>
        <span className="font-semibold text-foreground">
          {opponentDisplayName} {opponentTotal.toFixed(1)}
        </span>
        <span className="mx-1.5 text-muted-foreground/80">·</span>
        <span
          className={cn(
            "font-semibold",
            diff > 0.05 && "text-emerald-600 dark:text-emerald-400",
            diff < -0.05 && "text-red-600 dark:text-red-400",
          )}
        >
          Δ {diff > 0 ? "+" : ""}
          {diff.toFixed(1)}
        </span>
      </p>

      <div>
        <h3 className="text-muted-foreground mb-2 px-0.5 text-[11px] font-bold tracking-wide uppercase">
          Side-by-side XI
        </h3>
        <div className="max-h-[min(60vh,32rem)] min-h-[16rem] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/15">
          <div className="bg-muted/80 sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1 border-b border-border/50 px-2 py-2 text-center backdrop-blur-sm supports-[backdrop-filter]:bg-muted/70 sm:gap-2 sm:px-3">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              You
            </p>
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              Points
            </p>
            <p className="truncate text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              {opponentDisplayName.length > 18
                ? `${opponentDisplayName.slice(0, 17)}…`
                : opponentDisplayName}
            </p>
          </div>

          <div className="px-1 pb-2 sm:px-2">
            {viewerCommon.length > 0 ? (
              <Fragment>
                <p className="text-muted-foreground mt-2 mb-1 px-1 text-[10px] font-bold tracking-wide uppercase">
                  Common
                </p>
                <ul className="divide-border/50 divide-y rounded-lg border border-border/40 bg-card/40">
                  {viewerCommon.map((vl, i) => {
                    const ol = opponentCommon[i];
                    if (!ol) return null;
                    const samePts = Math.abs(vl.points - ol.points) < 0.05;
                    return (
                      <li
                        key={vl.player_id}
                        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1 py-3 sm:gap-2 sm:py-3.5"
                      >
                        <PlayerCell
                          line={vl}
                          teamTotal={viewerTotal}
                          pctByPlayerId={viewerPct}
                          align="left"
                        />
                        <div className="flex min-w-[5rem] flex-col items-center justify-center self-center px-0.5 text-center sm:min-w-[6rem]">
                          {samePts ? (
                            <p className="text-lg font-bold tabular-nums tracking-tight sm:text-xl">
                              {vl.points.toFixed(1)}
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 text-base font-bold tabular-nums sm:text-lg">
                                <span>{vl.points.toFixed(1)}</span>
                                <span className="text-muted-foreground text-xs font-normal">|</span>
                                <span>{ol.points.toFixed(1)}</span>
                              </div>
                              <p className="text-muted-foreground mt-0.5 text-[9px] font-medium uppercase">
                                you · them
                              </p>
                            </>
                          )}
                        </div>
                        <PlayerCell
                          line={ol}
                          teamTotal={opponentTotal}
                          pctByPlayerId={oppPct}
                          align="right"
                        />
                      </li>
                    );
                  })}
                </ul>
              </Fragment>
            ) : null}

            {diffRows > 0 ? (
              <Fragment>
                <p className="text-muted-foreground mt-4 mb-1 px-1 text-[10px] font-bold tracking-wide uppercase">
                  Differential
                </p>
                <ul className="divide-border/50 divide-y rounded-lg border border-border/40 bg-card/40">
                  {Array.from({ length: diffRows }, (_, i) => {
                    const left = viewerOnly[i];
                    const right = opponentOnly[i];
                    const leftPts = left?.points;
                    const rightPts = right?.points;
                    return (
                      <li
                        key={`diff-${i}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1 py-3 sm:gap-2 sm:py-3.5"
                      >
                        <div className="min-w-0">
                          {left ? (
                            <PlayerCell
                              line={left}
                              teamTotal={viewerTotal}
                              pctByPlayerId={viewerPct}
                              align="left"
                            />
                          ) : (
                            <EmptyPlayerCell align="left" />
                          )}
                        </div>
                        <div className="flex min-w-[5rem] flex-col items-center justify-center self-center gap-0.5 px-0.5 text-center sm:min-w-[6rem]">
                          <div className="flex items-center gap-1.5 text-base font-bold tabular-nums sm:text-lg">
                            <span className="min-w-[2.25rem] text-right">
                              {leftPts != null ? leftPts.toFixed(1) : "—"}
                            </span>
                            <span className="text-muted-foreground text-xs font-normal">|</span>
                            <span className="min-w-[2.25rem] text-left">
                              {rightPts != null ? rightPts.toFixed(1) : "—"}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[9px] font-medium uppercase">
                            you · them
                          </p>
                        </div>
                        <div className="min-w-0">
                          {right ? (
                            <PlayerCell
                              line={right}
                              teamTotal={opponentTotal}
                              pctByPlayerId={oppPct}
                              align="right"
                            />
                          ) : (
                            <EmptyPlayerCell align="right" />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Fragment>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
