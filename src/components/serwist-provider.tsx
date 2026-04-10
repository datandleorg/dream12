"use client";

import { SerwistProvider as SerwistProviderBase } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

export function SerwistProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProviderBase swUrl="/serwist/sw.js">{children}</SerwistProviderBase>
  );
}
