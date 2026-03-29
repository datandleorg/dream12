/**
 * Server-only: list auth users via GoTrue HTTP API.
 * Some projects see `auth.admin.listUsers` fail with "Database error finding users" while the same
 * endpoint works over fetch (SDK / client version quirks).
 */

export type AuthAdminUserRow = { id: string; email: string | null };

export type ListAuthUsersRestResult =
  | { ok: true; users: AuthAdminUserRow[] }
  | { ok: false; message: string };

export async function listAuthUsersViaAdminRest(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<ListAuthUsersRestResult> {
  const base = supabaseUrl.trim().replace(/\/$/, "");
  if (!base || !serviceRoleKey.trim()) {
    return { ok: false, message: "Missing Supabase URL or service role key" };
  }

  const url = `${base}/auth/v1/admin/users?page=1&per_page=500`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey.trim(),
        Authorization: `Bearer ${serviceRoleKey.trim()}`,
      },
      cache: "no-store",
    });

    const raw = await res.text();
    if (!res.ok) {
      let msg = raw || `${res.status} ${res.statusText}`;
      try {
        const j = JSON.parse(raw) as { error?: string; msg?: string; message?: string };
        msg = j.msg ?? j.message ?? j.error ?? msg;
      } catch {
        /* keep msg */
      }
      return { ok: false, message: msg };
    }

    const body = JSON.parse(raw) as {
      users?: Array<{ id?: string; email?: string | null }>;
    };
    const users = (body.users ?? [])
      .filter((u): u is { id: string; email?: string | null } => typeof u.id === "string")
      .map((u) => ({ id: u.id, email: u.email ?? null }));

    return { ok: true, users };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
