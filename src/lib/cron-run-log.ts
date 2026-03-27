import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export type CronRunRecord = {
  route: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  status: number;
  summary: unknown;
};

const LOG_FILE =
  process.env.CRON_RUN_LOG_PATH?.trim() ||
  join(tmpdir(), "dream12-cron-runs.jsonl");

const MAX_SUMMARY_CHARS = 8000;

function trimSummary(summary: unknown): unknown {
  if (summary === null || summary === undefined) return summary;
  try {
    const s = JSON.stringify(summary);
    if (s.length <= MAX_SUMMARY_CHARS) return summary;
    return { _truncated: true, preview: s.slice(0, MAX_SUMMARY_CHARS) + "…" };
  } catch {
    return String(summary).slice(0, MAX_SUMMARY_CHARS);
  }
}

/**
 * Append one JSON line (JSONL) for each cron execution; also logs to stdout for Docker logs.
 */
export function recordCronRun(
  partial: Omit<CronRunRecord, "finishedAt"> & { finishedAt?: string },
): void {
  const record: CronRunRecord = {
    ...partial,
    summary: trimSummary(partial.summary),
    finishedAt: partial.finishedAt ?? new Date().toISOString(),
  };
  const line = JSON.stringify(record);
  try {
    appendFileSync(LOG_FILE, `${line}\n`, { encoding: "utf8" });
  } catch (e) {
    console.warn("[dream12-api-cron] append run log failed:", e);
  }
  const sum =
    typeof record.summary === "object" && record.summary !== null
      ? JSON.stringify(record.summary)
      : String(record.summary);
  console.log(
    `[dream12-api-cron] ${record.route} ${record.ok ? "OK" : "FAIL"} ${record.durationMs}ms http=${record.status} ${sum}`,
  );
}

export function readCronRunHistory(maxLines = 100): CronRunRecord[] {
  if (!existsSync(LOG_FILE)) return [];
  let raw: string;
  try {
    raw = readFileSync(LOG_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.trim());
  const tail = lines.slice(-maxLines);
  const out: CronRunRecord[] = [];
  for (const l of tail) {
    try {
      out.push(JSON.parse(l) as CronRunRecord);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

export function cronRunLogPath(): string {
  return LOG_FILE;
}
