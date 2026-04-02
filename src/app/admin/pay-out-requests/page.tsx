import { createClient } from "@/lib/supabase/server";
import { AdminPayOutTable } from "@/components/admin-pay-out-table";

export default async function AdminPayOutRequestsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("pay_out_requests")
    .select("id,user_id,amount_inr,payee_upi,status,created_at,payout_utr_ref")
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: names } = await supabase
    .from("profile_usernames")
    .select("id,username,avatar_url")
    .in("id", userIds);

  const profileById = new Map(
    (names ?? []).map((n) => [
      n.id as string,
      {
        username: n.username as string,
        avatar_url: (n.avatar_url as string | null) ?? null,
      },
    ]),
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Send via Open UPI first, then paste the payout UTR / transaction ID from your bank app. Approve
        only after a valid reference is entered — it is stored for audit.
      </p>
      <AdminPayOutTable
        rows={
          rows?.map((r) => ({
            id: r.id as string,
            user_id: r.user_id as string,
            username: profileById.get(r.user_id as string)?.username ?? null,
            avatar_url: profileById.get(r.user_id as string)?.avatar_url ?? null,
            amount_inr: Number(r.amount_inr),
            payee_upi: r.payee_upi as string,
            status: r.status as string,
            created_at: r.created_at as string,
            payout_utr_ref: (r.payout_utr_ref as string | null) ?? null,
          })) ?? []
        }
      />
    </div>
  );
}
