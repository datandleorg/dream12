/**
 * Clear fantasy + SportMonks game tables (keeps profiles / auth users).
 * Run from repo root with env loaded, e.g.:
 *   set -a && source .env.local && set +a && node scripts/clear-game-data.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Delete all rows (PostgREST: neq a value no row has). */
async function deleteAll(table, column, sentinel) {
  const { error, count } = await sb.from(table).delete({ count: "exact" }).neq(column, sentinel);
  if (error) {
    console.error(`${table}:`, error.message);
    throw error;
  }
  console.log(`${table}: deleted (${count ?? "?"} rows)`);
}

async function main() {
  const u = "00000000-0000-0000-0000-000000000001";
  const big = -9_007_199_254_740_991; // unlikely match / sm id

  console.log("Clearing game data…");

  await deleteAll("team_roster", "player_id", u);
  await deleteAll("user_teams", "id", u);
  await deleteAll("contests", "id", u);
  await deleteAll("players", "id", u);
  await deleteAll("matches", "id", big);
  await deleteAll("transactions", "id", u);

  const { error: rzErr } = await sb.from("razorpay_orders").delete({ count: "exact" }).neq("id", u);
  if (rzErr && !rzErr.message.includes("does not exist")) {
    console.warn("razorpay_orders:", rzErr.message);
  } else if (!rzErr) {
    console.log("razorpay_orders: cleared (if table exists)");
  }

  const { error: smErr } = await sb.from("sm_leagues").select("id").limit(1);
  if (!smErr) {
    await deleteAll("sm_season_squad", "player_sportmonks_id", big);
    await deleteAll("sm_season_team", "team_id", big);
    await deleteAll("sm_seasons", "id", big);
    await deleteAll("sm_teams", "id", big);
    await deleteAll("sm_leagues", "id", big);
  } else {
    console.log("sm_* tables skipped (not migrated yet)");
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
