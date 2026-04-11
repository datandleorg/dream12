import { NextResponse, type NextRequest } from "next/server";
import type { PushSubscription } from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePushSubscription(body: unknown): PushSubscription | null {
  if (!isRecord(body)) return null;
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const keys = isRecord(body.keys) ? body.keys : null;
  const p256dh = keys && typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = keys && typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) return null;
  const expirationTime =
    body.expirationTime === null || body.expirationTime === undefined
      ? null
      : typeof body.expirationTime === "number"
        ? body.expirationTime
        : null;
  return {
    endpoint,
    expirationTime,
    keys: { p256dh, auth },
  };
}

export async function POST(request: NextRequest) {
  const supabaseUser = await createClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sub = parsePushSubscription(body);
  if (!sub) {
    return NextResponse.json({ error: "Invalid PushSubscription payload" }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { error } = await service.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        subscription: sub as unknown as Record<string, unknown>,
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY for push subscription upsert." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
