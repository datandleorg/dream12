import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminServerLogsClient } from "@/components/admin-server-logs-client";
import { buttonVariants } from "@/components/ui/button-variants";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function AdminServerLogsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/adminlogin");
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/");

  return (
    <div className="space-y-4">
      <Link href="/admin/pay-in-requests" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Back to admin
      </Link>
      <div>
        <h2 className="text-lg font-semibold">Server logs</h2>
        <p className="text-muted-foreground text-sm">
          Structured NDJSON (requests, activities, cron). Paginated reads only — open a row for full JSON.
        </p>
      </div>
      <AdminServerLogsClient />
    </div>
  );
}
