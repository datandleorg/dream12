#!/usr/bin/env node
/**
 * Run a generic Supabase query from a JSON spec (PostgREST — not raw SQL).
 *
 *   node --env-file=.env.local scripts/run-supabase-query.mjs queries/example-sm-season-squad-labels.json
 *   cat spec.json | node --env-file=.env.local scripts/run-supabase-query.mjs
 *
 * npm:
 *   npm run sb:query -- scripts/queries/sm-season-squad-position-labels.json
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role for RLS bypass on tables).
 */
import fs from "node:fs";
import { createServiceSupabase, runQuerySpec } from "./lib/supabase-query.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const arg = process.argv[2]?.trim();
  let raw = "";
  if (arg) {
    if (fs.existsSync(arg)) {
      raw = fs.readFileSync(arg, "utf8");
    } else {
      raw = arg;
    }
  } else {
    raw = (await readStdin()).trim();
  }

  if (!raw) {
    console.error(
      [
        "Provide a JSON file path or pipe JSON on stdin.",
        "",
        'Example select:',
        JSON.stringify(
          {
            op: "select",
            table: "sm_season_squad",
            select: "position_label",
            paginate: true,
            aggregate: { groupBy: "position_label" },
          },
          null,
          2,
        ),
      ].join("\n"),
    );
    process.exit(1);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  try {
    const sb = createServiceSupabase();
    const result = await runQuerySpec(sb, body);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
