import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default async function AdminLayout({
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
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  return (
    <div className="bg-background min-h-dvh px-4 py-6 md:mx-auto md:max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Admin</h1>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex min-h-11 items-center justify-center",
          )}
        >
          Back to app
        </Link>
      </div>
      {children}
    </div>
  );
}
