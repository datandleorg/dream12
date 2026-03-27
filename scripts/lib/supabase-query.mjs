/**
 * Generic Supabase (PostgREST) queries for local scripts — same credentials as verify-sync.
 *
 * The JS client cannot run arbitrary SQL; use `from().select()` + filters, `rpc()`, or
 * optional client-side `aggregate.groupBy` for quick analytics (GROUP BY–style).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * @example
 * import { createServiceSupabase, fetchAllRows, runQuerySpec } from "./lib/supabase-query.mjs";
 * const sb = createServiceSupabase();
 * const rows = await fetchAllRows(sb, { table: "sm_season_squad", select: "position_label" });
 */
import { createClient } from "@supabase/supabase-js";

export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {object} spec
 * @param {string} spec.table
 * @param {string} [spec.select]
 * @param {Record<string, unknown>} [spec.eq]
 * @param {Record<string, unknown[]>} [spec.in]
 * @param {{ column: string; ascending?: boolean } | Array<{ column: string; ascending?: boolean }>} [spec.order]
 * @param {number} [spec.limit]
 * @param {{ from: number; to: number }} [spec.range]
 */
function buildSelect(sb, spec) {
  let q = sb.from(spec.table).select(spec.select ?? "*", {
    count: spec.count ?? undefined,
    head: spec.head ?? false,
  });
  if (spec.eq) {
    for (const [col, val] of Object.entries(spec.eq)) {
      if (val === undefined) continue;
      q = q.eq(col, val);
    }
  }
  if (spec.in) {
    for (const [col, vals] of Object.entries(spec.in)) {
      if (!Array.isArray(vals) || !vals.length) continue;
      q = q.in(col, vals);
    }
  }
  if (spec.order) {
    const orders = Array.isArray(spec.order) ? spec.order : [spec.order];
    for (const o of orders) {
      q = q.order(o.column, { ascending: o.ascending ?? true });
    }
  }
  if (spec.range) {
    q = q.range(spec.range.from, spec.range.to);
  } else if (spec.limit != null) {
    q = q.limit(spec.limit);
  }
  return q;
}

/**
 * Single request (one page). Returns { data, error, count }.
 */
export async function runTableSelect(sb, spec) {
  let q = buildSelect(sb, spec);
  if (spec.single) {
    q = q.single();
    const { data, error } = await q;
    return { data, error, count: null };
  }
  if (spec.maybeSingle) {
    q = q.maybeSingle();
    const { data, error } = await q;
    return { data, error, count: null };
  }
  const { data, error, count } = await q;
  return { data, error, count };
}

/**
 * Page through all rows (add stable `order` on a unique column to avoid gaps).
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {object} spec - same as runTableSelect except range/limit ignored
 * @param {{ pageSize?: number }} [opts]
 */
export async function fetchAllRows(sb, spec, { pageSize = 1000 } = {}) {
  const all = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await runTableSelect(sb, {
      ...spec,
      range: { from, to },
      limit: undefined,
    });
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {string} fn
 * @param {Record<string, unknown>} [args]
 */
export async function runRpc(sb, fn, args = {}) {
  return sb.rpc(fn, args);
}

/**
 * Run a CLI-oriented spec object (see run-supabase-query.mjs).
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {object} body
 */
export async function runQuerySpec(sb, body) {
  const op = body.op ?? "select";
  if (op === "rpc") {
    const { data, error } = await runRpc(sb, body.fn, body.args ?? {});
    if (error) throw new Error(error.message);
    return { rows: data };
  }
  if (op === "select") {
    const spec = {
      table: body.table,
      select: body.select,
      eq: body.eq,
      in: body.in,
      order: body.order,
      limit: body.limit,
      single: body.single,
      maybeSingle: body.maybeSingle,
      count: body.count,
      head: body.head,
    };

    if (body.aggregate?.groupBy) {
      const pageSize = body.pageSize ?? 1000;
      const rows = await fetchAllRows(sb, spec, { pageSize });
      const col = body.aggregate.groupBy;
      const counts = new Map();
      for (const row of rows) {
        const k = row[col] === undefined ? "__undefined__" : row[col];
        const key = k === null ? "__NULL__" : k;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const out = [...counts.entries()].map(([key, n]) => {
        const position_label =
          key === "__NULL__" ? null : key === "__undefined__" ? undefined : key;
        return { [col]: position_label, n };
      });
      out.sort((a, b) => b.n - a.n || String(a[col]).localeCompare(String(b[col])));
      return { rows: out, totalRows: rows.length };
    }

    if (body.paginate) {
      const rows = await fetchAllRows(sb, spec, { pageSize: body.pageSize ?? 1000 });
      return { rows, totalRows: rows.length };
    }

    const { data, error, count } = await runTableSelect(sb, spec);
    if (error) throw new Error(error.message);
    return { rows: data ?? [], count };
  }
  throw new Error(`Unknown op: ${op}`);
}
