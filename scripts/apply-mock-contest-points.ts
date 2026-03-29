/**
 * Recompute user_teams.total_points for the mock contest on match 69518 using
 * fixtures/mock-live-stats-69518.json (aligned with docs/dream11-t20-scoring.md).
 *
 *   pnpm mock:apply-points
 *
 * Loads `.env` then `.env.local` from the repo root (same idea as Next.js; local overrides).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import type { NormalizedPlayerStats } from "@/lib/fantasy/scoring";
import { aggregateTeamPoints, type RosterRow } from "@/lib/live-scoring";

const MATCH_ID = 69518;
const CONTEST_ID = "a1b2c3d4-e5f6-4789-a012-680695180001";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, ".env.local"), override: true });

async function main() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error(
      "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local",
    );
    process.exit(1);
  }

  const fixturePath = path.join(__dirname, "../fixtures/mock-live-stats-69518.json");
  const statsArr = JSON.parse(readFileSync(fixturePath, "utf8")) as Partial<NormalizedPlayerStats>[];

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: playerRows, error: pErr } = await sb
    .from("players")
    .select("id, sportmonks_id, role, in_playing_xi")
    .eq("match_id", MATCH_ID)
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (pErr || !playerRows?.length) {
    console.error("players load failed:", pErr?.message ?? "no rows");
    process.exit(1);
  }

  const n = Math.min(playerRows.length, statsArr.length);
  if (n < 22) {
    console.error(`Need at least 22 player/stat pairs; got ${playerRows.length} players and ${statsArr.length} stat rows`);
    process.exit(1);
  }

  const liveBySportmonksId: Record<string, Partial<NormalizedPlayerStats>> = {};
  for (let i = 0; i < n; i++) {
    const sm = playerRows[i]!.sportmonks_id;
    if (sm == null) {
      console.error(`Player ${playerRows[i]!.id} has null sportmonks_id`);
      process.exit(1);
    }
    liveBySportmonksId[String(sm)] = {
      runs: statsArr[i]?.runs ?? 0,
      ballsFaced: statsArr[i]?.ballsFaced ?? 0,
      fours: statsArr[i]?.fours ?? 0,
      sixes: statsArr[i]?.sixes ?? 0,
      isDismissed: statsArr[i]?.isDismissed ?? false,
      wickets: statsArr[i]?.wickets ?? 0,
      bowledLbwDismissals: statsArr[i]?.bowledLbwDismissals,
      oversBowled: statsArr[i]?.oversBowled ?? 0,
      runsConceded: statsArr[i]?.runsConceded ?? 0,
      maidens: statsArr[i]?.maidens ?? 0,
      catches: statsArr[i]?.catches ?? 0,
      stumpings: statsArr[i]?.stumpings ?? 0,
      runOutDirect: statsArr[i]?.runOutDirect,
      runOutIndirect: statsArr[i]?.runOutIndirect,
      runOuts: statsArr[i]?.runOuts ?? 0,
    };
  }

  const { data: teams, error: tErr } = await sb
    .from("user_teams")
    .select("id, captain_id, vice_captain_id")
    .eq("contest_id", CONTEST_ID);

  if (tErr || !teams?.length) {
    console.error("user_teams load failed:", tErr?.message ?? "no rows for contest");
    process.exit(1);
  }

  let updated = 0;
  for (const team of teams) {
    const { data: rosterJoin, error: rErr } = await sb
      .from("team_roster")
      .select("player_id, players ( sportmonks_id, role, in_playing_xi )")
      .eq("team_id", team.id);

    if (rErr || !rosterJoin?.length) {
      console.error("roster", team.id, rErr?.message ?? "empty");
      continue;
    }

    const roster: RosterRow[] = rosterJoin.map((r) => {
      const p = r.players as {
        sportmonks_id?: number | null;
        role?: string;
        in_playing_xi?: boolean | null;
      } | null;
      return {
        player_id: r.player_id as string,
        sportmonks_id: p?.sportmonks_id ?? null,
        role: p?.role ?? "BAT",
        in_playing_xi: p?.in_playing_xi ?? null,
      };
    });

    const points = aggregateTeamPoints(
      roster,
      team.captain_id as string,
      team.vice_captain_id as string,
      liveBySportmonksId,
    );

    const { error: uErr } = await sb
      .from("user_teams")
      .update({ total_points: points, updated_at: new Date().toISOString() })
      .eq("id", team.id);

    if (!uErr) updated += 1;
    else console.error("update failed", team.id, uErr.message);
  }

  console.log(`Updated total_points for ${updated}/${teams.length} teams (contest ${CONTEST_ID}, match ${MATCH_ID}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
