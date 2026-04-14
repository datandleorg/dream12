/** Query key used to return to a page (e.g. contest detail Teams tab) after squad flow. */
export const TEAM_FLOW_RETURN_PARAM = "return";

export function contestTeamsTabPath(contestId: string): string {
  return `/contests/${contestId}?tab=teams`;
}

function isSafeContestReturnPath(decoded: string): boolean {
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return false;
  if (decoded.includes("://")) return false;
  return /^\/contests\/[^/?#]+/.test(decoded);
}

function matchesExpectedContest(decoded: string, contestId: string): boolean {
  const m = decoded.match(/^\/contests\/([^/?#]+)/);
  return Boolean(m && m[1] === contestId);
}

/**
 * Validates a return path for post-team-flow navigation. Only same-app contest URLs are allowed.
 */
export function parseTeamFlowReturnPath(
  sp: Record<string, string | string[] | undefined> | undefined,
  opts?: { expectedContestId?: string },
): string | null {
  if (!sp) return null;
  const raw = sp[TEAM_FLOW_RETURN_PARAM];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || typeof v !== "string") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(v.trim());
  } catch {
    return null;
  }
  if (!isSafeContestReturnPath(decoded)) return null;
  if (
    opts?.expectedContestId &&
    !matchesExpectedContest(decoded, opts.expectedContestId)
  ) {
    return null;
  }
  return decoded;
}

export function appendTeamFlowReturnQuery(
  href: string,
  returnPath: string | null | undefined,
): string {
  if (!returnPath) return href;
  const enc = encodeURIComponent(returnPath);
  return href.includes("?")
    ? `${href}&${TEAM_FLOW_RETURN_PARAM}=${enc}`
    : `${href}?${TEAM_FLOW_RETURN_PARAM}=${enc}`;
}

/** For client components reading `useSearchParams().get("return")`. */
export function parseTeamFlowReturnParamValue(
  raw: string | null,
  opts?: { expectedContestId?: string },
): string | null {
  if (!raw) return null;
  return parseTeamFlowReturnPath({ [TEAM_FLOW_RETURN_PARAM]: raw }, opts);
}
