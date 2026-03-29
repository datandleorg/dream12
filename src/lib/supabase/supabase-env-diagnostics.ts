/**
 * Server-only helpers to explain common Supabase env mistakes (no verification — JWT payload only).
 */

/** e.g. `abcdefgh` from `https://abcdefgh.supabase.co` */
export function supabaseProjectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

type JwtPayload = { ref?: string; role?: string };

export function decodeSupabaseJwtPayload(jwt: string): JwtPayload | null {
  const parts = jwt.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Project ref from a Supabase API JWT (anon or service_role). */
export function projectRefFromSupabaseKey(key: string): string | null {
  const p = decodeSupabaseJwtPayload(key);
  return typeof p?.ref === "string" ? p.ref : null;
}

export function jwtRoleFromSupabaseKey(key: string): string | null {
  const p = decodeSupabaseJwtPayload(key);
  return typeof p?.role === "string" ? p.role : null;
}

/** True if the env value parses as a 3-part JWT (legacy Supabase keys). */
export function looksLikeSupabaseJwt(key: string): boolean {
  const p = key.trim().split(".");
  return p.length === 3 && p.every((s) => s.length > 0);
}

export type AuthKeyQuickCheck = {
  looksLikeJwt: boolean;
  jwtRole: string | null;
};

/** What this app can infer from SUPABASE_SERVICE_ROLE_KEY without calling Supabase. */
export function quickCheckServiceRoleKey(key: string): AuthKeyQuickCheck {
  const looksLikeJwt = looksLikeSupabaseJwt(key);
  return {
    looksLikeJwt,
    jwtRole: looksLikeJwt ? jwtRoleFromSupabaseKey(key) : null,
  };
}

/**
 * Human-readable hints when Auth Admin fails but env vars exist.
 */
export function authAdminEnvHints(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  listErrorMessage: string;
}): string[] {
  const { supabaseUrl, serviceRoleKey, listErrorMessage } = options;
  const lines: string[] = [];

  const urlRef = supabaseProjectRefFromUrl(supabaseUrl);
  const keyRef = projectRefFromSupabaseKey(serviceRoleKey);
  const role = jwtRoleFromSupabaseKey(serviceRoleKey);
  const isJwt = looksLikeSupabaseJwt(serviceRoleKey);

  if (role === "anon") {
    lines.push(
      "Wrong key: this JWT is **anon** (the public key). Legacy API Keys can show two similar strings — copy only the value under **service_role** after Reveal, or use **Publishable and secret API keys** if your project docs say the server **Secret** replaces `service_role`. Paste the middle JWT segment into jwt.io and confirm the payload says `\"role\":\"service_role\"`, not `\"role\":\"anon\"`.",
    );
  }

  lines.push(`Auth Admin API failed: ${listErrorMessage}.`);

  if (!isJwt) {
    lines.push(
      "This value is not a legacy JWT (three dot-separated segments). Supabase now has a **Publishable and secret API keys** tab: use the **Secret** key only where your Supabase docs say it replaces `service_role` for server/admin. If Auth Admin still fails, switch to the **Legacy anon, service_role** tab and paste the long JWT shown only under **service_role** (after Reveal).",
    );
  }

  if (role && role !== "service_role" && role !== "anon" && isJwt) {
    lines.push(
      `Your key JWT role is “${role}”, not “service_role”. Use the service_role secret from Supabase → Settings → API.`,
    );
  }

  if (urlRef && keyRef && urlRef !== keyRef) {
    lines.push(
      `Project mismatch: NEXT_PUBLIC_SUPABASE_URL points at project “${urlRef}” but the service key is for “${keyRef}”. Copy the service_role key from that same project in the dashboard.`,
    );
  }

  lines.push(
    "Next.js loads env only when the server process starts — stop dev and run npm run dev again after changing .env or .env.local.",
  );

  if (/database error/i.test(listErrorMessage)) {
    if (role === "service_role") {
      lines.push(
        "Your key is a real **service_role** JWT. If both our SDK and REST calls return “Database error finding users”, the failure is on Supabase’s Auth service/DB for this project (not a wrong key in this app). Open **Authentication → Users** in the dashboard: if that page errors too, contact Supabase support with your project ref and that exact error text.",
      );
    } else {
      lines.push(
        "If **Authentication → Users** in the dashboard also fails, the project’s Auth backend may be unhealthy (check status.supabase.com). If the dashboard works, fix the key (see above) and ensure `NEXT_PUBLIC_SUPABASE_URL` is `https://<project-ref>.supabase.co`.",
      );
    }
  }

  return lines;
}
