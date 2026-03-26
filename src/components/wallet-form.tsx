"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";

export function WalletForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [utr, setUtr] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = amount.trim() ? Number(amount) : 0;
    if (!utr.trim()) {
      toast.error("Enter UTR / reference number");
      return;
    }
    if (amount.trim() && (Number.isNaN(amt) || amt <= 0)) {
      toast.error("Enter a valid amount");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      utr_number: utr.trim(),
      amount: amount.trim() ? amt : 0,
      status: "pending",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Submitted for review");
    setUtr("");
    setAmount("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="relative grid gap-4">
      <LoadingOverlay show={loading} label="Submitting…" />
      <div className="grid gap-2">
        <Label htmlFor="utr">UTR / reference</Label>
        <Input
          id="utr"
          className="min-h-11"
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          placeholder="12-digit UTR"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="amount">Amount (optional)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          className="min-h-11"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500"
        />
      </div>
      <Button type="submit" className="min-h-11 w-full" disabled={loading}>
        {loading ? "Submitting…" : "Submit payment"}
      </Button>
    </form>
  );
}
