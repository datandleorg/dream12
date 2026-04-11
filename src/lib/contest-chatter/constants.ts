/**
 * Match statuses where paid entrants may post chatter.
 * Includes `upcoming` temporarily so staging/testing can exercise messaging before go-live.
 */
export const CONTEST_CHATTER_POSTING_STATUSES = ["live", "upcoming"] as const;

export function isMatchStatusOpenForContestChatter(status: string): boolean {
  const s = String(status).toLowerCase();
  return (CONTEST_CHATTER_POSTING_STATUSES as readonly string[]).includes(s);
}

/** Max recording length for contest voice chatter (seconds). Enforced client + server + presign size budget. */
export const MAX_CONTEST_CHATTER_VOICE_SECONDS = 30;

/** Max characters for a text chatter message. */
export const MAX_CONTEST_CHATTER_TEXT_CHARS = 500;

/** Max posts per user per contest per rolling minute (text + voice combined). */
export const MAX_CONTEST_CHATTER_POSTS_PER_MINUTE = 12;

/**
 * Upper bound for presigned voice upload (bytes). ~32kb/s * 30s ≈ 960KB; round to 1 MiB.
 */
export const MAX_CONTEST_CHATTER_VOICE_BYTES = 1024 * 1024;
