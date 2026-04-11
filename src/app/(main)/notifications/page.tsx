import { NotificationsList } from "@/components/notifications-list";
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { notificationRowFromDb } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

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
      <PushNotificationsSettings />
      <NotificationsList initial={initial} />
    </div>
  );
}
