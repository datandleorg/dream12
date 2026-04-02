import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-server";
import { readServerLogArchivePage } from "@/lib/server-log-archive";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const key = sp.get("key")?.trim();
  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const cursor = Math.max(0, Math.floor(Number(sp.get("cursor")) || 0));
  const kind = sp.get("kind")?.trim() || null;
  const date = sp.get("date")?.trim() || null;

  try {
    const page = await readServerLogArchivePage(key, cursor, limit, kind, date);
    return NextResponse.json({
      rows: page.rows,
      nextCursor: String(page.nextByte),
      fileSize: page.fileSize,
      hasMore: page.hasMore,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
