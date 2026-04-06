import { createClient } from "@/lib/supabase/server";
import { loadAdminBusinessAnalytics } from "@/lib/admin-analytics";
import { AdminAnalyticsSummary } from "@/components/admin-analytics-summary";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const data = await loadAdminBusinessAnalytics(supabase);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Analytics</h2>
        <p className="text-muted-foreground text-sm">
          Business KPIs from live database counts (refreshed on each page load).
        </p>
      </div>
      <AdminAnalyticsSummary data={data} />
    </div>
  );
}
