import { createClient } from "@/lib/supabase/server";
import { AdminPayInTable } from "@/components/admin-pay-in-table";

export default async function AdminPayInRequestsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("pay_in_requests")
    .select("id,user_id,amount_inr,utr_ref,status,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: names } = await supabase
    .from("profile_usernames")
    .select("id,username")
    .in("id", userIds);

  const nameById = new Map(
    (names ?? []).map((n) => [n.id as string, n.username as string]),
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Approve after matching UTR to your bank/UPI statement. Credits the user wallet.
      </p>
      <AdminPayInTable
        rows={
          rows?.map((r) => ({
            id: r.id as string,
            user_id: r.user_id as string,
            username: nameById.get(r.user_id as string) ?? null,
            amount_inr: Number(r.amount_inr),
            utr_ref: r.utr_ref as string,
            status: r.status as string,
            created_at: r.created_at as string,
          })) ?? []
        }
      />
    </div>
  );
}
