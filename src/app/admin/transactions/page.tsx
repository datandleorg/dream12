import { createClient } from "@/lib/supabase/server";
import { AdminTransactionTable } from "@/components/admin-transaction-table";

export default async function AdminTransactionsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("transactions")
    .select("id,user_id,amount,utr_number,status,created_at,source,razorpay_payment_id")
    .order("created_at", { ascending: false })
    .limit(100);

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  const { data: names } = await supabase
    .from("profile_usernames")
    .select("id,username")
    .in("id", userIds);

  const nameById = new Map(
    (names ?? []).map((n) => [n.id, n.username as string]),
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Legacy <code className="text-xs">transactions</code> rows (manual UTR / Razorpay history).
        New top-ups use{" "}
        <a href="/admin/pay-in-requests" className="text-accent underline underline-offset-4">
          Pay-in requests
        </a>
        .
      </p>
      <AdminTransactionTable
        rows={
          rows?.map((r) => ({
            id: r.id as string,
            user_id: r.user_id as string,
            username: nameById.get(r.user_id as string) ?? null,
            amount: Number(r.amount),
            utr_number: (r.utr_number as string | null) ?? null,
            source: (r.source as string | null) ?? "manual_utr",
            razorpay_payment_id: (r.razorpay_payment_id as string | null) ?? null,
            status: r.status as string,
            created_at: r.created_at as string,
          })) ?? []
        }
      />
    </div>
  );
}
