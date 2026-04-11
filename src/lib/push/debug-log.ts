const PREFIX = "[notification-push]";

function oneLine(message: string, meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return `${PREFIX} ${message}`;
  try {
    return `${PREFIX} ${message} ${JSON.stringify(meta)}`;
  } catch {
    return `${PREFIX} ${message}`;
  }
}

export function logNotificationPush(message: string, meta?: Record<string, unknown>): void {
  console.log(oneLine(message, meta));
}

export function warnNotificationPush(message: string, meta?: Record<string, unknown>): void {
  console.warn(oneLine(message, meta));
}

export function errorNotificationPush(message: string, meta?: Record<string, unknown>): void {
  console.error(oneLine(message, meta));
}
