"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props<string>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  value,
  id,
  disabled,
  ...props
}: Radio.Root.Props<string>) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      value={value}
      id={id}
      disabled={disabled}
      className={cn(
        "border-input bg-background text-primary focus-visible:ring-ring/50 flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:border-primary data-checked:ring-primary/15 data-checked:ring-[3px]",
        className,
      )}
      {...props}
    >
      <Radio.Indicator className="flex size-full items-center justify-center rounded-full">
        <span className="bg-primary block size-2 rounded-full" />
      </Radio.Indicator>
    </Radio.Root>
  );
}

export { RadioGroup, RadioGroupItem };
