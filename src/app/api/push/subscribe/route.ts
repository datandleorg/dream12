import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parsePushSubscription(body: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const endpoint = typeof o.endpoint === "string" ? o.endpoint.trim() : "";
  const keys =
    o.keys && typeof o.keys === "object" && o.keys !== null
      ? (o.keys as Record<string, unknown>)
      : null;
  const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

/** Persist browser PushSubscription (JSON from `subscription.toJSON()`). */
export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parsePushSubscription(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_endpoint: parsed.endpoint,
    p_p256dh: parsed.p256dh,
    p_auth: parsed.auth,
    p_user_agent: request.headers.get("user-agent") ?? "",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
