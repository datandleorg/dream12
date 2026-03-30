import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MatchLivePageClient } from "@/components/match-live-page-client";
import { resolveLiveSnapshotForPage } from "@/lib/sportmonks/resolve-live-snapshot";

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
    <MatchLivePageClient
      matchId={matchId}
      tournamentName={matchRow.tournament_name}
      subtitle={subtitle}
      live_snapshot={matchRow.live_snapshot}
      live_snapshot_at={matchRow.live_snapshot_at as string | null}
      status={String(matchRow.status)}
      sm_fixture_status={matchRow.sm_fixture_status as string | null}
      initialParsedSnapshot={snapshot}
    />
  );
}
