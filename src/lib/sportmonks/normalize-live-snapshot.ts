/**
 * Build a compact UI snapshot from SportMonks Cricket fixture / livescore payloads.
 * Handles nested `data` wrappers, `localteam_dl_data` / `visitorteam_dl_data`, `runs` arrays,
 * and optional `batting` / `bowling` relationship shapes.
 * Batting: reads balls from `balls_faced` / `balls` / `ball` / `b`, fours/sixes from plural or singular keys;
 * if balls missing but `rate`/`strike_rate` + runs exist, infers balls for display (SR = runs/balls×100).
 */

export type LiveTeamScore = {
  teamLabel: string;
  runs: number;
  wickets: number | null;
  overs: string | null;
};

export type LiveBattingRow = {
  name: string;
  runs: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  strikeRate?: string;
  dismissal?: string | null;
};

export type LiveBowlingRow = {
  name: string;
  overs: string;
  maidens?: number;
  runs: number;
  wickets: number;
  economy?: string;
  wides?: number;
  noballs?: number;
};

/** One innings side: batting team header + their batting rows + opposition bowling. */
export type LiveInningsCard = {
  scoreboardKey?: string;
  battingTeamId?: number;
  battingTeamName: string;
  /** e.g. "Sunrisers Hyderabad 201/9 (20 ov)" */
  headerLine: string;
  battingRows: LiveBattingRow[];
  bowlingRows: LiveBowlingRow[];
};

export type LiveSnapshot = {
  shortLine: string;
  teamScores?: LiveTeamScore[];
  battingRows?: LiveBattingRow[];
  bowlingRows?: LiveBowlingRow[];
  /** When present (e.g. SportMonks `scoreboard` S1/S2), UI should show one scorecard block per entry. */
  inningsCards?: LiveInningsCard[];
  /** Human note when score data is thin */
  summaryNote?: string;
  updatedAt: string;
};

function unwrapData<T extends Record<string, unknown>>(node: unknown): T | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as T;
  }
  return o as T;
}

function abbrevLabel(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 4).toUpperCase();
  return parts
    .slice(0, 3)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function readTeamName(team: unknown): string {
  const u = unwrapData<Record<string, unknown>>(team);
  if (!u) return "?";
  const n = u.name;
  return typeof n === "string" && n.trim() ? n.trim() : "?";
}

type DlData = {
  score?: number | null;
  overs?: string | number | null;
  wickets_out?: number | null;
};

function readDlData(raw: unknown): DlData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    score: o.score != null ? Number(o.score) : null,
    overs: o.overs != null ? String(o.overs) : null,
    wickets_out: o.wickets_out != null ? Number(o.wickets_out) : null,
  };
}

function formatOvers(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v.trim() || null;
  return null;
}

/** Flatten nested relationship arrays (batting/bowling may be { data: [...] } or [...]). */
function asObjectArray(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  const u = unwrapData<Record<string, unknown>>(raw);
  if (u && Array.isArray(u.data)) {
    return (u.data as unknown[]).filter(
      (x) => x && typeof x === "object",
    ) as Record<string, unknown>[];
  }
  return [];
}

function nameFromPlayerLikeObject(po: Record<string, unknown>): string | null {
  const fn = po.firstname;
  const ln = po.lastname;
  const full = po.fullname ?? po.name;
  if (typeof full === "string" && full.trim()) return full.trim();
  const a =
    typeof fn === "string" && typeof ln === "string"
      ? `${fn} ${ln}`.trim()
      : typeof fn === "string"
        ? fn
        : typeof ln === "string"
          ? ln
          : null;
  return a;
}

/**
 * SportMonks v2 often omits nested player on batting/bowling rows; `balls[].batsman` / `bowler` carry names.
 */
