import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminBroadcastNotificationsForm } from "@/components/admin-broadcast-notifications-form";
import { buttonVariants } from "@/components/ui/button-variants";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/adminlogin?next=/admin/notifications");

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/");

  const service = createServiceClient();
  const { count, error } = await service
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const activeUserCount = error ? 0 : count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/pay-in-requests" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to admin
        </Link>
      </div>
      <div>
        <h2 className="text-base font-semibold">Broadcast notification</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Creates the same notification row for every active user. Use for announcements, downtime, or policy updates.
        </p>
      </div>
      <AdminBroadcastNotificationsForm activeUserCount={activeUserCount} />
    </div>
  );
}
