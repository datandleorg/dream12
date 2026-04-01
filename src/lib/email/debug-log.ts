const PREFIX = "[notification-email]";

function oneLine(message: string, meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return `${PREFIX} ${message}`;
  try {
    return `${PREFIX} ${message} ${JSON.stringify(meta)}`;
  } catch {
    return `${PREFIX} ${message}`;
  }
}

/** Redact middle of address for logs (debug only). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const vis = user.slice(0, Math.min(2, user.length));
  return `${vis}***@${domain}`;
}

/** Single-line logs so `docker compose logs | grep notification-email` always matches. */
export function logNotificationEmail(message: string, meta?: Record<string, unknown>): void {
  console.log(oneLine(message, meta));
}

export function warnNotificationEmail(message: string, meta?: Record<string, unknown>): void {
  console.warn(oneLine(message, meta));
}

export function errorNotificationEmail(message: string, meta?: Record<string, unknown>): void {
  console.error(oneLine(message, meta));
}
