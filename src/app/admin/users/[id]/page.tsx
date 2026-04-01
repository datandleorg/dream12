import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminUserManage } from "@/components/admin-user-manage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/adminlogin");
  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) redirect("/");

  const service = createServiceClient();
  const { data: authData, error: authErr } = await service.auth.admin.getUserById(id);
  if (authErr || !authData?.user) notFound();

  const { data: profile } = await service
    .from("profiles")
    .select("username,wallet_balance,is_admin,is_active")
    .eq("id", id)
    .single();

  const { data: payIns } = await supabase
    .from("pay_in_requests")
    .select("id,amount_inr,utr_ref,status,created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: payOuts } = await supabase
    .from("pay_out_requests")
    .select("id,amount_inr,payee_upi,status,created_at,payout_utr_ref")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-10">
      <AdminUserManage
        userId={id}
        currentAdminId={user.id}
        email={authData.user.email ?? ""}
        username={profile?.username ?? ""}
        walletBalance={Number(profile?.wallet_balance ?? 0)}
        isAdmin={profile?.is_admin ?? false}
        isActive={profile?.is_active !== false}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pay-in requests</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payIns ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-sm">
                    None
                  </TableCell>
                </TableRow>
              ) : (
                (payIns ?? []).map((r) => (
                  <TableRow key={r.id as string}>
                    <TableCell className="tabular-nums">
                      ₹{Number(r.amount_inr).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.utr_ref as string}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status as string}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(r.created_at as string).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pay-out requests</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>UPI</TableHead>
                <TableHead>Payout ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payOuts ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    None
                  </TableCell>
                </TableRow>
              ) : (
                (payOuts ?? []).map((r) => (
                  <TableRow key={r.id as string}>
                    <TableCell className="tabular-nums">
                      ₹{Number(r.amount_inr).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.payee_upi as string}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {(r.payout_utr_ref as string | null) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status as string}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(r.created_at as string).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <p>
        <Link
          href="/admin/pay-in-requests"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
        >
          All pay-in queue
        </Link>
        {" · "}
        <Link
          href="/admin/pay-out-requests"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
        >
          All pay-out queue
        </Link>
      </p>
    </div>
  );
}
