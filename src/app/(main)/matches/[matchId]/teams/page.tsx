import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listSavedMatchTeamsForUser } from "@/lib/saved-team-flow-data";
import { refreshMatchFromSportmonks } from "@/lib/sportmonks/fixture-detail";
import { isSportmonksFixtureId } from "@/lib/sportmonks/sportmonks-ids";
import { DeleteSavedMatchTeamButton } from "@/components/delete-saved-match-team-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MatchSavedTeamsPage({
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
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/matches/${matchId}/teams`)}`);
  }

  if (isSportmonksFixtureId(matchId)) {
    await refreshMatchFromSportmonks(matchId);
  }

  const { data: matchRow } = await supabase
    .from("matches")
    .select("id,name,team_a,team_b,start_time,status")
    .eq("id", matchId)
    .single();

  if (!matchRow) notFound();

  const subtitle =
    matchRow.team_a && matchRow.team_b
      ? `${matchRow.team_a} vs ${matchRow.team_b}`
      : matchRow.name;

  const saved = await listSavedMatchTeamsForUser(matchId);
  const atCap = saved.length >= 10;

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Match teams</h1>
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Save up to 10 teams (T1–T10) for this match and reuse them when joining contests.
          </p>
        </div>
        <Link
          href={`/matches/${matchId}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-h-9 shrink-0",
          )}
        >
          Back to match
        </Link>
      </div>

      {!atCap ? (
        <Link
          href={`/matches/${matchId}/teams/create/squad`}
          className={cn(
            buttonVariants({ variant: "default" }),
            "inline-flex min-h-11 w-full items-center justify-center sm:w-auto",
          )}
        >
          Add match team
        </Link>
      ) : (
        <p className="text-muted-foreground text-sm">
          You already have 10 saved teams for this match. Delete one to add another.
        </p>
      )}

      {!saved.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No saved teams yet</CardTitle>
            <CardDescription>
              Build a team here or save one after you join a contest. When you join another contest for
              this match, you can pick a saved team instead of starting from scratch.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-2">
          {saved.map((t) => (
            <li key={t.id}>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-lg">T{t.slot}</CardTitle>
                    <CardDescription className="text-xs">
                      Reuse in any contest for this match
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/matches/${matchId}/teams/${t.id}/squad`}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "min-h-9",
                      )}
                    >
                      Edit
                    </Link>
                    <DeleteSavedMatchTeamButton
                      matchId={matchId}
                      savedTeamId={t.id}
                      slot={t.slot}
                    />
                  </div>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
