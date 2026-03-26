import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WalletForm } from "@/components/wallet-form";
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

  const balance = profile?.wallet_balance ?? 0;

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
            ₹{Number(balance).toFixed(2)}
          </CardTitle>
          <CardDescription>Available balance</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add money</CardTitle>
          <CardDescription>
            Scan the UPI QR, pay, then submit your UTR below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted relative mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-lg border">
            {/* Replace with /upi-qr.png in public/ for production */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/upi-qr-placeholder.svg"
              alt="UPI QR code"
              width={240}
              height={240}
              className="object-contain p-4"
            />
          </div>
          <WalletForm userId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
