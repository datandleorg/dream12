"use client";

import { useCallback, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { safeInternalPath } from "@/lib/safe-return-to";
import { LoadingOverlay } from "@/components/loading-overlay";

const PRESETS = [100, 500, 1000, 2000] as const;

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type WalletTopUpSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional post-payment redirect (same-origin path only). */
  returnTo?: string | null;
};

export function WalletTopUpSheet({ open, onOpenChange, returnTo }: WalletTopUpSheetProps) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [selectedInr, setSelectedInr] = useState<number>(500);
  const [custom, setCustom] = useState("");
  /** Create-order API in flight (overlay; cleared before Razorpay modal opens). */
  const [creatingOrder, setCreatingOrder] = useState(false);
  /** Verify API after successful Razorpay payment. */
  const [verifying, setVerifying] = useState(false);

  const safeReturn = returnTo ? safeInternalPath(returnTo) : null;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setCreatingOrder(false);
        setVerifying(false);
        setCustom("");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const amountInr = useCallback(() => {
    if (custom.trim()) {
      const n = Number(custom.trim());
      return Number.isFinite(n) ? n : NaN;
    }
    return selectedInr;
  }, [custom, selectedInr]);

  const onPay = useCallback(async () => {
    const amt = amountInr();
    if (!Number.isFinite(amt) || amt < 1 || amt > 50_000) {
      toast.error("Enter an amount between ₹1 and ₹50,000");
      return;
    }
    if (!scriptReady || typeof window.Razorpay !== "function") {
      toast.error("Payment form is still loading. Try again in a moment.");
      return;
    }

    setCreatingOrder(true);
    try {
      const res = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      const data = (await res.json()) as {
        error?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        key?: string;
      };

      if (!res.ok) {
        toast.error(data.error ?? "Could not start payment");
        setCreatingOrder(false);
        return;
      }

      const { orderId, amount, currency, key } = data;
      if (!orderId || amount == null || !currency || !key) {
        toast.error("Invalid response from server");
        setCreatingOrder(false);
        return;
      }

      setCreatingOrder(false);

      const rzp = new window.Razorpay!({
        key,
        amount,
        currency,
        name: "Dream12",
        description: "Wallet top-up",
        order_id: orderId,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          setVerifying(true);
          try {
            const v = await fetch("/api/payments/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            const out = (await v.json()) as { ok?: boolean; duplicate?: boolean; error?: string };
            if (!v.ok) {
              toast.error(out.error ?? "Verification failed");
              return;
            }
            if (out.duplicate) {
              toast.success("Payment was already applied.");
            } else {
              toast.success("Wallet credited successfully.");
            }
            handleOpenChange(false);
            router.refresh();
            if (safeReturn) {
              router.push(safeReturn);
            }
          } catch {
            toast.error("Verification request failed");
          } finally {
            setVerifying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setCreatingOrder(false);
          },
        },
      });

      rzp.open();
    } catch {
      setCreatingOrder(false);
      toast.error("Something went wrong");
    }
  }, [amountInr, handleOpenChange, router, safeReturn, scriptReady]);

  return (
    <>
      <LoadingOverlay
        show={creatingOrder || verifying}
        label={
          verifying
            ? "Confirming payment…"
            : creatingOrder
              ? "Starting payment…"
              : "Loading…"
        }
      />
      {open ? (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
          onReady={() => setScriptReady(true)}
          onLoad={() => setScriptReady(true)}
        />
      ) : null}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="max-h-[90vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Add money</SheetTitle>
            <SheetDescription>
              Pay securely with Razorpay (UPI, cards, netbanking). Amount is credited instantly.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={custom.trim() ? "secondary" : selectedInr === p ? "default" : "secondary"}
                  className="min-h-10"
                  onClick={() => {
                    setCustom("");
                    setSelectedInr(p);
                  }}
                >
                  {formatInr(p)}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-custom-amount">Custom amount (₹)</Label>
              <Input
                id="wallet-custom-amount"
                inputMode="decimal"
                placeholder="e.g. 750"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="min-h-11"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Selected:{" "}
              <span className="text-foreground font-medium tabular-nums">
                {Number.isFinite(amountInr()) ? formatInr(amountInr()) : "—"}
              </span>
            </p>
          </div>
          <SheetFooter className="gap-2">
            <Button
              type="button"
              className="min-h-11 w-full"
              disabled={creatingOrder || verifying || !scriptReady}
              onClick={() => void onPay()}
            >
              {creatingOrder
                ? "Starting…"
                : verifying
                  ? "Confirming…"
                  : scriptReady
                    ? "Pay with Razorpay"
                    : "Loading checkout…"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

type WalletRazorpayCardProps = {
  returnTo?: string | null;
  className?: string;
};

/** Wallet page: opens the same top-up sheet as the header. */
export function WalletRazorpayCard({ returnTo, className }: WalletRazorpayCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("space-y-3", className)}>
      <Button type="button" className="min-h-11 w-full" onClick={() => setOpen(true)}>
        Add money (Razorpay)
      </Button>
      <WalletTopUpSheet open={open} onOpenChange={setOpen} returnTo={returnTo} />
    </div>
  );
}
