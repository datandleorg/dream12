import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { readNdjsonPageFromPath, safeUnlink } from "@/lib/server-log-read";
import { serverLogsSpacesPrefix, trySpacesS3Client } from "@/lib/storage/do-spaces";

const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

function normalizePrefix(): string {
  return `${serverLogsSpacesPrefix().replace(/\/+$/, "")}/`;
}

export function assertAllowedServerLogKey(key: string): void {
  const prefix = normalizePrefix();
  const k = key.trim();
  if (!k || k.includes("..") || !k.startsWith(prefix)) {
    throw new Error("Invalid log object key");
  }
}

/**
 * Download a gzip-compressed NDJSON object from Spaces, decompress to a temp file,
 * read one paginated slice, then delete the temp file.
 */
export async function readServerLogArchivePage(
  key: string,
  startByte: number,
  limit: number,
  kindFilter?: string | null,
): Promise<{ rows: Record<string, unknown>[]; nextByte: number; fileSize: number; hasMore: boolean }> {
  assertAllowedServerLogKey(key);
  const t = trySpacesS3Client();
  if (!t) {
    throw new Error("DigitalOcean Spaces is not configured");
  }

  const out = await t.client.send(
    new GetObjectCommand({
      Bucket: t.bucket,
      Key: key,
    }),
  );
  const body = out.Body;
  if (!body) {
    throw new Error("Empty object body");
  }

  const tmp = join(tmpdir(), `dream12-arc-${randomUUID()}.ndjson`);
  try {
    await pipeline(body as NodeJS.ReadableStream, createGunzip(), createWriteStream(tmp));
    const st = await stat(tmp);
    if (st.size > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("Decompressed archive exceeds size limit");
    }
    const page = await readNdjsonPageFromPath(tmp, startByte, limit, kindFilter);
    return page;
  } finally {
    await safeUnlink(tmp);
  }
}