export function buildPlayerIdNameMapFromBalls(
  fixture: Record<string, unknown>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const item of asObjectArray(fixture.balls)) {
    const row = unwrapData<Record<string, unknown>>(item) ?? item;
    for (const key of ["batsman", "bowler"] as const) {
      const raw = row[key];
      if (!raw || typeof raw !== "object") continue;
      const u =
        unwrapData<Record<string, unknown>>(raw) ?? (raw as Record<string, unknown>);
      const idRaw = u.id;
      const numId =
        typeof idRaw === "number"
          ? idRaw
          : typeof idRaw === "string" && /^\d+$/.test(idRaw)
            ? Number(idRaw)
            : NaN;
      if (!Number.isFinite(numId)) continue;
      const name = nameFromPlayerLikeObject(u);
      if (name && !map.has(numId)) map.set(numId, name);
    }
  }
  return map;
}

function playerNameFromRow(
  row: Record<string, unknown>,
  idNameMap?: Map<number, string>,
): string {
  const pidRaw = row.player_id;
  const pidNum =
    pidRaw != null && typeof pidRaw !== "object"
      ? Number(pidRaw)
      : NaN;
  if (Number.isFinite(pidNum) && idNameMap?.has(pidNum)) {
    return idNameMap.get(pidNum)!;
  }

  const bRaw = row.batsman;
  if (bRaw && typeof bRaw === "object") {
    const b =
      unwrapData<Record<string, unknown>>(bRaw) ?? (bRaw as Record<string, unknown>);
    const fromB = nameFromPlayerLikeObject(b);
    if (fromB) return fromB;
  }

  const pRaw = row.player;
  const p =
    pRaw && typeof pRaw === "object"
      ? unwrapData<Record<string, unknown>>(pRaw) ?? (pRaw as Record<string, unknown>)
      : null;
  if (p) {
    const fromP = nameFromPlayerLikeObject(p);
    if (fromP) return fromP;
  }

  if (pidRaw != null) return `Player ${pidRaw}`;
  return "—";
}

