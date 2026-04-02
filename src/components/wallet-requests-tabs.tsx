"use client";

import { WalletPayInSection } from "@/components/wallet-pay-in";
import { WalletPayOutSection } from "@/components/wallet-pay-out";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Full-width segmented control (Add money / Withdraw).
 * Overrides default TabsList `inline-flex w-fit` + fixed `h-8` so both segments are equal and flush.
 */
const walletSegmentList = cn(
  "!grid !h-auto min-h-[2.75rem] w-full grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/60 p-1",
  "shadow-[inset_0_1px_2px_hsl(0_0%_0%/0.08)] dark:bg-muted/50 dark:shadow-[inset_0_1px_3px_hsl(0_0%_0%/0.35)]",
  "items-stretch justify-stretch",
);

const walletSegmentTrigger = cn(
  "relative flex h-full min-h-[2.5rem] w-full touch-manipulation items-center justify-center rounded-lg px-2 py-2 text-sm font-semibold",
  "transition-[color,background-color,box-shadow,transform,opacity] duration-100",
  "active:scale-[0.98] motion-reduce:active:scale-100 not-data-active:active:bg-muted/50 dark:not-data-active:active:bg-muted/35 data-active:active:bg-primary/90",
  "!shadow-none",
  // Inactive: readable on track (not washed out)
  "text-foreground/70 hover:text-foreground hover:bg-muted/40 dark:text-foreground/75 dark:hover:bg-muted/30",
  // Active: brand primary (matches app accent / other selected tabs)
  "data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm",
  "dark:data-active:bg-primary dark:data-active:text-primary-foreground",
  // Remove default tabs underline / border noise
  "border-0 after:hidden",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

export type WalletPayInRow = {
  id: string;
  amount_inr: number;
  utr_ref: string;
  status: string;
  created_at: string;
};

export type WalletPayOutRow = {
  id: string;
  amount_inr: number;
  payee_upi: string;
  status: string;
  created_at: string;
  payout_utr_ref: string | null;
};

export function WalletRequestsTabs({
  userId,
  walletBalance,
  company,
  payInRows,
  payOutRows,
}: {
  userId: string;
  walletBalance: number;
  company: { vpa: string; payeeName: string } | null;
  payInRows: WalletPayInRow[];
  payOutRows: WalletPayOutRow[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Requests</CardTitle>
        <CardDescription>Add money or withdraw; track status below each form.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="payin" className="w-full">
          <TabsList variant="line" className={walletSegmentList}>
            <TabsTrigger value="payin" className={walletSegmentTrigger}>
              Add money
            </TabsTrigger>
            <TabsTrigger value="payout" className={walletSegmentTrigger}>
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payin" className="mt-4 space-y-3">
            <p className="text-muted-foreground text-sm">
              Pay the company UPI ID from any UPI app, then submit the amount and transaction reference for
              admin approval.
            </p>
            {!company ? (
              <p className="text-muted-foreground text-sm">
                Wallet top-up is not configured yet. Set{" "}
                <code className="text-xs">NEXT_PUBLIC_COMPANY_UPI_VPA</code> in the environment.
              </p>
            ) : (
              <WalletPayInSection
                userId={userId}
                companyVpa={company.vpa}
                companyPayeeName={company.payeeName}
                initialRows={payInRows}
              />
            )}
          </TabsContent>

          <TabsContent value="payout" className="mt-4 space-y-3">
            <p className="text-muted-foreground text-sm">
              Request a payout to your UPI ID. An admin will approve and send funds from the company
              account.
            </p>
            <WalletPayOutSection
              userId={userId}
              walletBalance={walletBalance}
              initialRows={payOutRows}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
