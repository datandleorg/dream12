import "server-only";
import webpush from "web-push";
import {
  shouldSendEmailForNotificationType,
  type NotificationEmailRecord,
} from "@/lib/email/notification-record";
import { createServiceClient } from "@/lib/supabase/service";
import { errorNotificationPush, logNotificationPush, warnNotificationPush } from "./debug-log";
import { buildWebPushMessage, stringifyWebPushMessage } from "./push-payload";
import { ensureWebPushVapidConfigured } from "./web-push-config";

export type SendNotificationPushResult =
  | { ok: true; skippedReason?: string }
  | { ok: false; error: string };

function isGoneStatus(statusCode?: number): boolean {
  return statusCode === 410 || statusCode === 404;
}

/**
 * Sends Web Push for one `notifications` row to all stored subscriptions for that user.
 * Same type allowlist as email (`EMAIL_NOTIFICATION_TYPES`). Push errors do not fail email.
 */
export async function sendNotificationPush(
  record: NotificationEmailRecord,
): Promise<SendNotificationPushResult> {
  logNotificationPush("process notification row", {
    notificationId: record.id,
    type: record.type,
    userId: record.user_id,
  });

  if (!shouldSendEmailForNotificationType(record.type)) {
    logNotificationPush("skip: type not in EMAIL_NOTIFICATION_TYPES allowlist", { type: record.type });
    return { ok: true, skippedReason: "type_not_in_allowlist" };
  }

  if (!ensureWebPushVapidConfigured()) {
    logNotificationPush("skip: VAPID env incomplete (VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)");
    return { ok: true, skippedReason: "missing_vapid_config" };
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "service client error";
    warnNotificationPush("service client init failed", { message: msg });
    return { ok: false, error: msg };
  }

  const { data: rows, error: qErr } = await supabase
    .from("push_subscriptions")
    .select("endpoint, subscription")
    .eq("user_id", record.user_id);

  if (qErr) {
    errorNotificationPush("load subscriptions failed", { message: qErr.message });
    return { ok: false, error: qErr.message };
  }

  if (!rows?.length) {
    logNotificationPush("skip: no push subscriptions", { userId: record.user_id });
    return { ok: true, skippedReason: "no_subscriptions" };
  }

  const payload = stringifyWebPushMessage(buildWebPushMessage(record));

  for (const row of rows) {
    const endpoint = row.endpoint as string;
    const sub = row.subscription as webpush.PushSubscription;
    if (!endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      warnNotificationPush("skip invalid subscription row", { endpoint: endpoint?.slice(0, 48) });
      continue;
    }

    try {
      await webpush.sendNotification(sub, payload, {
        TTL: 60 * 60,
      });
      logNotificationPush("sent OK", { notificationId: record.id, endpointPrefix: endpoint.slice(0, 48) });
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      const body =
        err && typeof err === "object" && "body" in err
          ? String((err as { body?: string }).body ?? "")
          : "";

      if (isGoneStatus(statusCode)) {
        logNotificationPush("remove expired subscription", { endpointPrefix: endpoint.slice(0, 48), statusCode });
        const { error: delErr } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
        if (delErr) {
          warnNotificationPush("delete expired subscription failed", { message: delErr.message });
        }
        continue;
      }

      errorNotificationPush("send failed", {
        notificationId: record.id,
        statusCode,
        message: err instanceof Error ? err.message : String(err),
        body: body.slice(0, 200),
      });
    }
  }

  return { ok: true };
}
