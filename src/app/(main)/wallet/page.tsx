import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalletRequestsTabs } from "@/components/wallet-requests-tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { safeInternalPath } from "@/lib/safe-return-to";
import { companyUpiFromEnv } from "@/lib/upi";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: returnToRaw } = await searchParams;
  const continueHref = safeInternalPath(returnToRaw ?? undefined);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_balance")
    .eq("id", user.id)
    .single();

  const balance = Number(profile?.wallet_balance ?? 0);

  const { data: payIns } = await supabase
    .from("pay_in_requests")
    .select("id,amount_inr,utr_ref,status,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: payOuts } = await supabase
    .from("pay_out_requests")
    .select("id,amount_inr,payee_upi,status,created_at,payout_utr_ref")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const company = companyUpiFromEnv();

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
      {continueHref ? (
        <Link
          href={continueHref}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "inline-flex min-h-11 w-full items-center justify-center",
          )}
        >
          Continue
        </Link>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold tabular-nums">
            ₹{balance.toFixed(2)}
          </CardTitle>
          <CardDescription>Available balance</CardDescription>
        </CardHeader>
      </Card>

      <WalletRequestsTabs
        userId={user.id}
        walletBalance={balance}
        company={company ? { vpa: company.vpa, payeeName: company.payeeName } : null}
        payInRows={(payIns ?? []).map((r) => ({
          id: r.id as string,
          amount_inr: Number(r.amount_inr),
          utr_ref: r.utr_ref as string,
          status: r.status as string,
          created_at: r.created_at as string,
        }))}
        payOutRows={(payOuts ?? []).map((r) => ({
          id: r.id as string,
          amount_inr: Number(r.amount_inr),
          payee_upi: r.payee_upi as string,
          status: r.status as string,
          created_at: r.created_at as string,
          payout_utr_ref: (r.payout_utr_ref as string | null) ?? null,
        }))}
      />
    </div>
  );
}
