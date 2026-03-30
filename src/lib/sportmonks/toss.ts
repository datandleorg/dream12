import type { SmFixture } from "./client";

export type NormalizedToss = {
  winnerTeamId: number | null;
  decision: "bat" | "bowl" | null;
  raw: Record<string, unknown> | null;
};

function firstNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return null;
}

function unwrapData<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object" && raw !== null && "data" in raw) {
    const d = (raw as { data?: unknown }).data;
    if (d != null && typeof d === "object") return d as T;
    return null;
  }
  if (typeof raw === "object") return raw as T;
  return null;
}

function winnerObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function electedToDecision(electedRaw: string): "bat" | "bowl" | null {
  const el = electedRaw.toLowerCase();
  if (el.includes("field") || (el.includes("bowl") && !el.includes("bat"))) return "bowl";
  if (el.includes("bat")) return "bat";
  return null;
}

type FixtureWithToss = SmFixture & {
  toss?: unknown;
  toss_won_team_id?: unknown;
  elected?: unknown;
  tosswon?: unknown;
};

/**
 * Cricket v2: prefer fixture root **`toss_won_team_id`**, **`elected`**, **`tosswon`** (include
 * `tosswon`), then legacy nested **`toss`** object if present.
 */
export function normalizeSportmonksToss(fixture: FixtureWithToss): NormalizedToss | null {
  const ext = fixture as unknown as Record<string, unknown>;

  const tosswonO = winnerObj(ext.tosswon);
  const rootWinner = firstNum(
    ext.toss_won_team_id,
    tosswonO?.id,
    tosswonO?.resource_id,
  );

  const electedRaw =
    typeof ext.elected === "string"
      ? ext.elected
      : typeof ext.elected === "number"
        ? String(ext.elected)
        : "";
  const rootDecision = electedRaw ? electedToDecision(electedRaw) : null;

  const rootRaw: Record<string, unknown> = {};
  if (ext.toss_won_team_id != null) rootRaw.toss_won_team_id = ext.toss_won_team_id;
  if (typeof ext.elected === "string") rootRaw.elected = ext.elected;
  if (ext.tosswon != null) rootRaw.tosswon = ext.tosswon;

  const rootHas =
    rootWinner != null ||
    rootDecision != null ||
    Object.keys(rootRaw).length > 0;

  if (rootHas) {
    return {
      winnerTeamId: rootWinner,
      decision: rootDecision,
      raw: Object.keys(rootRaw).length > 0 ? rootRaw : null,
    };
  }

  const rawToss = fixture.toss;
  let node: unknown = rawToss;
  if (Array.isArray(rawToss) && rawToss.length > 0) {
    node = rawToss[0];
  }
  const t = unwrapData<Record<string, unknown>>(node);
  if (!t || typeof t !== "object") return null;

  const winnerTeamId = firstNum(
    t.winner_team_id,
    t.team_id,
    winnerObj(t.winner_team)?.id,
    winnerObj(t.winner_team)?.resource_id,
    winnerObj(t.team)?.id,
    winnerObj(t.team)?.resource_id,
    winnerObj(t.winner)?.id,
    winnerObj(t.winner)?.resource_id,
    winnerObj(t.winner)?.team_id,
  );

  const nestedElected =
    typeof t.elected === "string"
      ? t.elected
      : typeof t.decision === "string"
        ? t.decision
        : typeof t.description === "string"
          ? t.description
          : "";

  const decision = nestedElected ? electedToDecision(nestedElected) : null;

  const hasKeys = Object.keys(t).length > 0;
  if (winnerTeamId == null && decision == null && !hasKeys) {
    return null;
  }

  return {
    winnerTeamId,
    decision,
    raw: t as Record<string, unknown>,
  };
}