/** First numeric hit among keys (SportMonks uses `ball` / `four` / `six` on some payloads). */
function firstNumeric(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function mapBattingRowFromRecord(
  row: Record<string, unknown>,
  idNameMap?: Map<number, string>,
): LiveBattingRow {
  const runs = Number(row.runs ?? row.score ?? 0);
  let balls = firstNumeric(row, ["balls_faced", "balls", "ball", "b"]);
  const fours = firstNumeric(row, ["fours", "four", "four_x"]);
  const sixes = firstNumeric(row, ["sixes", "six", "six_x"]);
  const sr =
    row.rate != null ? String(row.rate) : row.strike_rate != null ? String(row.strike_rate) : undefined;
  const dismissal =
    typeof row.how_out === "string"
      ? row.how_out
      : typeof row.dismissal === "string"
        ? row.dismissal
        : null;

  if (!Number.isFinite(balls) && runs > 0 && sr != null) {
    const srNum = Number.parseFloat(sr);
    if (Number.isFinite(srNum) && srNum > 0) {
      const inferred = Math.max(1, Math.round((runs / srNum) * 100));
      balls = inferred;
    }
  }

  return {
    name: playerNameFromRow(row, idNameMap),
    runs,
    balls: balls != null && Number.isFinite(balls) ? balls : undefined,
    fours: fours != null && Number.isFinite(fours) ? fours : undefined,
    sixes: sixes != null && Number.isFinite(sixes) ? sixes : undefined,
    strikeRate: sr,
    dismissal,
  };
}

function buildBattingRows(
  raw: unknown,
  idNameMap?: Map<number, string>,
): LiveBattingRow[] {
  const rows = asObjectArray(raw);
  const out: LiveBattingRow[] = [];
  for (const r of rows) {
    const row = unwrapData<Record<string, unknown>>(r) ?? r;
    out.push(mapBattingRowFromRecord(row, idNameMap));
  }
  return out.slice(0, 30);
}

function mapBowlingRowFromRecord(
  row: Record<string, unknown>,
  idNameMap?: Map<number, string>,
): LiveBowlingRow {
  const overs = formatOvers(row.overs) ?? "0";
  const maidensRaw =
    row.maidens != null
      ? Number(row.maidens)
      : row.medians != null
        ? Number(row.medians)
        : undefined;
  const runs = Number(row.runs_conceded ?? row.conceded ?? row.runs ?? 0);
  const wickets = Number(row.wickets ?? row.wicket ?? 0);
  const econ =
    row.econ_rate != null
      ? String(row.econ_rate)
      : row.economy != null
        ? String(row.economy)
        : row.rate != null
          ? String(row.rate)
          : undefined;
  const wides = firstNumeric(row, ["wides", "wide"]);
  const noballs = firstNumeric(row, ["noballs", "noball", "no_balls"]);
  return {
    name: playerNameFromRow(row, idNameMap),
    overs,
    maidens:
      maidensRaw != null && Number.isFinite(maidensRaw) ? maidensRaw : undefined,
    runs,
    wickets,
    economy: econ,
    wides: wides != null && Number.isFinite(wides) ? wides : undefined,
    noballs: noballs != null && Number.isFinite(noballs) ? noballs : undefined,
  };
}

function buildBowlingRows(
  raw: unknown,
  idNameMap?: Map<number, string>,
): LiveBowlingRow[] {
  const rows = asObjectArray(raw);
  const out: LiveBowlingRow[] = [];
  for (const r of rows) {
    const row = unwrapData<Record<string, unknown>>(r) ?? r;
    out.push(mapBowlingRowFromRecord(row, idNameMap));
  }
  return out.slice(0, 30);
}

function scoreboardSortOrder(key: string): number {
  const m = /^S(\d+)$/i.exec(key.trim());
  if (m) return Number(m[1]);
  return 500 + key.charCodeAt(0);
}

type TeamInningsTotal = { runs: number; wk: number | null; overs: string | null };

function lookupTeamInningsTotal(
  fixture: Record<string, unknown>,
  batTid: number,
  scoreboardKey?: string,
): TeamInningsTotal | null {
  const raw = fixture.runs;
  if (!Array.isArray(raw) || !Number.isFinite(batTid)) return null;
  const wantInn = /^S(\d+)$/i.exec(scoreboardKey?.trim() ?? "")?.[1];
  const wantInnNum = wantInn != null ? Number(wantInn) : null;

  const pick = (requireInnMatch: boolean): TeamInningsTotal | null => {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const tid = Number(o.team_id);
      if (tid !== batTid) continue;
      if (
        requireInnMatch &&
        wantInnNum != null &&
        o.inning != null &&
        Number(o.inning) !== wantInnNum
      ) {
        continue;
      }
      const runs = Number(o.score ?? o.total ?? o.runs ?? 0);
      const wk =
        o.wickets != null
          ? Number(o.wickets)
          : o.wickets_out != null
            ? Number(o.wickets_out)
            : null;
      return {
        runs: Number.isFinite(runs) ? runs : 0,
        wk: wk != null && Number.isFinite(wk) ? wk : null,
        overs: formatOvers(o.overs),
      };
    }
    return null;
  };

  const strict = pick(true);
  if (strict) return strict;
  return pick(false);
}

function formatInningsHeaderLine(teamName: string, t: TeamInningsTotal | null): string {
  const w = t?.wk != null && Number.isFinite(t.wk) ? `${t.wk}` : "—";
  const o = t?.overs ?? "—";
  const r = t?.runs ?? 0;
  return `${teamName} ${r}/${w} (${o} ov)`;
}

function unwrapBatBowlRow(r: Record<string, unknown>): Record<string, unknown> {
  return unwrapData<Record<string, unknown>>(r) ?? r;
}

