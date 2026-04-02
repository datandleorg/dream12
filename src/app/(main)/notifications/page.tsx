import { createClient } from "@/lib/supabase/server";
import { NotificationsList, type NotificationRow } from "@/components/notifications-list";
import { PushNotificationSettings } from "@/components/push-notification-settings";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("notifications")
    .select("id,type,title,body,payload,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const initial: NotificationRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    body: r.body as string,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    read_at: (r.read_at as string | null) ?? null,
    created_at: r.created_at as string,
  }));

  return (
    <div className="space-y-4 py-2">
      <div>
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="text-muted-foreground text-sm">Updates on wallet, contests, and results.</p>
      </div>
      <PushNotificationSettings />
      <NotificationsList initial={initial} />
    </div>
  );
}
