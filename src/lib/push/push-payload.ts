import type { NotificationEmailRecord } from "@/lib/email/notification-record";
import { hrefFromPayload } from "@/lib/notifications";

/** Payload JSON delivered to the service worker `push` handler (and shown via `showNotification`). */
export type WebPushMessage = {
  title: string;
  body: string;
  /** Relative path (e.g. `/wallet`) for `notificationclick` navigation. */
  href: string;
  /** Dedupes system notifications per notification row. */
  tag: string;
};

export function buildWebPushMessage(record: NotificationEmailRecord): WebPushMessage {
  const href = hrefFromPayload(record.payload) ?? "/notifications";
  return {
    title: record.title,
    body: record.body,
    href,
    tag: record.id,
  };
}

export function stringifyWebPushMessage(msg: WebPushMessage): string {
  return JSON.stringify(msg);
}
