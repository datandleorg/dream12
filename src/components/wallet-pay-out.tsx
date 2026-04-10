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

type Row = {
  id: string;
  amount_inr: number;
  payee_upi: string;
  status: string;
  created_at: string;
  payout_utr_ref: string | null;
};

const upiLike = /^[^\s@]+@[^\s@]+$/;

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "approved" || s === "completed") return "default";
  if (s === "rejected" || s === "failed") return "destructive";
  return "secondary";
}

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
            onValueChange={(v) => setAmount(v)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payout-upi">Your UPI ID</Label>
          <Input
            id="payout-upi"
            className="min-h-11"
            value={payeeUpi}
            onValueChange={(v) => setPayeeUpi(v)}
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
            onValueChange={(v) => setUserNote(v)}
          />
        </div>
        <Button type="submit" className="min-h-11 w-full" disabled={loading}>
          Submit payout request
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium">Your payout requests</p>
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
                  <p className="text-muted-foreground font-mono text-xs break-all">{r.payee_upi}</p>
                  {r.status === "approved" && r.payout_utr_ref ? (
                    <p className="text-muted-foreground font-mono text-xs">
                      Ref: {r.payout_utr_ref}
                    </p>
                  ) : null}
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
