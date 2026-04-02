import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = Math.max(0, Math.floor(Number(sp.get("cursor")) || 0));

  const { data, error, count } = await gate.supabase
    .from("wallet_balance_audit")
    .select("id,user_id,previous_balance,new_balance,changed_at", { count: "exact" })
    .order("changed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const nextOffset = offset + (data?.length ?? 0);
  const hasMore = nextOffset < total;

  return NextResponse.json({
    rows: data ?? [],
    nextCursor: String(nextOffset),
    hasMore,
    total,
  });
}
