import "server-only";
import webpush from "web-push";

let configured = false;

/** Returns false if any VAPID env is missing (caller should skip send). */
export function ensureWebPushVapidConfigured(): boolean {
  if (configured) return true;
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}
