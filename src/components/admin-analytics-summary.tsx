import type { AdminBusinessAnalytics } from "@/lib/admin-analytics";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const int = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const dec = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function KpiCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description?: string;
}) {
  return (
    <Card size="sm" className="border-border/80">
      <CardHeader className="border-0 pb-1">
        <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-[11px]">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-foreground text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function AdminAnalyticsSummary({ data }: { data: AdminBusinessAnalytics }) {
  const avg =
    data.avgEntriesPerContest != null ? dec.format(data.avgEntriesPerContest) : "—";

  const matchLines = [
    ["Upcoming", data.matchesByStatus.upcoming ?? 0],
    ["Live", data.matchesByStatus.live ?? 0],
    ["In review", data.matchesByStatus.in_review ?? 0],
    ["Completed", data.matchesByStatus.completed ?? 0],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Registered users"
          value={int.format(data.registeredUsers)}
        />
        <KpiCard
          title="Active users"
          value={int.format(data.activeUsers)}
          description={`${int.format(data.deactivatedUsers)} deactivated`}
        />
        <KpiCard
          title="New users (30d)"
          value={int.format(data.newUsersLast30Days)}
        />
        <KpiCard
          title="Total contests"
          value={int.format(data.totalContests)}
        />
        <KpiCard
          title="User-created contests"
          value={int.format(data.userCreatedContests)}
        />
        <KpiCard
          title="Total entries"
          value={int.format(data.totalEntries)}
          description={`Avg ${avg} per contest`}
        />
        <KpiCard title="Σ Gross collected" value={inr.format(data.sumGrossCollected)} />
        <KpiCard title="Σ Prize pool" value={inr.format(data.sumPrizePool)} />
        <Card size="sm" className="border-border/80 sm:col-span-2 lg:col-span-1">
          <CardHeader className="border-0 pb-1">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Matches by status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="text-foreground space-y-1 text-sm tabular-nums">
              {matchLines.map(([label, n]) => (
                <li key={label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{int.format(n)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="text-muted-foreground space-y-1 text-xs leading-relaxed">
        <p>
          Gross and prize totals are database snapshots summed across all contests.{" "}
          <code className="text-foreground/90">gross_collected</code> may stay empty until
          join lock and prize recompute (
          <code className="text-foreground/90">recompute-contest-prizes-at-lock</code>).
        </p>
      </div>
    </div>
  );
}
