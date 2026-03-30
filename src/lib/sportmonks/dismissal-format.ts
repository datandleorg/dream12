import { isDismissedBattingScoreboardRow } from "@/lib/extract-scoreboard-raw-to-live-map";

function unwrapData<T extends Record<string, unknown>>(node: unknown): T | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as T;
  }
  return o as T;
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

function playerNestName(field: unknown): string | null {
  if (!field || typeof field !== "object") return null;
  const u =
    unwrapData<Record<string, unknown>>(field) ?? (field as Record<string, unknown>);
  return nameFromPlayerLikeObject(u);
}

function numericOrNestedPlayerId(field: unknown): number | null {
  if (typeof field === "number" && Number.isFinite(field)) return field;
  if (field && typeof field === "object" && field !== null) {
    const id = (field as { id?: unknown }).id;
    if (typeof id === "number" && Number.isFinite(id)) return id;
  }
  return null;
}

function wicketTypeLabel(row: Record<string, unknown>): string {
  const w = row.wicket;
  if (w && typeof w === "object" && w !== null) {
    const n = (w as { name?: unknown }).name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  return "";
}

function nameFromId(id: number | null, map?: Map<number, string>): string | null {
  if (id == null || !Number.isFinite(id)) return null;
  return map?.get(id) ?? null;
}

function bowlerName(
  row: Record<string, unknown>,
  map?: Map<number, string>,
): string | null {
  return (
    playerNestName(row.bowler) ??
    nameFromId(
      row.bowling_player_id != null && typeof row.bowling_player_id !== "object"
        ? Number(row.bowling_player_id)
        : numericOrNestedPlayerId(row.bowler),
      map,
    )
  );
}

function catcherName(
  row: Record<string, unknown>,
  map?: Map<number, string>,
): string | null {
  return (
    playerNestName(row.catchstump) ??
    nameFromId(
      row.catch_stump_player_id != null &&
        typeof row.catch_stump_player_id !== "object"
        ? Number(row.catch_stump_player_id)
        : numericOrNestedPlayerId(row.catchstump),
      map,
    )
  );
}

/**
 * Human dismissal line from SportMonks batting row (wicket + nested players + ids).
 * Returns null when the batter is not out or no detail can be inferred.
 */
export function formatDismissalFromBattingRow(
  row: Record<string, unknown>,
  idNameMap?: Map<number, string>,
): string | null {
  if (!isDismissedBattingScoreboardRow(row)) return null;

  const ho =
    typeof row.how_out === "string" && row.how_out.trim()
      ? row.how_out.trim()
      : typeof row.dismissal === "string" && row.dismissal.trim()
        ? row.dismissal.trim()
        : "";
  if (ho) return ho;

  const wk = wicketTypeLabel(row);
  const lower = wk.toLowerCase();
  const bowler = bowlerName(row, idNameMap);
  const catcher = catcherName(row, idNameMap);
  const runoutBy =
    playerNestName(row.runoutby) ??
    nameFromId(
      numericOrNestedPlayerId(row.runout_by_id) ??
        numericOrNestedPlayerId(row.runoutby),
      idNameMap,
    );
  const dismissedBatsmanId =
    row.player_id != null && typeof row.player_id !== "object"
      ? Number(row.player_id)
      : numericOrNestedPlayerId(row.batsman);
  let secondRunOutId =
    row.batsmanout_id != null && typeof row.batsmanout_id !== "object"
      ? Number(row.batsmanout_id)
      : numericOrNestedPlayerId(row.batsmanout);
  if (
    secondRunOutId != null &&
    dismissedBatsmanId != null &&
    Number.isFinite(secondRunOutId) &&
    Number.isFinite(dismissedBatsmanId) &&
    secondRunOutId === dismissedBatsmanId
  ) {
    secondRunOutId = null;
  }
  const secondRunOutName =
    secondRunOutId != null
      ? nameFromId(secondRunOutId, idNameMap) ?? playerNestName(row.batsmanout)
      : null;

  if (lower.includes("run out") || lower.includes("runout")) {
    if (runoutBy && secondRunOutName)
      return `run out (${runoutBy}/${secondRunOutName})`;
    if (runoutBy) return `run out (${runoutBy})`;
    return wk || "Run out";
  }

  if (lower.includes("stump") && !lower.includes("catch")) {
    if (catcher && bowler) return `st ${catcher} b ${bowler}`;
    if (catcher) return `st ${catcher}`;
    return wk || "Stumped";
  }

  if (lower.includes("caught") && (lower.includes("bowl") || lower.includes("bowler"))) {
    if (bowler) return `c & b ${bowler}`;
    return wk || "Caught and bowled";
  }

  if (lower.includes("catch") || lower.includes("caught")) {
    if (catcher && bowler) return `c ${catcher} b ${bowler}`;
    if (catcher) return `c ${catcher}`;
    return wk || "Caught";
  }

  if (lower.includes("bowled")) {
    if (bowler) return `b ${bowler}`;
    return wk || "Bowled";
  }

  if (lower.includes("lbw")) {
    if (bowler) return `lbw b ${bowler}`;
    return wk || "lbw";
  }

  if (wk) {
    if (bowler && (lower.includes("hit") || lower.includes("obstruct"))) {
      return `${wk} b ${bowler}`;
    }
    return wk;
  }

  if (bowler) return `b ${bowler}`;
  return null;
}
