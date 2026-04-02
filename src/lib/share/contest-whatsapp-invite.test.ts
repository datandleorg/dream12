import { describe, expect, it } from "vitest";
import {
  buildContestWhatsAppInviteMessage,
  buildWhatsAppShareUrl,
  matchLabelFromMatchCard,
  normalizeContestUrlForShare,
} from "@/lib/share/contest-whatsapp-invite";

describe("matchLabelFromMatchCard", () => {
  it("uses team_a and team_b when both set", () => {
    expect(
      matchLabelFromMatchCard({
        team_a: "KKR",
        team_b: "SRH",
        name: "ignored",
      }),
    ).toBe("KKR vs SRH");
  });

  it("parses name when teams missing", () => {
    expect(
      matchLabelFromMatchCard({
        team_a: null,
        team_b: null,
        name: "Alpha vs Beta",
      }),
    ).toBe("Alpha vs Beta");
  });
});

describe("normalizeContestUrlForShare", () => {
  it("trims and strips zero-width space", () => {
    expect(normalizeContestUrlForShare("  https://x.com/y\u200b  ")).toBe("https://x.com/y");
  });

  it("adds https when scheme missing", () => {
    expect(normalizeContestUrlForShare("example.com/p")).toBe("https://example.com/p");
  });
});

describe("buildContestWhatsAppInviteMessage", () => {
  it("puts bare https URL first and last for WhatsApp linkify; includes details", () => {
    const url = "https://example.com/contests/abc-123";
    const msg = buildContestWhatsAppInviteMessage({
      contestTitle: "Mega H2H",
      matchLabel: "KKR vs SRH",
      entryFee: 49,
      prizePool: 10000,
      contestUrl: url,
    });
    expect(msg.startsWith(`${url}\n`)).toBe(true);
    expect(msg.endsWith(url)).toBe(true);
    expect(msg).toContain('Contest: "Mega H2H"');
    expect(msg).toContain("Match:");
    expect(msg).toContain("KKR vs SRH");
    expect(msg).toContain("Entry: ₹49");
    expect(msg).toContain("Prize pool: ₹10,000");
    expect(msg).toContain("think you can beat me?");
    expect(msg).toContain("Tap a link to open Dream12");
  });
});

describe("buildWhatsAppShareUrl", () => {
  it("wraps text in wa.me query", () => {
    const url = buildWhatsAppShareUrl("hello world");
    expect(url).toBe("https://wa.me/?text=" + encodeURIComponent("hello world"));
  });
});