function buildInningsCards(
  fixture: Record<string, unknown>,
  idNameMap: Map<number, string>,
  localName: string,
  visitorName: string,
  localId?: number,
  visitorId?: number,
): LiveInningsCard[] {
  const allBat = asObjectArray(fixture.batting).map(unwrapBatBowlRow);
  const allBowl = asObjectArray(fixture.bowling).map(unwrapBatBowlRow);
  if (!allBat.length && !allBowl.length) return [];

  const resolveTeamName = (tid: number | undefined): string => {
    if (tid == null || !Number.isFinite(tid)) return "Team";
    if (localId != null && tid === localId) return localName;
    if (visitorId != null && tid === visitorId) return visitorName;
    return `Team ${tid}`;
  };

  const opposingTeamId = (batTid: number): number | undefined => {
    if (localId != null && visitorId != null) {
      if (batTid === localId) return visitorId;
      if (batTid === visitorId) return localId;
    }
    return undefined;
  };

  /** Prefer SportMonks `scoreboard` (S1 / S2) when present on batting rows. */
  const scoreboardOnBat = allBat.filter(
    (r) => typeof r.scoreboard === "string" && r.scoreboard.trim().length > 0,
  );
  if (scoreboardOnBat.length > 0) {
    const byKey = new Map<string, Record<string, unknown>[]>();
    for (const r of allBat) {
      const k =
        typeof r.scoreboard === "string" && r.scoreboard.trim()
          ? r.scoreboard.trim()
          : "_extra";
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    const keys = [...byKey.keys()].sort((a, b) => scoreboardSortOrder(a) - scoreboardSortOrder(b));
    const cards: LiveInningsCard[] = [];
    for (const key of keys) {
      const rawBat = byKey.get(key)!;
      if (key === "_extra" && rawBat.length === 0) continue;
      const batTidRaw = rawBat[0]?.team_id;
      const batTid = batTidRaw != null ? Number(batTidRaw) : NaN;
      const bname = resolveTeamName(Number.isFinite(batTid) ? batTid : undefined);
      const total = Number.isFinite(batTid)
        ? lookupTeamInningsTotal(fixture, batTid, key === "_extra" ? undefined : key)
        : null;
      const headerLine = formatInningsHeaderLine(bname, total);

      const bowlRaw =
        key === "_extra"
          ? allBowl.filter(
              (r) =>
                !(typeof r.scoreboard === "string" && r.scoreboard.trim().length > 0),
            )
          : allBowl.filter(
              (r) =>
                typeof r.scoreboard === "string" && r.scoreboard.trim() === key,
            );

      const battingRows = rawBat.map((row) => mapBattingRowFromRecord(row, idNameMap)).slice(0, 30);
      const bowlingRows = bowlRaw.map((row) => mapBowlingRowFromRecord(row, idNameMap)).slice(0, 30);

      cards.push({
        scoreboardKey: key === "_extra" ? undefined : key,
        battingTeamId: Number.isFinite(batTid) ? batTid : undefined,
        battingTeamName: bname,
        headerLine,
        battingRows,
        bowlingRows,
      });
    }
    if (cards.length) return cards;
  }

  /** Two-innings T20-style: order from `runs[].inning`, split batting by `team_id`, bowling by fielding team. */
  const rawRuns = Array.isArray(fixture.runs) ? fixture.runs : [];
  const runEntries = rawRuns
    .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
    .filter((o) => Number.isFinite(Number(o.team_id)))
    .sort((a, b) => Number(a.inning ?? 0) - Number(b.inning ?? 0));

  if (runEntries.length > 0) {
    const cards: LiveInningsCard[] = [];
    for (const ru of runEntries) {
      const batTid = Number(ru.team_id);
      const rawBat = allBat.filter((r) => Number(r.team_id) === batTid);
      if (!rawBat.length) continue;
      const bname = resolveTeamName(batTid);
      const total: TeamInningsTotal = {
        runs: Number(ru.score ?? ru.total ?? ru.runs ?? 0),
        wk:
          ru.wickets != null
            ? Number(ru.wickets)
            : ru.wickets_out != null
              ? Number(ru.wickets_out)
              : null,
        overs: formatOvers(ru.overs),
      };
      const headerLine = formatInningsHeaderLine(bname, total);
      const opp = opposingTeamId(batTid);
      const bowlRaw =
        opp != null ? allBowl.filter((r) => Number(r.team_id) === opp) : [];
      cards.push({
        battingTeamId: batTid,
        battingTeamName: bname,
        headerLine,
        battingRows: rawBat.map((row) => mapBattingRowFromRecord(row, idNameMap)).slice(0, 30),
        bowlingRows: bowlRaw.map((row) => mapBowlingRowFromRecord(row, idNameMap)).slice(0, 30),
      });
    }
    if (cards.length) return cards;
  }

  /** Last resort: batting team order of first appearance (no `runs` / no scoreboard). */
  const order: number[] = [];
  const seen = new Set<number>();
  for (const r of allBat) {
    const tid = Number(r.team_id);
    if (!Number.isFinite(tid) || seen.has(tid)) continue;
    seen.add(tid);
    order.push(tid);
  }
  if (order.length > 1 || (order.length === 1 && allBowl.length)) {
    const cards: LiveInningsCard[] = [];
    for (const batTid of order) {
      const rawBat = allBat.filter((r) => Number(r.team_id) === batTid);
      const bname = resolveTeamName(batTid);
      const total = lookupTeamInningsTotal(fixture, batTid);
      const headerLine = formatInningsHeaderLine(bname, total);
      const opp = opposingTeamId(batTid);
      const bowlRaw =
        opp != null ? allBowl.filter((r) => Number(r.team_id) === opp) : [];
      cards.push({
        battingTeamId: batTid,
        battingTeamName: bname,
        headerLine,
        battingRows: rawBat.map((row) => mapBattingRowFromRecord(row, idNameMap)).slice(0, 30),
        bowlingRows: bowlRaw.map((row) => mapBowlingRowFromRecord(row, idNameMap)).slice(0, 30),
      });
    }
    if (cards.length) return cards;
  }

  return [];
}

/**
 * Merge `runs` array entries into team scores when dl_data is empty.
 * Cricket API often returns runs per inning with team_id.
 */
function teamScoresFromRuns(
  fixture: Record<string, unknown>,
  localName: string,
  visitorName: string,
  localId?: number,
  visitorId?: number,
): LiveTeamScore[] | undefined {
  const raw = fixture.runs;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const byTeam = new Map<number, { runs: number; wk: number | null; ov: string | null }>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const tid = o.team_id != null ? Number(o.team_id) : NaN;
    if (!Number.isFinite(tid)) continue;
    const score = Number(o.score ?? o.total ?? o.runs ?? 0);
    const wk = o.wickets != null ? Number(o.wickets) : o.wickets_out != null ? Number(o.wickets_out) : null;
    const ov = formatOvers(o.overs);
    const prev = byTeam.get(tid);
    const nextRuns = (prev?.runs ?? 0) + (Number.isFinite(score) ? score : 0);
    const nextWk = wk != null && Number.isFinite(wk) ? wk : prev?.wk ?? null;
    const nextOv = ov ?? prev?.ov ?? null;
    byTeam.set(tid, { runs: nextRuns, wk: nextWk, ov: nextOv });
  }
  const scores: LiveTeamScore[] = [];
  const pushTeam = (tid: number | undefined, label: string) => {
    if (tid == null || !Number.isFinite(tid)) return;
    const s = byTeam.get(tid);
    if (!s) return;
    scores.push({
      teamLabel: abbrevLabel(label),
      runs: s.runs,
      wickets: s.wk,
      overs: s.ov,
    });
  };
  pushTeam(localId, localName);
  pushTeam(visitorId, visitorName);
  return scores.length ? scores : undefined;
}

