import { createClient } from "@/lib/supabase/server";
import { NotificationsList } from "@/components/notifications-list";
import { notificationRowFromDb } from "@/lib/notifications";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("notifications")
    .select("id,type,title,body,payload,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const initial = (rows ?? []).map(notificationRowFromDb);

  return (
    <div className="space-y-4 py-2">
      <div>
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="text-muted-foreground text-sm">Updates on wallet, contests, and results.</p>
      </div>
      <NotificationsList initial={initial} />
    </div>
  );
}
