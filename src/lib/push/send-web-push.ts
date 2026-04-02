import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureWebPushConfigured } from "./vapid";

export type SendWebPushResult = {
  sent: number;
  failed: number;
  removedStale: number;
  errors: string[];
  skipped?: boolean;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function isStalePushStatus(code: number | undefined): boolean {
  return code === 410 || code === 404;
}

/**
 * Sends one Web Push per stored subscription for the user. Uses service role to read/delete rows.
 * Never throws; logs are left to callers via returned `errors`.
 */
export async function sendWebPushForUser(
  userId: string,
  title: string,
  body: string,
  data?: { url?: string; notificationId?: string; type?: string },
): Promise<SendWebPushResult> {
  const result: SendWebPushResult = { sent: 0, failed: 0, removedStale: 0, errors: [] };

  if (!ensureWebPushConfigured()) {
    result.skipped = true;
    return result;
  }

  const service = createServiceClient();
  const { data: rows, error: selectError } = await service
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);

  if (selectError) {
    result.errors.push(`select: ${selectError.message}`);
    return result;
  }

  const subs = (rows ?? []) as PushSubscriptionRow[];
  if (subs.length === 0) return result;

  const payload = JSON.stringify({
    title: title || "Dream12",
    body: body || "",
    url: data?.url ?? "/notifications",
    notificationId: data?.notificationId,
    type: data?.type,
  });

  for (const row of subs) {
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };

    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60 * 24,
      });
      result.sent += 1;
    } catch (e: unknown) {
      const status =
        e && typeof e === "object" && "statusCode" in e
          ? Number((e as { statusCode?: number }).statusCode)
          : undefined;
      const msg = e instanceof Error ? e.message : String(e);

      if (isStalePushStatus(status)) {
        const { error: delErr } = await service.from("push_subscriptions").delete().eq("id", row.id);
        if (delErr) {
          result.errors.push(`delete stale ${row.id}: ${delErr.message}`);
        } else {
          result.removedStale += 1;
        }
        continue;
      }

      result.failed += 1;
      result.errors.push(msg);
    }
  }

  return result;
}
