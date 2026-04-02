import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listAuthUsersViaAdminRest } from "@/lib/supabase/list-auth-users-admin-rest";
import {
  authAdminEnvHints,
  quickCheckServiceRoleKey,
} from "@/lib/supabase/supabase-env-diagnostics";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AdminCreateUserForm } from "@/components/admin-create-user-form";
import { AdminUserActiveToggle } from "@/components/admin-user-active-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";

type ProfileCols = {
  id: string;
  username: string;
  avatar_url: string | null;
  wallet_balance: number;
  is_admin: boolean;
  is_active: boolean | null;
  created_at: string;
};

type TableRowModel = {
  id: string;
  username: string;
  avatar_url: string | null;
  email: string | null;
  wallet_balance: number;
  is_admin: boolean;
  is_active: boolean;
};

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/adminlogin");
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/");

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">
          Server is missing <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> or{" "}
          <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code>. Add them to{" "}
          <code className="rounded bg-muted px-1">.env.local</code> (local) or your host&apos;s secrets
          (e.g. Vercel), then restart / redeploy.
        </p>
        <p className="text-muted-foreground text-sm">
          Use the <strong>service_role</strong> key from Supabase → Project Settings → API — not the anon
          key.
        </p>
      </div>
    );
  }

  const { data: list, error: listErr } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });

  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const keyCheck = quickCheckServiceRoleKey(serviceKey);
  /** Only the anon key cannot create users via Auth Admin; listUsers can fail while createUser still works. */
  const blockCreateUser = keyCheck.jwtRole === "anon";

  type AuthRow = { id: string; email: string | null };
  let authUsers: AuthRow[] | null = null;
  let usedAuthRestFallback = false;
  let authRestFailureMessage: string | null = null;

  if (!listErr && Array.isArray(list?.users)) {
    authUsers = list.users.map((u) => ({ id: u.id, email: u.email ?? null }));
  } else {
    const rest = await listAuthUsersViaAdminRest(publicUrl, serviceKey);
    if (rest.ok) {
      authUsers = rest.users;
      usedAuthRestFallback = true;
    } else {
      authRestFailureMessage = rest.message;
    }
  }

  let rows: TableRowModel[] = [];
  const authAdminListOk = authUsers !== null;
  let banner: ReactNode = null;

  if (authUsers !== null) {
    const ids = authUsers.map((u) => u.id);
    const { data: profiles } =
      ids.length > 0
        ? await service
            .from("profiles")
            .select("id,username,avatar_url,wallet_balance,is_admin,is_active,created_at")
            .in("id", ids)
        : { data: [] as ProfileCols[] };

    const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    rows = authUsers.map((u) => {
      const p = profById.get(u.id);
      return {
        id: u.id,
        username: p?.username ?? "—",
        avatar_url: (p?.avatar_url as string | null) ?? null,
        email: u.email,
        wallet_balance: Number(p?.wallet_balance ?? 0),
        is_admin: Boolean(p?.is_admin),
        is_active: p?.is_active !== false,
      };
    });

    if (usedAuthRestFallback && listErr) {
      banner = (
        <div className="border-primary/30 bg-primary/5 text-foreground rounded-md border px-3 py-2 text-xs leading-relaxed">
          <span className="font-medium">Auth list fallback</span> — Supabase JS{" "}
          <code className="rounded bg-muted px-1">listUsers</code> failed (
          {listErr.message}), but the same GoTrue admin endpoint returned users. Create user should work; if
          it does not, create accounts in Supabase → Authentication → Users or upgrade{" "}
          <code className="rounded bg-muted px-1">@supabase/supabase-js</code>.
        </div>
      );
    }
  } else {
    const { data: profiles, error: profErr } = await service
      .from("profiles")
      .select("id,username,avatar_url,wallet_balance,is_admin,is_active,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (profErr) {
      return (
        <div className="space-y-3">
          <p className="text-destructive text-sm">
            Failed to list users: {listErr?.message ?? "Auth admin list failed"}. Profiles fallback also
            failed: {profErr.message}
          </p>
          <p className="text-muted-foreground text-sm">
            Confirm <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> is the
            service_role secret from Supabase → Settings → API, then redeploy. Using the anon key or a wrong
            project URL causes this.
          </p>
        </div>
      );
    }

    rows = (profiles ?? []).map((p) => ({
      id: p.id as string,
      username: p.username,
      avatar_url: (p.avatar_url as string | null) ?? null,
      email: null,
      wallet_balance: Number(p.wallet_balance ?? 0),
      is_admin: Boolean(p.is_admin),
      is_active: p.is_active !== false,
    }));

    const combinedMsg = [
      listErr?.message && `SDK: ${listErr.message}`,
      authRestFailureMessage && `REST: ${authRestFailureMessage}`,
    ]
      .filter(Boolean)
      .join(" · ");

    const hintLines = authAdminEnvHints({
      supabaseUrl: publicUrl,
      serviceRoleKey: serviceKey,
      listErrorMessage: combinedMsg || "Could not list auth users.",
    });

    const bannerTone =
      keyCheck.jwtRole === "anon"
        ? "border-destructive/60 bg-destructive/10 text-destructive-foreground"
        : "border-amber-500/40 bg-amber-950/25 text-amber-100";

    banner = (
      <div className={cn("rounded-md border px-3 py-2 text-sm", bannerTone)}>
        <p className="font-medium">
          Auth Admin API unavailable
          {keyCheck.looksLikeJwt && keyCheck.jwtRole ? (
            <span className="text-foreground/80 ml-2 font-mono text-xs font-normal normal-case">
              — JWT role in env: {keyCheck.jwtRole}
            </span>
          ) : !keyCheck.looksLikeJwt ? (
            <span className="text-foreground/80 ml-2 text-xs font-normal normal-case">
              — key is not a legacy JWT
            </span>
          ) : null}
        </p>
        <p
          className={cn(
            "mt-1 text-xs leading-relaxed opacity-90",
            keyCheck.jwtRole === "anon" ? "text-foreground/90" : "text-amber-100/85",
          )}
        >
          Showing <strong>profiles</strong> only — the email column stays empty until Auth&apos;s list-users
          API works again.
        </p>
        {keyCheck.jwtRole === "service_role" ? (
          <p
            className={cn(
              "mt-2 text-xs leading-relaxed opacity-95",
              "text-amber-100/90",
            )}
          >
            <strong>Create user</strong> below stays enabled: it uses a different Auth Admin call and
            sometimes succeeds when listing returns “Database error finding users”.
          </p>
        ) : null}
        <ul
          className={cn(
            "mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed",
            keyCheck.jwtRole === "anon" ? "text-foreground/85" : "text-amber-100/90",
          )}
        >
          {hintLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {banner}
      <AdminCreateUserForm
        authAdminBlocked={blockCreateUser}
        authAdminBlockedReason={
          blockCreateUser
            ? "Replace SUPABASE_SERVICE_ROLE_KEY with a JWT whose payload role is service_role (not anon), then restart dev."
            : undefined
        }
        authCreateNote={
          !authAdminListOk && !blockCreateUser
            ? "Auth user list is down, but your key is service_role — try Create user. If it errors, add users in Supabase → Authentication → Users."
            : undefined
        }
      />
      <div className="relative rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex min-w-0 max-w-[220px] items-center gap-2">
                    <UserAvatar
                      avatarUrl={r.avatar_url}
                      username={r.username}
                      userIdFallback={r.id}
                      size="sm"
                    />
                    <span className="truncate font-medium">{r.username}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-sm">
                  {r.email ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">₹{r.wallet_balance.toFixed(2)}</TableCell>
                <TableCell>
                  {r.is_admin ? (
                    <Badge>Admin</Badge>
                  ) : (
                    <Badge variant="secondary">User</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right align-top">
                  <AdminUserActiveToggle
                    userId={r.id}
                    isActive={r.is_active}
                    currentAdminId={user.id}
                    layout="table"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/admin/users/${r.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-9")}
                  >
                    Manage
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
