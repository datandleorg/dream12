/**
 * Verify SportMonks + DB state after /api/cron/sync (reference tables, fixtures, squads, player pool).
 *
 * Run from repo root with env loaded:
 *   set -a && source .env.local && set +a && node scripts/verify-sync.mjs
 *
 * Optional:
 *   node scripts/verify-sync.mjs --season=1795
 *
 * Exit 0 = all required checks pass; 1 = one or more failures.
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

function argSeason() {
  const a = process.argv.find((x) => x.startsWith("--season="));
  if (a) return Number(a.split("=")[1]);
  const env = process.env.SPORTMONKS_SEASON_ID?.trim();
  if (env && /^\d+$/.test(env)) return Number(env);
  return null;
}

async function countRows(table, filters = {}) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters)) {
    if (val === undefined) continue;
    q = q.eq(col, val);
  }
  const { count, error } = await q;
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function tableExists(name) {
  const { error } = await sb.from(name).select("*", { head: true }).limit(1);
  if (error && (error.message.includes("does not exist") || error.code === "42P01"))
    return false;
  return !error;
}

async function main() {
  console.log("Dream12 sync health check\n");

  const seasonIdArg = argSeason();
  let seasonId = seasonIdArg;

  const results = [];
  const fail = (name, detail) => results.push({ ok: false, name, detail });
  const pass = (name, detail) => results.push({ ok: true, name, detail });

  const smExists = await tableExists("sm_leagues");
  if (!smExists) {
    fail("migration.sm_reference", "sm_leagues missing — run migration 20260333000000_sportmonks_reference_tables.sql");
  } else {
    const lg = await countRows("sm_leagues");
    if (lg.error) fail("sm_leagues", lg.error);
    else {
      pass("sm_leagues", `count=${lg.count}`);
      if ((lg.count ?? 0) < 1) fail("sm_leagues.nonempty", "expected at least one league after sync");
    }

    const ss = await countRows("sm_seasons");
    if (ss.error) fail("sm_seasons", ss.error);
    else {
      pass("sm_seasons", `count=${ss.count}`);
      if ((ss.count ?? 0) < 1) fail("sm_seasons.nonempty", "expected at least one season after sync");
    }

    const st = await countRows("sm_teams");
    if (st.error) fail("sm_teams", st.error);
    else pass("sm_teams", `count=${st.count}`);

    if (!seasonId) {
      const { data: latest, error: e2 } = await sb
        .from("sm_seasons")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e2) fail("resolve.season", e2.message);
      else if (latest?.id != null) {
        seasonId = Number(latest.id);
        pass("resolve.season", `using latest sm_seasons.id=${seasonId} (set SPORTMONKS_SEASON_ID or --season= to pin)`);
      } else {
        fail("resolve.season", "no seasons in DB; cannot scope season checks");
      }
    } else {
      pass("resolve.season", `using Season ${seasonId} (env or --season=)`);
    }

    if (seasonId != null) {
      const stTeam = await countRows("sm_season_team", { season_id: seasonId });
      if (stTeam.error) fail("sm_season_team", stTeam.error);
      else {
        pass("sm_season_team", `season=${seasonId} count=${stTeam.count}`);
        if ((stTeam.count ?? 0) < 1)
          fail("sm_season_team.expected", "no teams linked to this season — syncSeasonTeams / backfill may have failed");
      }

      const sq = await countRows("sm_season_squad", { season_id: seasonId });
      if (sq.error) fail("sm_season_squad", sq.error);
      else {
        pass("sm_season_squad", `season=${seasonId} count=${sq.count}`);
        if ((sq.count ?? 0) < 1)
          fail(
            "sm_season_squad.expected",
            "no squad rows — squad API step failed or wrong season (check squad logs / SPORTMONKS_SQUAD_INCLUDE)",
          );
      }

      const { count: mSeason, error: mErr } = await sb
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("season_id", seasonId);
      if (mErr) fail("matches.season", mErr.message);
      else {
        pass("matches.season", `season=${seasonId} count=${mSeason ?? 0}`);
        if ((mSeason ?? 0) < 1)
          fail("matches.season.expected", "no fixtures for this season_id — syncMatches / filters");
      }

      const { count: orphanCount, error: oErr } = await sb
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("season_id", seasonId)
        .or("localteam_id.is.null,visitorteam_id.is.null");
      if (oErr) fail("matches.team_ids", oErr.message);
      else {
        const n = orphanCount ?? 0;
        const { data: sample } =
          n > 0
            ? await sb
                .from("matches")
                .select("id")
                .eq("season_id", seasonId)
                .or("localteam_id.is.null,visitorteam_id.is.null")
                .limit(5)
            : { data: [] };
        if (n > 0)
          pass(
            "matches.team_ids",
            `warn: ${n} match(es) missing localteam_id and/or visitorteam_id (sample: ${(sample ?? []).map((x) => x.id).join(",")})`,
          );
        else pass("matches.team_ids", "all scoped matches have both team ids");
      }

      const { data: mids } = await sb.from("matches").select("id").eq("season_id", seasonId).limit(800);
      const matchIds = (mids ?? []).map((m) => m.id);
      let playerCount = 0;
      if (matchIds.length) {
        const { count: pc, error: pErr } = await sb
          .from("players")
          .select("*", { count: "exact", head: true })
          .in("match_id", matchIds);
        if (pErr) fail("players.season", pErr.message);
        else {
          playerCount = pc ?? 0;
          pass("players.season", `rows for matches in season=${seasonId}: ${playerCount}`);
          if (playerCount < 1)
            fail(
              "players.season.expected",
              "no players for this season's matches — run squad hydrate + check sm_season_squad",
            );
        }
      }

      const { data: upcoming } = await sb
        .from("matches")
        .select("id,status")
        .eq("season_id", seasonId)
        .in("status", ["upcoming", "live"])
        .limit(400);
      const upIds = (upcoming ?? []).map((m) => m.id);
      if (upIds.length && playerCount > 0) {
        let emptyUpcoming = 0;
        for (const mid of upIds.slice(0, 40)) {
          const { count: c } = await sb
            .from("players")
            .select("*", { count: "exact", head: true })
            .eq("match_id", mid);
          if ((c ?? 0) === 0) emptyUpcoming++;
        }
        pass(
          "players.upcoming.sample",
          `sampled first ${Math.min(40, upIds.length)} upcoming/live matches: ${emptyUpcoming} with 0 players (lineup-only sync may fill later)`,
        );
      }
    }
  }

  const { count: allMatches, error: amErr } = await sb.from("matches").select("*", { count: "exact", head: true });
  if (amErr) fail("matches.total", amErr.message);
  else pass("matches.total", `count=${allMatches ?? 0}`);

  const { count: allPlayers, error: apErr } = await sb.from("players").select("*", { count: "exact", head: true });
  if (apErr) fail("players.total", apErr.message);
  else pass("players.total", `count=${allPlayers ?? 0}`);

  console.log("— Results —\n");
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`${icon} ${r.name}: ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length) {
    console.error(`${failed.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("All required checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
