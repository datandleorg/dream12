/**
 * Build a compact UI snapshot from SportMonks Cricket fixture / livescore payloads.
 * Handles nested `data` wrappers, `localteam_dl_data` / `visitorteam_dl_data`, `runs` arrays,
 * and optional `batting` / `bowling` relationship shapes.
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
};

export type LiveSnapshot = {
  shortLine: string;
  teamScores?: LiveTeamScore[];
  battingRows?: LiveBattingRow[];
  bowlingRows?: LiveBowlingRow[];
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

function playerNameFromRow(row: Record<string, unknown>): string {
  const p = row.player;
  if (p && typeof p === "object") {
    const po = p as Record<string, unknown>;
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
    if (a) return a;
  }
  const pid = row.player_id;
  if (pid != null) return `Player ${pid}`;
  return "—";
}

function buildBattingRows(raw: unknown): LiveBattingRow[] {
  const rows = asObjectArray(raw);
  const out: LiveBattingRow[] = [];
  for (const r of rows) {
    const runs = Number(r.runs ?? r.score ?? 0);
    const balls = r.balls_faced != null ? Number(r.balls_faced) : r.balls != null ? Number(r.balls) : undefined;
    const fours = r.fours != null ? Number(r.fours) : undefined;
    const sixes = r.sixes != null ? Number(r.sixes) : undefined;
    const sr = r.rate != null ? String(r.rate) : r.strike_rate != null ? String(r.strike_rate) : undefined;
    const dismissal =
      typeof r.how_out === "string"
        ? r.how_out
        : typeof r.dismissal === "string"
          ? r.dismissal
          : null;
    out.push({
      name: playerNameFromRow(r),
      runs,
      balls: Number.isFinite(balls) ? balls : undefined,
      fours: fours != null && Number.isFinite(fours) ? fours : undefined,
      sixes: sixes != null && Number.isFinite(sixes) ? sixes : undefined,
      strikeRate: sr,
      dismissal,
    });
  }
  return out.slice(0, 30);
}

function buildBowlingRows(raw: unknown): LiveBowlingRow[] {
  const rows = asObjectArray(raw);
  const out: LiveBowlingRow[] = [];
  for (const r of rows) {
    const overs = formatOvers(r.overs) ?? "0";
    const maidensRaw = r.maidens != null ? Number(r.maidens) : undefined;
    const runs = Number(r.runs_conceded ?? r.conceded ?? r.runs ?? 0);
    const wickets = Number(r.wickets ?? r.wicket ?? 0);
    const econ = r.econ_rate != null ? String(r.econ_rate) : r.economy != null ? String(r.economy) : undefined;
    out.push({
      name: playerNameFromRow(r),
      overs,
      maidens:
        maidensRaw != null && Number.isFinite(maidensRaw) ? maidensRaw : undefined,
      runs,
      wickets,
      economy: econ,
    });
  }
  return out.slice(0, 30);
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

  const battingRows = buildBattingRows(fixture.batting);
  const bowlingRows = buildBowlingRows(fixture.bowling);

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
    updatedAt,
  };
}

export function parseLiveSnapshot(json: unknown): LiveSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.shortLine !== "string" || typeof o.updatedAt !== "string") return null;
  return o as unknown as LiveSnapshot;
}
