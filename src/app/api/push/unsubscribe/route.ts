import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function endpointFromRequest(request: Request, bodyUnknown: unknown): string {
  if (bodyUnknown && typeof bodyUnknown === "object") {
    const e = (bodyUnknown as { endpoint?: unknown }).endpoint;
    if (typeof e === "string" && e.trim()) return e.trim();
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("endpoint");
  return q?.trim() ?? "";
}

/** Remove stored subscription for this user + endpoint (after `subscription.unsubscribe()` on the client). */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const endpoint = endpointFromRequest(request, body);
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
