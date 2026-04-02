import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-server";
import { listServerLogArchives } from "@/lib/storage/do-spaces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const continuationToken = sp.get("continuationToken") ?? undefined;
  const maxKeys = Math.min(500, Math.max(1, Number(sp.get("maxKeys")) || 100));
  const date = sp.get("date")?.trim() || null;

  const out = await listServerLogArchives({ continuationToken, maxKeys, date });
  return NextResponse.json(out);
}
