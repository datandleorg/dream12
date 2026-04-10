import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-return-to";
import { notificationRowFromDb } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/brand-logo";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { Skeleton } from "@/components/ui/skeleton";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = safeInternalPath(
      (await headers()).get("x-return-to") ?? undefined,
    );
    if (returnTo) {
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    }
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_balance, is_active")
    .eq("id", user.id)
    .single();

  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    redirect("/login?reason=inactive");
  }

  const initialBalance = Number(profile?.wallet_balance ?? 0);

  const { count: unreadNotifications } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);

  const { data: previewRows } = await supabase
    .from("notifications")
    .select("id,type,title,body,payload,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const notificationPreview = (previewRows ?? []).map(notificationRowFromDb);

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col pt-[env(safe-area-inset-top)]">
      <Suspense
        fallback={
          <header className="border-border/60 bg-background/80 sticky top-0 z-40 mb-1 flex items-center justify-between gap-2 border-b px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
            <BrandLogo variant="compact" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </header>
        }
      >
        <AppHeader
          userId={user.id}
          initialBalance={initialBalance}
          unreadNotifications={unreadNotifications ?? 0}
          notificationPreview={notificationPreview}
        />
      </Suspense>
      <main className="flex-1 px-4 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}
