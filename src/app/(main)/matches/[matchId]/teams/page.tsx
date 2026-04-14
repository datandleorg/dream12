import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button-variants";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { listSavedMatchTeamsWithSummary } from "@/lib/saved-team-flow-data";
import { isTeamEditLocked } from "@/lib/fantasy/team-lock";
import { DeleteSavedTeamButton } from "@/components/delete-saved-team-button";
import { SavedMatchTeamListCard } from "@/components/team-flow/saved-match-team-list-card";

export const dynamic = "force-dynamic";

export default async function MatchTeamsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: mid } = await params;
  const matchId = Number(mid);
  if (!Number.isFinite(matchId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/matches/${matchId}/teams`)}`);

  const { data: matchRow } = await supabase
    .from("matches")
    .select("id,name,team_a,team_b,status")
    .eq("id", matchId)
    .maybeSingle();

  if (!matchRow) notFound();

  const teamA = matchRow.team_a ?? null;
  const teamB = matchRow.team_b ?? null;
  const teams = await listSavedMatchTeamsWithSummary(matchId, teamA, teamB);
  const locked = isTeamEditLocked(String(matchRow.status));
  const canCreate = !locked && teams.length < 10;

  const title =
    teamA && teamB ? `${teamA} vs ${teamB}` : (matchRow.name as string);

  const aShort = teamA?.trim() || "A";
  const bShort = teamB?.trim() || "B";
  const pitchTeamA = teamA?.trim() || "Team A";
  const pitchTeamB = teamB?.trim() || "Team B";

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={`/matches/${matchId}`}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Match
          </Link>
          <h1 className="text-lg font-semibold">My teams</h1>
          <p className="text-muted-foreground text-sm">{title}</p>
        </div>
        {canCreate ? (
          <Link
            href={`/matches/${matchId}/teams/create/squad?fresh=1`}
            className={cn(
              buttonVariants({ variant: "default" }),
              "inline-flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto",
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Create team
          </Link>
        ) : locked ? (
          <p className="text-muted-foreground text-sm">
            Team lock is on — you can’t edit saved teams for this match.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Maximum 10 teams per match.</p>
        )}
      </div>

      <Separator />

      {!teams.length ? (
        <p className="text-muted-foreground text-sm">
          No saved teams yet. Create one to reuse across contests on this match.
        </p>
      ) : (
        <ul className="space-y-3">
          {teams.map((t) => (
            <li key={t.id}>
              <SavedMatchTeamListCard
                matchId={matchId}
                team={t}
                pitchTeamA={pitchTeamA}
                pitchTeamB={pitchTeamB}
                aShort={aShort}
                bShort={bShort}
                editLocked={locked}
                headerEnd={
                  !locked ? (
                    <DeleteSavedTeamButton matchId={matchId} savedTeamId={t.id} />
                  ) : undefined
                }
                primaryAction="edit"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
