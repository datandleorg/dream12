import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { DeleteSavedTeamButton } from "@/components/delete-saved-team-button";
import { SavedMatchTeamListCard } from "@/components/team-flow/saved-match-team-list-card";
import { cn } from "@/lib/utils";
import type { SavedMatchTeamCardRow } from "@/lib/saved-team-flow-data";

export function MatchSavedTeamsTab({
  matchId,
  teamA,
  teamB,
  title,
  locked,
  teams,
  variant,
}: {
  matchId: number;
  teamA: string | null;
  teamB: string | null;
  title: string;
  locked: boolean;
  teams: SavedMatchTeamCardRow[];
  variant: "page" | "tab";
}) {
  const canCreate = !locked && teams.length < 10;
  const aShort = teamA?.trim() || "A";
  const bShort = teamB?.trim() || "B";
  const pitchTeamA = teamA?.trim() || "Team A";
  const pitchTeamB = teamB?.trim() || "Team B";

  return (
    <div className="space-y-4">
      {variant === "page" ? (
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
      ) : null}

      <div className="space-y-3"> 
        {canCreate ? (
          <Link
            href={`/matches/${matchId}/teams/create/squad?fresh=1`}
            className={cn(
              buttonVariants({ variant: "default" }),
              "inline-flex min-h-11 w-full items-center justify-center gap-1.5",
              "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
              "focus-visible:border-red-500 focus-visible:ring-red-500/40",
              "dark:bg-red-600 dark:hover:bg-red-500 dark:active:bg-red-700",
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            Create team
          </Link>
        ) : locked ? (
          <p className="text-muted-foreground w-full text-sm leading-snug">
            Team lock is on — you can’t edit saved teams for this match.
          </p>
        ) : (
          <p className="text-muted-foreground w-full text-sm leading-snug">
            Maximum 10 teams per match.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted-foreground shrink-0 text-[11px] font-semibold uppercase tracking-wider">
          or
        </span>
        <div className="bg-border h-px flex-1" />
      </div>
      <p className="text-muted-foreground px-1 text-center text-xs leading-snug">
        {teams.length > 0
          ? "Pick a saved team below to preview on the pitch, edit the XI, or remove the template."
          : "Your saved teams will show up here — nothing yet, so use Create team above first."}
      </p>

      {!teams.length ? null : (
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
