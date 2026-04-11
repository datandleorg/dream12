import { describe, expect, it } from "vitest";
import type { NotificationEmailRecord } from "@/lib/email/notification-record";
import { buildWebPushMessage, stringifyWebPushMessage } from "./push-payload";

function sampleRecord(over: Partial<NotificationEmailRecord> = {}): NotificationEmailRecord {
  return {
    id: "notif-uuid-1",
    user_id: "user-uuid-1",
    type: "wallet_credit",
    title: "Wallet credited",
    body: "₹500.00 added to your wallet.",
    payload: { href: "/wallet", amount_inr: 500 },
    ...over,
  };
}

describe("buildWebPushMessage", () => {
  it("uses hrefFromPayload when payload has href", () => {
    const msg = buildWebPushMessage(sampleRecord());
    expect(msg.href).toBe("/wallet");
    expect(msg.tag).toBe("notif-uuid-1");
    expect(msg.title).toBe("Wallet credited");
    expect(msg.body).toBe("₹500.00 added to your wallet.");
  });

  it("falls back to /notifications when no safe href", () => {
    const msg = buildWebPushMessage(sampleRecord({ payload: {} }));
    expect(msg.href).toBe("/notifications");
  });

  it("ignores non-relative href", () => {
    const msg = buildWebPushMessage(
      sampleRecord({ payload: { href: "https://evil.example/phish" } }),
    );
    expect(msg.href).toBe("/notifications");
  });
});

describe("stringifyWebPushMessage", () => {
  it("round-trips fields the service worker expects", () => {
    const msg = buildWebPushMessage(sampleRecord());
    const s = stringifyWebPushMessage(msg);
    expect(JSON.parse(s)).toEqual({
      title: msg.title,
      body: msg.body,
      href: "/wallet",
      tag: "notif-uuid-1",
    });
  });
});
