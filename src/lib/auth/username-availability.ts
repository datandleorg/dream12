/**
 * Username availability via same-origin API route (service role on server).
 * Does not depend on PostgREST exposing `username_is_available` RPC or `profile_usernames` view.
 */
export async function checkUsernameAvailable(
  usernameNormalized: string,
): Promise<{ available: boolean; error?: string }> {
  const res = await fetch(
    `/api/auth/username-available?username=${encodeURIComponent(usernameNormalized)}`,
    { method: "GET", credentials: "same-origin" },
  );

  let json: { available?: boolean; error?: string } = {};
  try {
    json = (await res.json()) as { available?: boolean; error?: string };
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    return {
      available: false,
      error:
        json.error ??
        `Could not verify username (${res.status}). Check SUPABASE_SERVICE_ROLE_KEY on the server.`,
    };
  }

  return { available: Boolean(json.available), error: json.error };
}
