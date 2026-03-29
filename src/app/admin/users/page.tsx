import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AdminCreateUserForm } from "@/components/admin-create-user-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

  const service = createServiceClient();
  const { data: list, error } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (error) {
    return (
      <p className="text-destructive text-sm">
        Failed to list users: {error.message}. Check SUPABASE_SERVICE_ROLE_KEY.
      </p>
    );
  }

  const ids = (list?.users ?? []).map((u) => u.id);
  const { data: profiles } =
    ids.length > 0
      ? await service
          .from("profiles")
          .select("id,username,wallet_balance,is_admin,created_at")
          .in("id", ids)
      : { data: [] as { id: string; username: string; wallet_balance: number; is_admin: boolean; created_at: string }[] };

  const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return (
    <div className="space-y-6">
      <AdminCreateUserForm />
      <div className="relative rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list?.users ?? []).map((u) => {
              const p = profById.get(u.id);
              return (
                <TableRow key={u.id}>
                  <TableCell>{p?.username ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {u.email ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    ₹{Number(p?.wallet_balance ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {p?.is_admin ? (
                      <Badge>Admin</Badge>
                    ) : (
                      <Badge variant="secondary">User</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-9")}
                    >
                      Manage
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
