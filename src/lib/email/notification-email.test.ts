import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  parseNotificationWebhookPayload,
  shouldSendEmailForNotificationType,
  type NotificationEmailRecord,
} from "./notification-record";
import { verifyNotificationsWebhookRequest } from "./webhook-auth";
import { renderNotificationEmail, resolveMatchResultVariant } from "./templates/render";
import { sendNotificationEmail } from "./send-notification-email";

const BASE = "https://dream12.test";

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

describe("parseNotificationWebhookPayload", () => {
  it("parses standard Supabase INSERT shape", () => {
    const row = sampleRecord();
    const parsed = parseNotificationWebhookPayload({
      type: "INSERT",
      table: "notifications",
      record: {
        id: row.id,
        user_id: row.user_id,
        type: row.type,
        title: row.title,
        body: row.body,
        payload: row.payload,
      },
    });
    expect(parsed).toEqual(row);
  });

  it("returns null when required fields missing", () => {
    expect(parseNotificationWebhookPayload({ record: { type: "x" } })).toBeNull();
    expect(parseNotificationWebhookPayload(null)).toBeNull();
  });
});

describe("shouldSendEmailForNotificationType", () => {
  const prev = process.env.EMAIL_NOTIFICATION_TYPES;

  afterEach(() => {
    if (prev === undefined) delete process.env.EMAIL_NOTIFICATION_TYPES;
    else process.env.EMAIL_NOTIFICATION_TYPES = prev;
  });

  it("allows all when env unset", () => {
    delete process.env.EMAIL_NOTIFICATION_TYPES;
    expect(shouldSendEmailForNotificationType("anything")).toBe(true);
  });

  it("filters by comma list", () => {
    process.env.EMAIL_NOTIFICATION_TYPES = "wallet_credit, pay_in_submitted ";
    expect(shouldSendEmailForNotificationType("wallet_credit")).toBe(true);
    expect(shouldSendEmailForNotificationType("pay_in_submitted")).toBe(true);
    expect(shouldSendEmailForNotificationType("lineup_out")).toBe(false);
  });
});

describe("verifyNotificationsWebhookRequest", () => {
  const prev = process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET;
    else process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET = prev;
  });

  it("rejects when secret unset", () => {
    delete process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET;
    const req = new NextRequest("https://x/api", {
      headers: { authorization: "Bearer x" },
    });
    expect(verifyNotificationsWebhookRequest(req)).toBe(false);
  });

  it("accepts matching bearer", () => {
    process.env.SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET = "s3cret";
    const req = new NextRequest("https://x/api", {
      headers: { authorization: "Bearer s3cret" },
    });
    expect(verifyNotificationsWebhookRequest(req)).toBe(true);
  });
});

describe("resolveMatchResultVariant", () => {
  it("detects cancelled via payload or title", () => {
    expect(resolveMatchResultVariant("x", { void: true })).toBe("cancelled");
    expect(resolveMatchResultVariant("Contest cancelled", {})).toBe("cancelled");
  });

  it("detects winnings and finished", () => {
    expect(resolveMatchResultVariant("Contest winnings", {})).toBe("winnings");
    expect(resolveMatchResultVariant("Contest finished", {})).toBe("finished");
    expect(resolveMatchResultVariant("Contest closed", {})).toBe("closed");
  });
});

describe("renderNotificationEmail", () => {
  it("includes type-specific markers for wallet_credit", () => {
    const { subject, html, text } = renderNotificationEmail(sampleRecord(), BASE);
    expect(subject).toContain("Wallet credited");
    expect(html).toContain("You’re funded up");
    expect(html).toContain("dream12.test/wallet");
    expect(text).toContain("₹500");
  });

  it("uses admin subject for admin_pay_out_pending", () => {
    const { subject, html } = renderNotificationEmail(
      sampleRecord({
        type: "admin_pay_out_pending",
        title: "New pay-out request",
        body: "User x requested ₹100 payout to a@upi.",
        payload: { href: "/admin/pay-out-requests", amount_inr: 100, payee_upi: "a@upi" },
      }),
      BASE,
    );
    expect(subject.startsWith("[Admin]")).toBe(true);
    expect(html).toContain("Payee UPI");
  });

  it("renders match_result winnings variant", () => {
    const { subject, html } = renderNotificationEmail(
      sampleRecord({
        type: "match_result",
        title: "Contest winnings",
        body: "You won ₹50 (rank 1).",
        payload: { href: "/contests/c1", rank: 1, amount_inr: 50 },
      }),
      BASE,
    );
    expect(subject).toContain("won");
    expect(html).toContain("Winner");
  });
});

describe("sendNotificationEmail", () => {
  const envKeys = [
    "RESEND_API_KEY",
    "RESEND_FROM",
    "NEXT_PUBLIC_APP_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "EMAIL_NOTIFICATION_TYPES",
  ] as const;

  const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of envKeys) snapshot[k] = process.env[k];
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    delete process.env.EMAIL_NOTIFICATION_TYPES;
  });

  afterEach(() => {
    for (const k of envKeys) {
      const v = snapshot[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("skips when Resend key missing", async () => {
    const r = await sendNotificationEmail(sampleRecord());
    expect(r).toEqual({ ok: true, skippedReason: "missing_resend_api_key" });
  });

  it("skips when NEXT_PUBLIC_APP_URL missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Dream12 <support@dream12.botnetworks.in>";
    const r = await sendNotificationEmail(sampleRecord());
    expect(r).toEqual({ ok: true, skippedReason: "missing_next_public_app_url" });
  });
});
