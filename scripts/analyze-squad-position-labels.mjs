/**
 * Aggregate public.sm_season_squad.position_label and show inferred fantasy role.
 *
 *   node --env-file=.env.local scripts/analyze-squad-position-labels.mjs
 *
 * Optional: --season=1795
 */
import { createServiceSupabase, fetchAllRows } from "./lib/supabase-query.mjs";

function argSeason() {
  const a = process.argv.find((x) => x.startsWith("--season="));
  if (a) return Number(a.split("=")[1]);
  return null;
}

/** Keep in sync with src/lib/sportmonks/infer-role-from-position-label.ts logic */
function normalizePositionLabel(pos) {
  return String(pos)
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

const EXACT_POSITION_ROLE = {
  wicketkeeper: "WK",
  "wicketkeeper batsman": "WK",
  "wicketkeeper batter": "WK",
  batsman: "BAT",
  bowler: "BOWL",
  allrounder: "AR",
  "batting allrounder": "AR",
  "bowling allrounder": "AR",
  "batting all rounder": "AR",
  "bowling all rounder": "AR",
  "middle order batter": "BAT",
  "opening batter": "BAT",
};

function inferRoleFromPositionLabel(pos) {
  if (pos == null || !String(pos).trim()) return "BAT";
  const k = normalizePositionLabel(String(pos));
  const direct = EXACT_POSITION_ROLE[k];
  if (direct) return direct;
  if (
    k.includes("batting allrounder") ||
    k.includes("bowling allrounder") ||
    k.includes("batting all rounder") ||
    k.includes("bowling all rounder")
  ) {
    return "AR";
  }
  if (
    k.includes("wicketkeeper") ||
    k.includes("wicket-keeper") ||
    k.includes("wicket keeper")
  ) {
    return "WK";
  }
  if (k.includes("allrounder") || k.includes("all-rounder") || k.includes("all rounder")) {
    return "AR";
  }
  if (k.includes("bowler")) return "BOWL";
  if (k.includes("batsman")) return "BAT";
  if (k.includes("batter")) return "BAT";
  if (k.includes("wk")) return "WK";
  return "BAT";
}

async function main() {
  const seasonId = argSeason();
  let sb;
  try {
    sb = createServiceSupabase();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const spec = {
    table: "sm_season_squad",
    select: "position_label",
    ...(seasonId != null && Number.isFinite(seasonId) ? { eq: { season_id: seasonId } } : {}),
  };

  let rows;
  try {
    rows = await fetchAllRows(sb, spec, { pageSize: 1000 });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const counts = new Map();
  let total = 0;
  for (const row of rows) {
    const raw = row.position_label;
    const key = raw === null || raw === undefined ? "__NULL__" : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }

  const nullish = (counts.get("__NULL__") ?? 0) + (counts.get("") ?? 0);
  console.log(
    JSON.stringify(
      {
        scope: seasonId != null ? `season_id=${seasonId}` : "all seasons",
        totalRows: total,
        missingOrEmptyLabel: nullish,
        distinctNonEmpty: [...counts.entries()].filter(([k]) => k !== "__NULL__" && k !== "").length,
      },
      null,
      2,
    ),
  );

  const sorted = [...counts.entries()]
    .filter(([k]) => k !== "__NULL__")
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

  console.log("\nposition_label\tn\tinferred_role\tnormalized");
  for (const [label, n] of sorted) {
    const raw = label === "" ? null : label;
    const inf = inferRoleFromPositionLabel(raw);
    const norm = raw == null || !String(raw).trim() ? "" : normalizePositionLabel(raw);
    console.log(`${JSON.stringify(raw)}\t${n}\t${inf}\t${norm}`);
  }
  if (counts.has("__NULL__")) {
    console.log(`null\t${counts.get("__NULL__")}\tBAT\t`);
  }
}

main();
