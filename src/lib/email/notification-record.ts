export type NotificationEmailRecord = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses Supabase Database Webhook body for `notifications` INSERT.
 * Tolerates minor shape differences (e.g. nested `payload` from some proxies).
 */
export function parseNotificationWebhookPayload(body: unknown): NotificationEmailRecord | null {
  if (!isRecord(body)) return null;

  const row = isRecord(body.record) ? body.record : isRecord(body.new) ? body.new : null;
  if (!row) return null;

  const id = typeof row.id === "string" ? row.id : null;
  const user_id = typeof row.user_id === "string" ? row.user_id : null;
  const type = typeof row.type === "string" ? row.type : null;
  const title = typeof row.title === "string" ? row.title : "";
  const bodyText = typeof row.body === "string" ? row.body : "";

  if (!id || !user_id || !type) return null;

  let payload: Record<string, unknown> = {};
  if (isRecord(row.payload)) payload = row.payload;
  else if (typeof row.payload === "string") {
    try {
      const p = JSON.parse(row.payload) as unknown;
      if (isRecord(p)) payload = p;
    } catch {
      payload = {};
    }
  }

  return { id, user_id, type, title, body: bodyText, payload };
}

/** True when `EMAIL_NOTIFICATION_TYPES` is unset (all) or includes `type`. */
export function shouldSendEmailForNotificationType(type: string): boolean {
  const raw = process.env.EMAIL_NOTIFICATION_TYPES?.trim();
  if (!raw) return true;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return allowed.has(type);
}

/**
 * Web push allowlist when `PUSH_NOTIFICATION_TYPES` is set (comma-separated).
 *
 * When **unset**, every non-empty notification `type` is pushed so lineup, toss, match results,
 * wallet, etc. are not accidentally dropped when `EMAIL_NOTIFICATION_TYPES` is a strict subset
 * (email and push are independent unless you explicitly set `PUSH_NOTIFICATION_TYPES`).
 */
export function shouldSendPushForNotificationType(type: string): boolean {
  if (type == null || String(type).trim() === "") return false;
  const raw = process.env.PUSH_NOTIFICATION_TYPES?.trim();
  if (raw) {
    const allowed = new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    return allowed.has(type);
  }
  return true;
}

export function getEmailAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
}
