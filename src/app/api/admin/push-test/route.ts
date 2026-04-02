import { NextResponse } from "next/server";
import { requireAdminService } from "@/lib/admin-server";
import { sendWebPushForUser } from "@/lib/push/send-web-push";

export const dynamic = "force-dynamic";

/**
 * Admin-only: send a test Web Push to every stored device for `userId` (no DB notification row).
 */
export async function POST(request: Request) {
  const gate = await requireAdminService();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  let body: { userId?: unknown; title?: unknown; body?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Dream12 test";
  const text =
    typeof body.body === "string" && body.body.trim() ? body.body.trim() : "Push is working";

  const result = await sendWebPushForUser(userId, title, text, { url: "/notifications" });
  return NextResponse.json(result);
}
