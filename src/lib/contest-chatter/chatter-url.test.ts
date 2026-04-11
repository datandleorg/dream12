import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMatchStatusOpenForContestChatter } from "@/lib/contest-chatter/constants";
import { isChatterVoiceUrlAllowedForContest } from "@/lib/storage/do-spaces";

describe("isMatchStatusOpenForContestChatter", () => {
  it("allows live and upcoming", () => {
    expect(isMatchStatusOpenForContestChatter("live")).toBe(true);
    expect(isMatchStatusOpenForContestChatter("upcoming")).toBe(true);
  });
  it("blocks completed and in_review", () => {
    expect(isMatchStatusOpenForContestChatter("completed")).toBe(false);
    expect(isMatchStatusOpenForContestChatter("in_review")).toBe(false);
  });
});

const ENV_KEYS = ["DO_SPACES_ENDPOINT", "DO_SPACES_BUCKET", "DO_SPACES_PUBLIC_ORIGIN"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

describe("isChatterVoiceUrlAllowedForContest", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
    }
    process.env.DO_SPACES_ENDPOINT = "https://nyc3.digitaloceanspaces.com";
    process.env.DO_SPACES_BUCKET = "mybucket";
    delete process.env.DO_SPACES_PUBLIC_ORIGIN;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = savedEnv[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const publicBase = "https://mybucket.nyc3.digitaloceanspaces.com";

  it("rejects wrong contest id segment", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(
      isChatterVoiceUrlAllowedForContest(
        `${publicBase}/contest-chatter/bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee/f.webm`,
        id,
      ),
    ).toBe(false);
  });

  it("accepts HTTPS URL under contest-chatter/{contestId}/", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(
      isChatterVoiceUrlAllowedForContest(
        `${publicBase}/contest-chatter/${id}/abc.webm`,
        id,
      ),
    ).toBe(true);
  });
});