function formatShortLine(teamScores: LiveTeamScore[]): string {
  return teamScores
    .map((t) => {
      const w = t.wickets != null && Number.isFinite(t.wickets) ? `${t.wickets}` : "—";
      const o = t.overs ?? "—";
      return `${t.teamLabel} ${t.runs}/${w} (${o})`;
    })
    .join(" · ");
}

/**
 * Build a normalized snapshot from a raw SportMonks fixture or livescore object.
 */
export function buildLiveSnapshotFromFixture(raw: unknown): LiveSnapshot {
  const updatedAt = new Date().toISOString();
  const fixture = unwrapData<Record<string, unknown>>(raw) ?? (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null);
  if (!fixture) {
    return { shortLine: "Score updating…", summaryNote: "No fixture data", updatedAt };
  }

  const localName = readTeamName(fixture.localteam);
  const visitorName = readTeamName(fixture.visitorteam);
  const localId =
    fixture.localteam_id != null
      ? Number(fixture.localteam_id)
      : unwrapData<Record<string, unknown>>(fixture.localteam)?.id != null
        ? Number((unwrapData(fixture.localteam) as Record<string, unknown>).id)
        : undefined;
  const visitorId =
    fixture.visitorteam_id != null
      ? Number(fixture.visitorteam_id)
      : unwrapData<Record<string, unknown>>(fixture.visitorteam)?.id != null
        ? Number((unwrapData(fixture.visitorteam) as Record<string, unknown>).id)
        : undefined;

  const ltDl = readDlData(fixture.localteam_dl_data);
  const vtDl = readDlData(fixture.visitorteam_dl_data);

  const teamScores: LiveTeamScore[] = [];

  if (ltDl && (ltDl.score != null || ltDl.overs != null)) {
    teamScores.push({
      teamLabel: abbrevLabel(localName),
      runs: ltDl.score ?? 0,
      wickets: ltDl.wickets_out ?? null,
      overs: ltDl.overs != null ? String(ltDl.overs) : null,
    });
  }
  if (vtDl && (vtDl.score != null || vtDl.overs != null)) {
    teamScores.push({
      teamLabel: abbrevLabel(visitorName),
      runs: vtDl.score ?? 0,
      wickets: vtDl.wickets_out ?? null,
      overs: vtDl.overs != null ? String(vtDl.overs) : null,
    });
  }

  let merged = teamScores.length ? teamScores : undefined;
  if (!merged?.length) {
    merged = teamScoresFromRuns(fixture, localName, visitorName, localId, visitorId);
  }

  const idNameMap = buildPlayerIdNameMapFromBalls(fixture);
  const battingRows = buildBattingRows(fixture.batting, idNameMap);
  const bowlingRows = buildBowlingRows(fixture.bowling, idNameMap);
  const inningsCards = buildInningsCards(
    fixture,
    idNameMap,
    localName,
    visitorName,
    localId,
    visitorId,
  );

  let shortLine = merged?.length ? formatShortLine(merged) : "";
  if (!shortLine) {
    const st = fixture.status;
    const live = fixture.live;
    const isLive =
      (typeof st === "string" && /live|inning|1st|2nd/i.test(st)) ||
      live === 1 ||
      live === true;
    shortLine = isLive ? "Match in progress — score updating…" : "Score updating…";
  }

  return {
    shortLine,
    teamScores: merged,
    battingRows: battingRows.length ? battingRows : undefined,
    bowlingRows: bowlingRows.length ? bowlingRows : undefined,
    inningsCards: inningsCards.length ? inningsCards : undefined,
    updatedAt,
  };
}

