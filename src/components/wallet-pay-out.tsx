"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UpiAppPickerButton } from "@/components/upi-app-picker-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";

type Row = {
  id: string;
  amount_inr: number;
  payee_upi: string;
  status: string;
  created_at: string;
  payout_utr_ref: string | null;
};

const upiLike = /^[^\s@]+@[^\s@]+$/;

export function WalletPayOutSection({
  userId,
  walletBalance,
  initialRows,
}: {
  userId: string;
  walletBalance: number;
  initialRows: Row[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [payeeUpi, setPayeeUpi] = useState("");
  const [userNote, setUserNote] = useState("");
  const [loading, setLoading] = useState(false);

  const previewPayParams = useMemo(() => {
    const amt = amount.trim() ? Number(amount) : NaN;
    const vpa = payeeUpi.trim();
    if (!Number.isFinite(amt) || amt <= 0 || !upiLike.test(vpa)) return null;
    return {
      payeeVpa: vpa,
      payeeName: "User",
      amountInr: amt,
      transactionNote: "Dream12 payout",
    };
  }, [amount, payeeUpi]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = amount.trim() ? Number(amount) : 0;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amt > walletBalance) {
      toast.error("Amount exceeds wallet balance");
      return;
    }
    const vpa = payeeUpi.trim();
    if (!upiLike.test(vpa)) {
      toast.error("Enter a valid UPI ID (e.g. name@bank)");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("pay_out_requests").insert({
      user_id: userId,
      amount_inr: amt,
      payee_upi: vpa,
      user_note: userNote.trim() || null,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payout request submitted");
    setAmount("");
    setPayeeUpi("");
    setUserNote("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <LoadingOverlay show={loading} label="Submitting…" />
      <p className="text-muted-foreground text-sm">
        After approval, we will use your UPI ID below. You can open the intent link to confirm the
        destination in your UPI app.
      </p>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="payout-amount">Amount (₹)</Label>
          <Input
            id="payout-amount"
            type="number"
            step="0.01"
            min="0"
            className="min-h-11"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payout-upi">Your UPI ID</Label>
          <Input
            id="payout-upi"
            className="min-h-11"
            value={payeeUpi}
            onChange={(e) => setPayeeUpi(e.target.value)}
            placeholder="you@paytm"
            autoComplete="off"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payout-note">Note (optional)</Label>
          <Input
            id="payout-note"
            className="min-h-11"
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
          />
        </div>
        <UpiAppPickerButton
          payParams={previewPayParams}
          className="w-full"
          title="Preview payment"
          description="Choose an app to see the UPI screen for your VPA and amount (same flow as when an admin pays you)."
        >
          Choose app to preview
        </UpiAppPickerButton>
        <Button type="submit" className="min-h-11 w-full" disabled={loading}>
          Submit payout request
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium">Your payout requests</p>
        <ul className="text-muted-foreground space-y-2 text-sm">
          {initialRows.length === 0 ? (
            <li>None yet.</li>
          ) : (
            initialRows.map((r) => (
              <li
                key={r.id}
                className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b py-2"
              >
                <span>
                  ₹{r.amount_inr.toFixed(2)} → {r.payee_upi}
                  {r.status === "approved" && r.payout_utr_ref ? (
                    <span className="text-muted-foreground block font-mono text-xs">
                      Ref: {r.payout_utr_ref}
                    </span>
                  ) : null}
                </span>
                <span className="capitalize">{r.status}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
