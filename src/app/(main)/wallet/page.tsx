import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalletPayInSection } from "@/components/wallet-pay-in";
import { WalletPayOutSection } from "@/components/wallet-pay-out";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

      <Card>
        <CardHeader>
          <CardTitle>Add money (UPI)</CardTitle>
          <CardDescription>
            Pay the company UPI ID, then submit your reference for admin approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!company ? (
            <p className="text-muted-foreground text-sm">
              Wallet top-up is not configured yet. Set{" "}
              <code className="text-xs">NEXT_PUBLIC_COMPANY_UPI_VPA</code> in the environment.
            </p>
          ) : (
            <WalletPayInSection
              userId={user.id}
              companyVpa={company.vpa}
              companyPayeeName={company.payeeName}
              initialRows={
                (payIns ?? []).map((r) => ({
                  id: r.id as string,
                  amount_inr: Number(r.amount_inr),
                  utr_ref: r.utr_ref as string,
                  status: r.status as string,
                  created_at: r.created_at as string,
                }))
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdraw (UPI payout)</CardTitle>
          <CardDescription>
            Request a payout to your UPI ID. An admin will approve and send funds from the company
            account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WalletPayOutSection
            userId={user.id}
            walletBalance={balance}
            initialRows={
              (payOuts ?? []).map((r) => ({
                id: r.id as string,
                amount_inr: Number(r.amount_inr),
                payee_upi: r.payee_upi as string,
                status: r.status as string,
                created_at: r.created_at as string,
                payout_utr_ref: (r.payout_utr_ref as string | null) ?? null,
              }))
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