export function parseLiveSnapshot(json: unknown): LiveSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.shortLine !== "string" || typeof o.updatedAt !== "string") return null;
  return o as unknown as LiveSnapshot;
}

/** True when we should still run a one-shot scoreboard sync for a completed match. */
export function isLiveSnapshotMissing(json: unknown): boolean {
  if (json == null) return true;
  if (typeof json !== "object" || Array.isArray(json)) return true;
  if (Object.keys(json as object).length === 0) return true;
  const parsed = parseLiveSnapshot(json);
  if (!parsed) return true;
  const hasCard =
    (parsed.teamScores?.length ?? 0) > 0 ||
    (parsed.inningsCards?.length ?? 0) > 0 ||
    (parsed.battingRows?.length ?? 0) > 0 ||
    (parsed.bowlingRows?.length ?? 0) > 0;
  return !hasCard;
}

/** True when `shortLine` is a generic placeholder, not real team totals. */
export function isSnapshotShortLinePlaceholder(
  snapshot: LiveSnapshot | null | undefined,
): boolean {
  if (!snapshot?.shortLine?.trim()) return true;
  const s = snapshot.shortLine.trim();
  return (
    s === "Score updating…" ||
    s === "Match in progress — score updating…" ||
    s === "Match in progress — score updating..."
  );
}

