import type { NextRequest } from "next/server";

export function verifyNotificationsWebhookRequest(request: NextRequest): boolean {
  const secret = process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
