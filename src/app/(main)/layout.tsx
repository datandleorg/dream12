import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/brand-logo";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_balance")
    .eq("id", user.id)
    .single();

  const initialBalance = Number(profile?.wallet_balance ?? 0);

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col pt-[env(safe-area-inset-top)]">
      <Suspense
        fallback={
          <header className="border-border/60 bg-background/80 sticky top-0 z-40 mb-1 flex items-center justify-between gap-2 border-b px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
            <BrandLogo variant="compact" />
            <div className="bg-muted h-8 w-24 animate-pulse rounded-md" />
          </header>
        }
      >
        <AppHeader initialBalance={initialBalance} />
      </Suspense>
      <main className="flex-1 px-4 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
