import { redirect } from "next/navigation";
import { AdminPayInTable } from "@/components/admin-pay-in-table";
import { requireAdminSession } from "@/lib/admin-server";

export const dynamic = "force-dynamic";

export default async function AdminPayInRequestsPage() {
  const gate = await requireAdminSession();
  if (!gate.ok) redirect("/");

  const {
    data: rows,
    error: rowsError,
  } = await gate.supabase
    .from("pay_in_requests")
    .select("id,user_id,amount_inr,utr_ref,status,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: namesRaw, error: namesError } =
    userIds.length === 0
      ? { data: [] as { id: string; username: string; avatar_url: string | null }[], error: null }
      : await gate.supabase
          .from("profile_usernames")
          .select("id,username,avatar_url")
          .in("id", userIds);
  const names = namesRaw ?? [];

  const profileById = new Map(
    names.map((n) => [
      n.id as string,
      {
        username: n.username as string,
        avatar_url: (n.avatar_url as string | null) ?? null,
      },
    ]),
  );

  const loadError = rowsError?.message ?? namesError?.message ?? null;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Approve after matching UTR to your bank/UPI statement. Credits the user wallet.
      </p>
      {loadError ? (
        <p className="text-destructive text-sm" role="alert">
          Could not load pay-in requests: {loadError}
        </p>
      ) : null}
      <AdminPayInTable
        rows={
          rows?.map((r) => ({
            id: r.id as string,
            user_id: r.user_id as string,
            username: profileById.get(r.user_id as string)?.username ?? null,
            avatar_url: profileById.get(r.user_id as string)?.avatar_url ?? null,
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
