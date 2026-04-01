import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { logNotificationEmail, maskEmail, warnNotificationEmail } from "./debug-log";
import {
  getEmailAppBaseUrl,
  shouldSendEmailForNotificationType,
  type NotificationEmailRecord,
} from "./notification-record";
import { renderNotificationEmail } from "./templates";

export async function getUserEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    warnNotificationEmail("auth.admin.getUserById failed", {
      userId,
      message: error.message,
      status: error.status,
    });
    return null;
  }
  if (!data.user?.email) {
    warnNotificationEmail("user has no email in Auth", { userId });
    return null;
  }
  return data.user.email;
}

export type SendNotificationEmailResult =
  | { ok: true; skippedReason?: string }
  | { ok: false; error: string };

/**
 * Sends a transactional email mirroring one `notifications` row (idempotent by notification id).
 */
export async function sendNotificationEmail(
  record: NotificationEmailRecord,
): Promise<SendNotificationEmailResult> {
  logNotificationEmail("process notification row", {
    notificationId: record.id,
    type: record.type,
    userId: record.user_id,
    title: record.title,
  });

  if (!shouldSendEmailForNotificationType(record.type)) {
    logNotificationEmail("skip: type not in EMAIL_NOTIFICATION_TYPES allowlist", {
      type: record.type,
    });
    return { ok: true, skippedReason: "type_not_in_allowlist" };
  }

  const appBase = getEmailAppBaseUrl();
  if (!appBase) {
    logNotificationEmail("skip: NEXT_PUBLIC_APP_URL is empty");
    return { ok: true, skippedReason: "missing_next_public_app_url" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    logNotificationEmail("skip: RESEND_API_KEY is empty");
    return { ok: true, skippedReason: "missing_resend_api_key" };
  }

  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    logNotificationEmail("skip: RESEND_FROM is empty");
    return { ok: true, skippedReason: "missing_resend_from" };
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "service client error";
    warnNotificationEmail("service client init failed", { message: msg });
    return { ok: false, error: msg };
  }

  const to = await getUserEmail(supabase, record.user_id);
  if (!to) {
    logNotificationEmail("skip: no recipient email (see warnings above if Auth failed)", {
      userId: record.user_id,
    });
    return { ok: true, skippedReason: "no_recipient_email" };
  }

  const { subject, html, text } = renderNotificationEmail(record, appBase);
  const resend = new Resend(apiKey);
  logNotificationEmail("calling Resend", {
    notificationId: record.id,
    to: maskEmail(to),
    from,
    subject,
    idempotencyKey: record.id,
  });

  const { error } = await resend.emails.send(
    { from, to, subject, html, text },
    { idempotencyKey: record.id },
  );

  if (error) {
    warnNotificationEmail("Resend API error", {
      notificationId: record.id,
      message: error.message,
      name: error.name,
    });
    return { ok: false, error: error.message };
  }

  logNotificationEmail("sent OK", { notificationId: record.id, to: maskEmail(to), subject });
  return { ok: true };
}
