import webpush from "web-push";

let configured = false;

export function isWebPushSendingConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PRIVATE_KEY?.trim() && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim(),
  );
}

/** Call before sendNotification; idempotent. */
export function ensureWebPushConfigured(): boolean {
  if (configured) return isWebPushSendingConfigured();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@localhost";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}
