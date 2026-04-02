import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.52_0.2_27/0.35),transparent_50%),radial-gradient(ellipse_70%_50%_at_100%_50%,oklch(0.52_0.2_27/0.12),transparent),radial-gradient(ellipse_70%_50%_at_0%_50%,oklch(0.55_0.12_250/0.15),transparent)]"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,oklch(0.95_0.02_90/0.08),transparent_35%),radial-gradient(circle_at_80%_15%,oklch(0.95_0.02_90/0.06),transparent_40%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <PwaInstallPrompt bottomClassName="bottom-[max(1rem,env(safe-area-inset-bottom))]" />
        {children}
      </div>
    </div>
  );
}
