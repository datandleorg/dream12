import { sportmonksFetch } from "./client";

type JsonPage<T> = {
  data?: T[];
  meta?: {
    pagination?: {
      current_page?: number;
      last_page?: number;
    };
  };
};

/**
 * Follow SportMonks v2 `meta.pagination.last_page` until exhausted (max safety cap).
 */
export async function fetchAllPages<T>(
  path: string,
  baseParams: Record<string, string>,
  maxPages = 50,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = await sportmonksFetch<JsonPage<T>>(path, {
      ...baseParams,
      page: String(page),
    });
    const chunk = json.data ?? [];
    if (!chunk.length) break;
    out.push(...chunk);
    const last = json.meta?.pagination?.last_page;
    if (typeof last === "number" && page >= last) break;
  }
  return out;
}
