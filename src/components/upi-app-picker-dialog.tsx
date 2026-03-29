"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VariantProps } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import {
  getUpiPaymentAppOptions,
  type UpiPaymentAppOption,
} from "@/lib/upi";

export type UpiPayParams = {
  payeeVpa: string;
  payeeName: string;
  amountInr: number;
  transactionNote?: string;
};

type UpiAppPickerButtonProps = {
  payParams: UpiPayParams | null;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  title?: string;
  description?: string;
} & Pick<VariantProps<typeof buttonVariants>, "variant" | "size">;

export function UpiAppPickerButton({
  payParams,
  disabled,
  className,
  children = "Choose app to pay",
  title = "Pay with",
  description = "On iPhone, use Google Pay for a gpay:// link (not generic UPI, which often opens WhatsApp). On Android, each option opens that app directly.",
  variant = "default",
  size = "default",
}: UpiAppPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UpiPaymentAppOption[]>([]);

  function openPicker() {
    if (!payParams) return;
    setOptions(getUpiPaymentAppOptions(payParams));
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setOptions([]);
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(size === "default" && "min-h-11", className)}
        disabled={disabled || !payParams}
        onClick={openPicker}
      >
        {children}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {options.map((opt) => (
              <a
                key={opt.id}
                href={opt.href}
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "min-h-12 w-full justify-center text-center",
                )}
                onClick={() => handleOpenChange(false)}
              >
                {opt.label}
              </a>
            ))}
          </div>
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
