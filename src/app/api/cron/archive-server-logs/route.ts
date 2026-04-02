import { readFile, stat, writeFile } from "fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { gzipSync } from "zlib";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { verifyCronRequest } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-run-log";
import { withNextApiLogging } from "@/lib/api-with-logging";
import { getServerLogFilePath } from "@/lib/server-log-paths";
import { logCron } from "@/lib/server-log";
import { serverLogsSpacesPrefix, trySpacesS3Client } from "@/lib/storage/do-spaces";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/archive-server-logs";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

async function handleGet(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const spaces = trySpacesS3Client();
  if (!spaces) {
    const durationMs = Date.now() - t0;
    const msg = "DO Spaces not configured; set DO_SPACES_* env vars";
    logCron({ route: ROUTE, ok: false, durationMs, error: msg });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { error: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const logPath = getServerLogFilePath();
  try {
    const st = await stat(logPath);
    if (st.size === 0) {
      const durationMs = Date.now() - t0;
      logCron({ route: ROUTE, ok: true, durationMs, summary: { skipped: "empty" } });
      recordCronRun({
        route: ROUTE,
        durationMs,
        ok: true,
        status: 200,
        summary: { skipped: true },
      });
      return NextResponse.json({ ok: true, skipped: true, reason: "empty" });
    }
    if (st.size > MAX_UPLOAD_BYTES) {
      const durationMs = Date.now() - t0;
      const msg = `Log file too large (${st.size} bytes); increase MAX or rotate manually`;
      logCron({ route: ROUTE, ok: false, durationMs, error: msg });
      recordCronRun({
        route: ROUTE,
        durationMs,
        ok: false,
        status: 413,
        summary: { error: msg },
      });
      return NextResponse.json({ error: msg }, { status: 413 });
    }

    const raw = await readFile(logPath);
    const gz = gzipSync(raw);
    const day = new Date().toISOString().slice(0, 10);
    const key = `${serverLogsSpacesPrefix()}/${day}/server-${Date.now()}.ndjson.gz`;

    await spaces.client.send(
      new PutObjectCommand({
        Bucket: spaces.bucket,
        Key: key,
        Body: gz,
        ContentType: "application/gzip",
      }),
    );

    await writeFile(logPath, "", { flag: "w" });

    const durationMs = Date.now() - t0;
    const summary = { key, uploadedBytes: gz.length, sourceBytes: raw.length };
    logCron({ route: ROUTE, ok: true, durationMs, summary });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: true,
      status: 200,
      summary,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    logCron({ route: ROUTE, ok: false, durationMs, error: msg });
    recordCronRun({
      route: ROUTE,
      durationMs,
      ok: false,
      status: 500,
      summary: { error: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withNextApiLogging(handleGet);
