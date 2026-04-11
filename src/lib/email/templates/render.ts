import { escapeHtml } from "../escape-html";
import { wrapEmailBody } from "../layout";
import type { NotificationEmailRecord } from "../notification-record";
import { EMAIL_THEME } from "../theme";

export type RenderedNotificationEmail = {
  subject: string;
  html: string;
  text: string;
};

function absolutize(base: string, href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

function ctaUrl(base: string, payload: Record<string, unknown>): string | null {
  const h = payload.href;
  if (typeof h !== "string" || !h.trim()) return null;
  return absolutize(base, h.trim());
}

function headline(text: string, color: string = EMAIL_THEME.foreground): string {
  return `<h1 style="margin:0 0 10px;font-family:'Bebas Neue',Impact,sans-serif;font-size:30px;font-weight:400;line-height:1.12;letter-spacing:0.06em;color:${color};">${escapeHtml(text)}</h1>`;
}

function subline(text: string): string {
  return `<p style="margin:0 0 18px;font-family:'Source Sans 3',ui-sans-serif,sans-serif;font-size:14px;line-height:1.5;color:${EMAIL_THEME.muted};">${escapeHtml(text)}</p>`;
}

function bodyCopy(text: string): string {
  return `<p style="margin:0;font-family:'Source Sans 3',ui-sans-serif,sans-serif;font-size:16px;line-height:1.6;color:${EMAIL_THEME.foreground};">${escapeHtml(text)}</p>`;
}

function tagPill(text: string, bg: string, fg: string): string {
  return `<div style="margin-bottom:14px;"><span style="display:inline-block;padding:5px 14px;border-radius:999px;font-family:'Source Sans 3',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;background:${bg};color:${fg};">${escapeHtml(text)}</span></div>`;
}

function heroStrip(icon: string, bg: string, borderColor: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:separate;border-radius:10px;border:1px solid ${borderColor};background:${bg};">
  <tr><td style="padding:18px 18px;font-family:'Source Sans 3',sans-serif;font-size:15px;line-height:1.55;color:${EMAIL_THEME.foreground};">
    <span style="font-size:20px;line-height:1;vertical-align:middle;margin-right:8px;">${icon}</span><span style="vertical-align:middle;">${inner}</span>
  </td></tr></table>`;
}

function ctaButton(base: string, payload: Record<string, unknown>, label: string): string {
  const url = ctaUrl(base, payload);
  if (!url) {
    return `<p style="margin:22px 0 0;font-family:'Source Sans 3',sans-serif;font-size:14px;color:${EMAIL_THEME.muted};">Open the Dream12 app to continue.</p>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;border-collapse:collapse;">
  <tr><td style="border-radius:8px;background-color:${EMAIL_THEME.primary};">
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;font-family:'Source Sans 3',sans-serif;font-size:15px;font-weight:700;color:${EMAIL_THEME.primaryFg};text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

function adminMetaTable(rows: { k: string; v: string }[]): string {
  const cells = rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;font-family:'Source Sans 3',sans-serif;font-size:13px;color:${EMAIL_THEME.muted};width:38%;vertical-align:top;">${escapeHtml(r.k)}</td><td style="padding:8px 0;font-family:'Source Sans 3',sans-serif;font-size:14px;color:${EMAIL_THEME.foreground};vertical-align:top;">${escapeHtml(r.v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-collapse:collapse;border-top:1px solid ${EMAIL_THEME.cardBorder};">${cells}</table>`;
}

function formatInr(n: unknown): string {
  if (typeof n === "number" && Number.isFinite(n)) return `₹${n.toFixed(2)}`;
  if (typeof n === "string" && n.trim()) return `₹${n}`;
  return "—";
}

export type MatchResultVariant = "winnings" | "finished" | "closed" | "cancelled";

export function resolveMatchResultVariant(
  title: string,
  payload: Record<string, unknown>,
): MatchResultVariant {
  if (payload.void === true) return "cancelled";
  const t = title.toLowerCase();
  if (t.includes("cancel")) return "cancelled";
  if (t.includes("winnings") || t.includes("won")) return "winnings";
  if (t.includes("finished")) return "finished";
  if (t.includes("closed")) return "closed";
  return "closed";
}

type InnerParts = {
  subject: string;
  preheader: string;
  documentTitle: string;
  innerHtml: string;
  text: string;
};

function buildInner(record: NotificationEmailRecord, base: string): InnerParts {
  const { type, title, body, payload } = record;
  const cta = (label: string) => ctaButton(base, payload, label);
  const plain = (lines: string[]) => lines.filter(Boolean).join("\n\n");

  switch (type) {
    case "pay_in_submitted":
      return {
        subject: "Pay-in request received — Dream12",
        preheader: "We’re reviewing your deposit request.",
        documentTitle: "Pay-in received",
        innerHtml: `${tagPill("Wallet", EMAIL_THEME.secondaryBlock, EMAIL_THEME.foreground)}${headline("Deposit request received")}${subline("Hang tight while we verify your payment.")}${bodyCopy(body)}${cta("View wallet")}`,
        text: plain(["Deposit request received", body, "View wallet in the Dream12 app."]),
      };
    case "pay_in_approved":
      return {
        subject: "Wallet credited — Dream12",
        preheader: "Your pay-in was approved.",
        documentTitle: "Wallet credited",
        innerHtml: `${tagPill("Success", EMAIL_THEME.primary, EMAIL_THEME.primaryFg)}${headline("Wallet credited", EMAIL_THEME.accent)}${subline("Your balance is updated.")}${bodyCopy(body)}${cta("Open wallet")}`,
        text: plain(["Wallet credited", body]),
      };
    case "pay_in_rejected":
      return {
        subject: "Pay-in request update — Dream12",
        preheader: "We could not approve this pay-in.",
        documentTitle: "Pay-in declined",
        innerHtml: `${tagPill("Declined", EMAIL_THEME.destructiveSoft, EMAIL_THEME.destructive)}${headline("Pay-in not approved", EMAIL_THEME.destructive)}${bodyCopy(body)}${cta("View wallet")}`,
        text: plain(["Pay-in not approved", body]),
      };
    case "pay_out_submitted":
      return {
        subject: "Payout request received — Dream12",
        preheader: "We received your withdrawal request.",
        documentTitle: "Payout received",
        innerHtml: `${tagPill("Withdrawal", EMAIL_THEME.secondaryBlock, EMAIL_THEME.foreground)}${headline("Payout request received")}${subline("Our team will process it soon.")}${bodyCopy(body)}${cta("Track in wallet")}`,
        text: plain(["Payout request received", body]),
      };
    case "pay_out_approved":
      return {
        subject: "Payout approved — Dream12",
        preheader: "Funds debited from your wallet.",
        documentTitle: "Payout approved",
        innerHtml: `${tagPill("Approved", EMAIL_THEME.primary, EMAIL_THEME.primaryFg)}${headline("Payout approved")}${bodyCopy(body)}${cta("Wallet")}`,
        text: plain(["Payout approved", body]),
      };
    case "pay_out_rejected":
      return {
        subject: "Payout request update — Dream12",
        preheader: "Your payout could not be approved.",
        documentTitle: "Payout declined",
        innerHtml: `${tagPill("Declined", EMAIL_THEME.destructiveSoft, EMAIL_THEME.destructive)}${headline("Payout not approved", EMAIL_THEME.destructive)}${bodyCopy(body)}${cta("View wallet")}`,
        text: plain(["Payout not approved", body]),
      };
    case "wallet_credit":
      return {
        subject: "Wallet credited — Dream12",
        preheader: "New balance available to play.",
        documentTitle: "Wallet credit",
        innerHtml: `${heroStrip("✦", EMAIL_THEME.accentSoft, EMAIL_THEME.accent, `<strong style="color:${EMAIL_THEME.accent};">Balance update</strong> — ${escapeHtml(body)}`)}${headline("You’re funded up")}${subline("Ready to join contests.")}${cta("Go to wallet")}`,
        text: plain(["Wallet credit", body]),
      };
    case "contest_joined":
      return {
        subject: "You joined a contest — Dream12",
        preheader: "Squad saved — good luck!",
        documentTitle: "Joined contest",
        innerHtml: `${tagPill("Contest", EMAIL_THEME.primary, EMAIL_THEME.primaryFg)}${headline("You’re in")}${bodyCopy(body)}${cta("View squad")}`,
        text: plain(["Joined contest", body]),
      };
    case "contest_created":
      return {
        subject: "Contest is live — Dream12",
        preheader: "Your contest went live.",
        documentTitle: "Contest created",
        innerHtml: `${tagPill("Host", EMAIL_THEME.accent, EMAIL_THEME.accentFg)}${headline("Contest published")}${bodyCopy(body)}${cta("View match")}`,
        text: plain(["Contest created", body]),
      };
    case "lineup_out":
      return {
        subject: "Playing XI is out — Dream12",
        preheader: "Final teams published — review your picks.",
        documentTitle: "Lineup published",
        innerHtml: `${heroStrip("⚡", EMAIL_THEME.primarySoft, EMAIL_THEME.primary, `<strong>Lineup drop</strong> — time to fine-tune your fantasy XI.`)}${headline("Playing XI published")}${bodyCopy(body)}${cta("Review match")}`,
        text: plain(["Playing XI published", body]),
      };
    case "toss_result":
      return {
        subject: "Toss — Dream12",
        preheader: "Match toss update — adjust your fantasy picks if needed.",
        documentTitle: "Toss",
        innerHtml: `${heroStrip("🪙", EMAIL_THEME.accentSoft, EMAIL_THEME.accent, `<strong>Toss</strong> — lineups and strategy may shift.`)}${headline("Toss update")}${bodyCopy(body)}${cta("View match")}`,
        text: plain(["Toss update", body]),
      };
    case "contest_chatter_message":
      return {
        subject: `${title || "Contest chat"} — Dream12`,
        preheader: body.slice(0, 120),
        documentTitle: "Contest chat",
        innerHtml: `${tagPill("Chat", EMAIL_THEME.secondaryBlock, EMAIL_THEME.foreground)}${headline("New message in contest")}${bodyCopy(body)}${cta("Open chatter")}`,
        text: plain([title, body].filter(Boolean)),
      };
    case "admin_broadcast": {
      const hasHref = typeof payload.href === "string" && payload.href.trim().length > 0;
      return {
        subject: title.toLowerCase().includes("dream12") ? title : `${title} — Dream12`,
        preheader: body.slice(0, 120),
        documentTitle: title.slice(0, 80) || "Announcement",
        innerHtml: `${tagPill("News", EMAIL_THEME.primarySoft, EMAIL_THEME.primary)}${headline(title || "Announcement")}${bodyCopy(body)}${cta(hasHref ? "Open link" : "Open app")}`,
        text: plain([title, body].filter(Boolean)),
      };
    }
    case "admin_pay_in_pending": {
      const amount = formatInr(payload.amount_inr);
      const reqId = typeof payload.request_id === "string" ? payload.request_id : "—";
      return {
        subject: `[Admin] New pay-in — ${amount}`,
        preheader: "A user submitted a pay-in request.",
        documentTitle: "Admin: pay-in",
        innerHtml: `${tagPill("Admin", EMAIL_THEME.accent, EMAIL_THEME.accentFg)}${headline("New pay-in request")}${bodyCopy(body)}${adminMetaTable([
          { k: "Amount", v: amount },
          { k: "Request", v: reqId },
        ])}${cta("Review pay-ins")}`,
        text: plain(["Admin: new pay-in", body, `Amount: ${amount}`]),
      };
    }
    case "admin_pay_out_pending": {
      const amount = formatInr(payload.amount_inr);
      const upi = typeof payload.payee_upi === "string" ? payload.payee_upi : "—";
      return {
        subject: `[Admin] New pay-out — ${amount}`,
        preheader: "A user requested a withdrawal.",
        documentTitle: "Admin: pay-out",
        innerHtml: `${tagPill("Admin", EMAIL_THEME.accent, EMAIL_THEME.accentFg)}${headline("New payout request")}${bodyCopy(body)}${adminMetaTable([
          { k: "Amount", v: amount },
          { k: "Payee UPI", v: upi },
        ])}${cta("Review pay-outs")}`,
        text: plain(["Admin: new payout", body, `Amount: ${amount}`, `UPI: ${upi}`]),
      };
    }
    case "match_result": {
      const variant = resolveMatchResultVariant(title, payload);
      const rank =
        typeof payload.rank === "number"
          ? String(payload.rank)
          : typeof payload.rank === "string"
            ? payload.rank
            : null;
      const amt = payload.amount_inr;
      const won = typeof amt === "number" ? amt > 0 : typeof amt === "string" && parseFloat(amt) > 0;

      if (variant === "cancelled") {
        return {
          subject: "Contest cancelled — Dream12",
          preheader: "This contest did not run as planned.",
          documentTitle: "Contest cancelled",
          innerHtml: `${tagPill("Void", EMAIL_THEME.destructiveSoft, EMAIL_THEME.destructive)}${headline("Contest cancelled", EMAIL_THEME.destructive)}${bodyCopy(body)}${cta("Contest details")}`,
          text: plain(["Contest cancelled", body]),
        };
      }
      if (variant === "winnings" || won) {
        return {
          subject: "You won — Dream12",
          preheader: "Contest winnings credited to your wallet.",
          documentTitle: "Contest winnings",
          innerHtml: `${heroStrip("🏆", EMAIL_THEME.accentSoft, EMAIL_THEME.accent, `<strong style="color:${EMAIL_THEME.accent};">Winner</strong> — ${escapeHtml(body)}`)}${headline("Contest winnings", EMAIL_THEME.accent)}${rank ? subline(`Your rank: ${rank}`) : ""}${cta("View contest")}`,
          text: plain(["Contest winnings", body, rank ? `Rank: ${rank}` : ""]),
        };
      }
      if (variant === "finished") {
        return {
          subject: "Contest finished — Dream12",
          preheader: "Final standings are in.",
          documentTitle: "Contest finished",
          innerHtml: `${tagPill("Result", EMAIL_THEME.secondaryBlock, EMAIL_THEME.foreground)}${headline("Contest finished")}${bodyCopy(body)}${rank ? subline(`Rank ${rank}`) : ""}${cta("View contest")}`,
          text: plain(["Contest finished", body]),
        };
      }
      return {
        subject: "Contest closed — Dream12",
        preheader: "This contest has wrapped up.",
        documentTitle: "Contest closed",
        innerHtml: `${tagPill("Final", EMAIL_THEME.secondaryBlock, EMAIL_THEME.foreground)}${headline("Contest closed")}${bodyCopy(body)}${cta("View contest")}`,
        text: plain(["Contest closed", body]),
      };
    }
    default:
      return {
        subject: `${title || "Dream12"} — notification`,
        preheader: body.slice(0, 100),
        documentTitle: title || "Dream12",
        innerHtml: `${headline(title || "Update")}${body ? bodyCopy(body) : ""}${cta("Open app")}`,
        text: plain([title, body].filter(Boolean)),
      };
  }
}

/**
 * Renders branded HTML + plain text for a notification row.
 * @param appBaseUrl Public origin with no trailing slash (required for assets and CTAs).
 */
export function renderNotificationEmail(
  record: NotificationEmailRecord,
  appBaseUrl: string,
): RenderedNotificationEmail {
  const base = appBaseUrl.replace(/\/$/, "");
  const parts = buildInner(record, base);
  const html = wrapEmailBody({
    innerHtml: parts.innerHtml,
    preheader: parts.preheader,
    documentTitle: parts.documentTitle,
    appBaseUrl: base,
  });
  return { subject: parts.subject, html, text: parts.text };
}
