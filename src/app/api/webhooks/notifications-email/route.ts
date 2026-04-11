import { NextResponse, type NextRequest } from "next/server";
import { errorNotificationEmail, logNotificationEmail, warnNotificationEmail } from "@/lib/email/debug-log";
import { parseNotificationWebhookPayload } from "@/lib/email/notification-record";
import { sendNotificationEmail } from "@/lib/email/send-notification-email";
import { verifyNotificationsWebhookRequest } from "@/lib/email/webhook-auth";
import { errorNotificationPush } from "@/lib/push/debug-log";
import { sendNotificationPush } from "@/lib/push/send-notification-push";

export const dynamic = "force-dynamic";

/**
 * Health check: Supabase Database Webhooks only send POST. If you see no `[notification-email]`
 * lines when notifications fire, your webhook URL is probably not reachable (e.g. localhost from cloud).
 * Call: `curl -s http://localhost:3000/api/webhooks/notifications-email` and watch `docker compose logs -f web`.
 */
export async function GET() {
  logNotificationEmail("GET health check (no email sent — use this to verify logs reach Docker)");
  // Some Docker / log setups attach stderr more reliably than console.log routing.
  if (typeof process.stderr?.write === "function") {
    process.stderr.write(
      "[notification-email] GET health check (stderr duplicate — if you see this but not the line above, check Docker log driver)\n",
    );
  }
  return NextResponse.json({
    ok: true,
    route: "notifications-email",
    detail:
      "Supabase must POST here with Authorization: Bearer <SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET>. Cloud Supabase cannot reach http://localhost — use your public HTTPS URL or ngrok.",
  });
}

export async function POST(request: NextRequest) {
  logNotificationEmail("webhook POST received");

  if (!verifyNotificationsWebhookRequest(request)) {
    warnNotificationEmail("webhook unauthorized", {
      hasWebhookSecret: Boolean(process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET),
      hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    warnNotificationEmail("webhook body is not valid JSON");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (process.env.NOTIFICATION_EMAIL_DEBUG_PAYLOAD === "1") {
    const keys =
      body && typeof body === "object" && !Array.isArray(body)
        ? Object.keys(body as object)
        : [];
    logNotificationEmail("webhook payload (debug)", {
      topLevelKeys: keys,
      hasRecord:
        body &&
        typeof body === "object" &&
        "record" in (body as object) &&
        typeof (body as { record?: unknown }).record === "object",
    });
  }

  const record = parseNotificationWebhookPayload(body);
  if (!record) {
    warnNotificationEmail("could not parse notification from webhook body", {
      bodyType: body === null ? "null" : typeof body,
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await sendNotificationEmail(record);
  if (!result.ok) {
    errorNotificationEmail("send failed (returning 500 for retry)", {
      notificationId: record.id,
      error: result.error,
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  logNotificationEmail("webhook done", {
    notificationId: record.id,
    skippedReason: result.skippedReason ?? null,
  });

  void sendNotificationPush(record)
    .then((pushResult) => {
      if (!pushResult.ok) {
        errorNotificationPush("send failed after email OK (webhook still 200)", {
          notificationId: record.id,
          error: pushResult.error,
        });
      }
    })
    .catch((e) => {
      errorNotificationPush("send threw after email OK (webhook still 200)", {
        notificationId: record.id,
        error: e instanceof Error ? e.message : String(e),
      });
    });

  return NextResponse.json({ ok: true, skippedReason: result.skippedReason ?? null });
}
