import { constants, access } from "fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-server";
import { getServerLogFilePath } from "@/lib/server-log-paths";
import { readNdjsonPageFromPath } from "@/lib/server-log-read";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const cursor = Math.max(0, Math.floor(Number(sp.get("cursor")) || 0));
  const kind = sp.get("kind")?.trim() || null;

  const path = getServerLogFilePath();
  try {
    await access(path, constants.R_OK);
  } catch {
    return NextResponse.json({
      rows: [],
      nextCursor: "0",
      fileSize: 0,
      hasMore: false,
    });
  }

  const page = await readNdjsonPageFromPath(path, cursor, limit, kind);
  return NextResponse.json({
    rows: page.rows,
    nextCursor: String(page.nextByte),
    fileSize: page.fileSize,
    hasMore: page.hasMore,
  });
}