/** Whether the snapshot has batting/bowling rows worth rendering as a scorecard. */
export function hasScorecardTableData(
  snapshot: LiveSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  if (
    snapshot.inningsCards?.some(
      (c) => c.battingRows.length > 0 || c.bowlingRows.length > 0,
    )
  ) {
    return true;
  }
  return (
    (snapshot.battingRows?.length ?? 0) > 0 ||
    (snapshot.bowlingRows?.length ?? 0) > 0
  );
}

function parseInningsTotalFromCard(
  card: LiveInningsCard,
): { teamName: string; runs: number; wk: number | null } | null {
  const name = card.battingTeamName.trim();
  const line = card.headerLine.trim();
  if (!name || !line) return null;
  const rest = line.startsWith(name)
    ? line.slice(name.length).trim()
    : line.indexOf(name) === 0
      ? line.slice(name.length).trim()
      : null;
  if (rest == null) return null;
  const m = /^(\d+)\/(—|\d+)/.exec(rest);
  if (!m) return null;
  const runs = Number(m[1]);
  if (!Number.isFinite(runs)) return null;
  const wkTok = m[2];
  if (wkTok === "—") {
    return { teamName: card.battingTeamName.trim(), runs, wk: null };
  }
  const wk = Number(wkTok);
  return {
    teamName: card.battingTeamName.trim(),
    runs,
    wk: Number.isFinite(wk) ? wk : null,
  };
}

function unitPhrase(n: number, singular: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${singular}s`;
}

/**
 * One line per team for completed UI, e.g. `RCB 203/4 (15.4 ov)`.
 * Prefers `teamScores`, else full `inningsCards` headers, else splits `shortLine` on `·`.
 */
export function completedTeamScoreLines(snapshot: LiveSnapshot): string[] {
  const ts = snapshot.teamScores;
  if (ts?.length) {
    return ts.map((t) => {
      const w = t.wickets != null && Number.isFinite(t.wickets) ? `${t.wickets}` : "—";
      const o = t.overs ?? "—";
      const ov =
        o === "—" ? "—" : /\bov\b/i.test(String(o)) ? String(o) : `${o} ov`;
      return `${t.teamLabel} ${t.runs}/${w} (${ov})`;
    });
  }
  const cards = snapshot.inningsCards;
  if (cards?.length) {
    return cards.map((c) => c.headerLine.trim()).filter(Boolean);
  }
  const sl = snapshot.shortLine?.trim();
  if (sl && !isSnapshotShortLinePlaceholder(snapshot)) {
    return sl
      .split(/\s*·\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Two-innings limited match: winner + margin from card order (first card = 1st innings, second = chase).
 * Null when not inferable (e.g. not exactly two innings, or unparseable headers).
 */
export function formatMatchResultSummary(snapshot: LiveSnapshot): string | null {
  const cards = snapshot.inningsCards;
  if (!cards || cards.length !== 2) return null;
  const inn1 = parseInningsTotalFromCard(cards[0]!);
  const inn2 = parseInningsTotalFromCard(cards[1]!);
  if (!inn1 || !inn2) return null;

  const label1 = abbrevLabel(inn1.teamName);
  const label2 = abbrevLabel(inn2.teamName);

  if (inn2.runs > inn1.runs) {
    if (inn2.wk == null) {
      return `${label2} won`;
    }
    const wicketsRemaining = 10 - inn2.wk;
    if (wicketsRemaining <= 0) {
      return `${label2} won`;
    }
    return `${label2} won by ${unitPhrase(wicketsRemaining, "wicket")}`;
  }
  if (inn2.runs < inn1.runs) {
    const margin = inn1.runs - inn2.runs;
    return `${label1} won by ${unitPhrase(margin, "run")}`;
  }
  return "Match tied";
}
