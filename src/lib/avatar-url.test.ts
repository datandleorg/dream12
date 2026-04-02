import { describe, expect, it } from "vitest";
import {
  initialsFromUsername,
  userProfileAvatarUrl,
} from "@/lib/avatar-url";

describe("initialsFromUsername", () => {
  it("returns two letters from first two word parts", () => {
    expect(initialsFromUsername("john doe")).toBe("JD");
    expect(initialsFromUsername("alpha beta")).toBe("AB");
  });

  it("returns first two chars for single token", () => {
    expect(initialsFromUsername("playerone")).toBe("PL");
  });

  it("handles empty", () => {
    expect(initialsFromUsername(null)).toBe("?");
    expect(initialsFromUsername("   ")).toBe("?");
  });
});

describe("userProfileAvatarUrl", () => {
  it("prefers non-empty avatar URL", () => {
    expect(userProfileAvatarUrl("https://b.example.com/a.jpg", "x")).toBe(
      "https://b.example.com/a.jpg",
    );
  });

  it("trims avatar URL", () => {
    expect(userProfileAvatarUrl("  https://b.example.com/a.jpg  ", "x")).toBe(
      "https://b.example.com/a.jpg",
    );
  });

  it("falls back to ui-avatars when no avatar", () => {
    const u = userProfileAvatarUrl(null, "TestUser");
    expect(u).toContain("ui-avatars.com");
    expect(u).toContain(encodeURIComponent("TestUser"));
  });
});
