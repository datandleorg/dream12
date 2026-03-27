import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FixtureSmStatusLine } from "@/components/fixture-sm-status-line";
import { MatchLiveScoreTabs } from "@/components/match-live-score-tabs";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { resolveLiveSnapshotForPage } from "@/lib/sportmonks/resolve-live-snapshot";
import { cn } from "@/lib/utils";

export default async function MatchLiveScorePage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const supabase = await createClient();
  const { data: matchRow } = await supabase
    .from("matches")
    .select(
      "id,name,start_time,status,tournament_name,team_a,team_b,live_snapshot,live_snapshot_at,sm_fixture_status",
    )
    .eq("id", matchId)
    .single();

  if (!matchRow) notFound();

  const snapshot = await resolveLiveSnapshotForPage(matchId, {
    live_snapshot: matchRow.live_snapshot,
    live_snapshot_at: matchRow.live_snapshot_at as string | null,
  });

  const subtitle =
    matchRow.team_a && matchRow.team_b
      ? `${matchRow.team_a} vs ${matchRow.team_b}`
      : matchRow.name;

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {matchRow.tournament_name ? (
            <p className="text-accent mb-1 text-[11px] font-semibold tracking-wide uppercase">
              {matchRow.tournament_name}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold leading-tight">Live score</h1>
            <MatchStatusBadge status={String(matchRow.status)} />
          </div>
          <FixtureSmStatusLine label={matchRow.sm_fixture_status as string | null} />
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        </div>
        <Link
          href={`/matches/${matchId}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-h-10 shrink-0",
          )}
        >
          Match & contests
        </Link>
      </div>

      <MatchLiveScoreTabs snapshot={snapshot} />
    </div>
  );
}
