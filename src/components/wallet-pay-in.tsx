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
import {
  isPlausibleUpiTransactionRef,
  upiTransactionRefHint,
} from "@/lib/upi-transaction-ref";

type Row = {
  id: string;
  amount_inr: number;
  utr_ref: string;
  status: string;
  created_at: string;
};

export function WalletPayInSection({
  userId,
  companyVpa,
  companyPayeeName,
  initialRows,
}: {
  userId: string;
  companyVpa: string;
  companyPayeeName: string;
  initialRows: Row[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [userNote, setUserNote] = useState("");
  const [loading, setLoading] = useState(false);

  const payParams = useMemo(() => {
    const amt = amount.trim() ? Number(amount) : NaN;
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return {
      payeeVpa: companyVpa,
      payeeName: companyPayeeName,
      amountInr: amt,
      transactionNote: "Dream12 wallet",
    };
  }, [amount, companyVpa, companyPayeeName]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = amount.trim() ? Number(amount) : 0;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const ref = utr.trim();
    if (!isPlausibleUpiTransactionRef(ref)) {
      toast.error(upiTransactionRefHint);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("pay_in_requests").insert({
      user_id: userId,
      amount_inr: amt,
      utr_ref: ref,
      user_note: userNote.trim() || null,
      company_vpa_snapshot: companyVpa,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pay-in request submitted");
    setUtr("");
    setUserNote("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <LoadingOverlay show={loading} label="Submitting…" />
      <div className="flex flex-col gap-2">
        <UpiAppPickerButton payParams={payParams} className="w-full sm:w-auto">
          Choose app to pay
        </UpiAppPickerButton>
        {!payParams ? (
          <p className="text-muted-foreground text-sm">
            Enter an amount first, then choose Google Pay, PhonePe, Paytm, or another UPI app. Pay{" "}
            <span className="text-foreground font-medium">{companyVpa}</span>.
          </p>
        ) : null}
      </div>
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="payin-amount">Amount (₹)</Label>
          <Input
            id="payin-amount"
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
          <Label htmlFor="payin-utr">UTR / reference</Label>
          <Input
            id="payin-utr"
            className="min-h-11"
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="From bank or UPI receipt"
            required
          />
          <p className="text-muted-foreground text-xs">{upiTransactionRefHint}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payin-note">Note (optional)</Label>
          <Input
            id="payin-note"
            className="min-h-11"
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
          />
        </div>
        <Button type="submit" className="min-h-11 w-full" disabled={loading}>
          Submit pay-in request
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium">Your pay-in requests</p>
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
                  ₹{r.amount_inr.toFixed(2)} · {r.utr_ref.slice(0, 24)}
                  {r.utr_ref.length > 24 ? "…" : ""}
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
