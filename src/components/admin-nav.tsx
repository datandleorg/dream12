"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/pay-in-requests", label: "Pay-in" },
  { href: "/admin/pay-out-requests", label: "Pay-out" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/transactions", label: "Legacy UTR" },
  { href: "/admin/audit", label: "Audit" },
] as const;

function isNavActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/admin" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex flex-wrap gap-2">
      {nav.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
              "inline-flex min-h-9 items-center justify-center",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "inline-flex min-h-9 items-center justify-center",
        )}
      >
        App
      </Link>
    </div>
  );
}
