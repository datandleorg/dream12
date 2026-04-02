import { createReadStream } from "fs";
import { stat, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const DEFAULT_CHUNK = 256 * 1024;
const MAX_SCAN_PER_REQUEST = 4 * 1024 * 1024;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC midnight bounds for a calendar day `YYYY-MM-DD`; null if invalid or empty. */
export function utcDayBoundsFromYmd(dateUtc: string | null | undefined): { startMs: number; endMs: number } | null {
  if (!dateUtc?.trim()) return null;
  const m = YMD_RE.exec(dateUtc.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const startMs = Date.UTC(y, mo - 1, day);
  const endMs = Date.UTC(y, mo - 1, day + 1);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startMs, endMs };
}

function rowMatchesPinoUtcDay(
  obj: Record<string, unknown>,
  dayBounds: { startMs: number; endMs: number } | null,
): boolean {
  if (!dayBounds) return true;
  const t = obj.time;
  if (typeof t !== "number" || !Number.isFinite(t)) return false;
  return t >= dayBounds.startMs && t < dayBounds.endMs;
}

async function readChunk(filePath: string, start: number, length: number): Promise<Buffer> {
  const stream = createReadStream(filePath, { start, end: start + length - 1 });
  const chunks: Buffer[] = [];
  for await (const c of stream) {
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

/** If starting mid-file, advance to the next newline so we do not parse a truncated line. */
async function skipToLineBoundary(
  filePath: string,
  startByte: number,
  fileSize: number,
): Promise<number> {
  if (startByte <= 0) return 0;
  if (startByte >= fileSize) return fileSize;
  const peek = await readChunk(filePath, startByte, Math.min(8192, fileSize - startByte));
  const nl = peek.indexOf(0x0a);
  if (nl < 0) return fileSize;
  return startByte + nl + 1;
}

/**
 * Read up to `limit` JSON objects from an NDJSON file starting at `startByte` (byte cursor).
 * `nextByte` is suitable as the next request cursor (line boundary).
 */
export async function readNdjsonPageFromPath(
  filePath: string,
  startByte: number,
  limit: number,
  kindFilter?: string | null,
  dateUtc?: string | null,
): Promise<{ rows: Record<string, unknown>[]; nextByte: number; fileSize: number; hasMore: boolean }> {
  const cap = Math.min(200, Math.max(1, limit));
  const dayBounds = utcDayBoundsFromYmd(dateUtc ?? null);
  const st = await stat(filePath);
  const fileSize = st.size;
  if (fileSize === 0) {
    return { rows: [], nextByte: 0, fileSize, hasMore: false };
  }

  let readPos = await skipToLineBoundary(filePath, startByte, fileSize);
  if (readPos >= fileSize) {
    return { rows: [], nextByte: fileSize, fileSize, hasMore: false };
  }

  const rows: Record<string, unknown>[] = [];
  let carry = Buffer.alloc(0);
  let carryFileStart = readPos;
  let scanned = 0;
  let nextByte = readPos;

  while (rows.length < cap && scanned < MAX_SCAN_PER_REQUEST) {
    if (readPos >= fileSize && carry.length === 0) break;

    const raw =
      readPos < fileSize
        ? await readChunk(filePath, readPos, Math.min(DEFAULT_CHUNK, fileSize - readPos))
        : Buffer.alloc(0);
    const chunkStart = readPos;
    readPos += raw.length;
    scanned += raw.length;

    const baseFileOffset = carry.length > 0 ? carryFileStart : chunkStart;
    const buf = carry.length > 0 ? Buffer.concat([carry, raw]) : raw;
    carry = Buffer.alloc(0);

    let i = 0;
    while (i < buf.length && rows.length < cap) {
      const nl = buf.indexOf(0x0a, i);
      if (nl < 0) {
        carry = Buffer.from(buf.subarray(i));
        carryFileStart = baseFileOffset + i;
        break;
      }
      const line = buf.subarray(i, nl).toString("utf8").trim();
      nextByte = baseFileOffset + nl + 1;
      i = nl + 1;
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (kindFilter && obj.kind !== kindFilter) {
          continue;
        }
        if (!rowMatchesPinoUtcDay(obj, dayBounds)) {
          continue;
        }
        rows.push(obj);
        if (rows.length >= cap) {
          const hasMore = nextByte < fileSize || carry.length > 0 || readPos < fileSize;
          return { rows, nextByte, fileSize, hasMore };
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  const hasMore = nextByte < fileSize || carry.length > 0;
  return { rows, nextByte, fileSize, hasMore };
}

export async function writeBufferToTempFile(buf: Buffer): Promise<string> {
  const p = join(tmpdir(), `dream12-srvlog-${randomUUID()}.ndjson`);
  await writeFile(p, buf);
  return p;
}

export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    /* ignore */
  }
}
