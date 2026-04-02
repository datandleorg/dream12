"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { formatStatusLabel } from "@/lib/format-status-ui";
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

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "approved" || s === "completed") return "default";
  if (s === "rejected" || s === "failed") return "destructive";
  return "secondary";
}

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
      <div className="bg-muted/50 space-y-2 rounded-lg border px-3 py-3 text-sm">
        <p className="text-muted-foreground">
          Send money to this UPI ID (copy and pay in Google Pay, PhonePe, Paytm, or your bank app):
        </p>
        <p className="font-mono text-base font-medium tracking-tight text-foreground">{companyVpa}</p>
        {companyPayeeName.trim() ? (
          <p className="text-muted-foreground text-xs">Payee name: {companyPayeeName}</p>
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
            onValueChange={(v) => setAmount(v)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payin-utr">UTR / reference</Label>
          <Input
            id="payin-utr"
            className="min-h-11"
            value={utr}
            onValueChange={(v) => setUtr(v)}
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
            onValueChange={(v) => setUserNote(v)}
          />
        </div>
        <Button type="submit" className="min-h-11 w-full" disabled={loading}>
          Submit pay-in request
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium">Your pay-in requests</p>
        <ul className="space-y-2 text-sm">
          {initialRows.length === 0 ? (
            <li className="text-muted-foreground">None yet.</li>
          ) : (
            initialRows.map((r) => (
              <li
                key={r.id}
                className="border-border flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium tabular-nums">₹{r.amount_inr.toFixed(2)}</p>
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {r.utr_ref.slice(0, 32)}
                    {r.utr_ref.length > 32 ? "…" : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(r.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <Badge
                  variant={statusBadgeVariant(r.status)}
                  className="w-fit shrink-0 tracking-wide"
                >
                  {formatStatusLabel(r.status)}
                </Badge>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
