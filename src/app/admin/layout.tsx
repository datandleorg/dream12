import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin/pay-in-requests", label: "Pay-in" },
  { href: "/admin/pay-out-requests", label: "Pay-out" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/transactions", label: "Legacy UTR" },
  { href: "/admin/audit", label: "Audit" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/adminlogin?next=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, is_active")
    .eq("id", user.id)
    .single();

  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    redirect("/login?reason=inactive");
  }

  if (!profile?.is_admin) redirect("/");

  return (
    <div className="bg-background min-h-dvh px-4 py-6 md:mx-auto md:max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Admin</h1>
        <div className="flex flex-wrap gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "inline-flex min-h-9 items-center justify-center",
              )}
            >
              {item.label}
            </Link>
          ))}
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
      </div>
      {children}
    </div>
  );
}
