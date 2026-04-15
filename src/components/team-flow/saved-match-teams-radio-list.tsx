"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SavedMatchTeamListCard } from "@/components/team-flow/saved-match-team-list-card";
import type { SavedMatchTeamCardRow } from "@/lib/saved-team-flow-data";
import { cn } from "@/lib/utils";

/** Radio-only list for pick-team: selection is controlled by the parent (single CTA there). */
export type SavedMatchTeamsRadioListProps = {
  matchId: number;
  teams: SavedMatchTeamCardRow[];
  pitchTeamA: string;
  pitchTeamB: string;
  aShort: string;
  bShort: string;
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  /** After editing XI, return user here (contest pick-team). */
  editReturnToPath?: string;
  /** Match roster locked — no edit navigation. */
  editLocked?: boolean;
};

function SavedMatchTeamsRadioListInner(props: SavedMatchTeamsRadioListProps) {
  const {
    matchId,
    teams,
    pitchTeamA,
    pitchTeamB,
    aShort,
    bShort,
    selectedId,
    onSelectedIdChange,
    editReturnToPath,
    editLocked = false,
  } = props;

  const labelId = "saved-match-teams-radio-label";

  return (
    <RadioGroup
      aria-labelledby={labelId}
      name="saved-match-team"
      value={selectedId}
      onValueChange={onSelectedIdChange}
    >
      <p id={labelId} className="sr-only">
        Select a saved team to use for this contest
      </p>
      <ul className="space-y-3">
        {teams.map((t) => {
          const isSel = selectedId === t.id;
          return (
            <li key={t.id} className="list-none">
              <div
                role="presentation"
                className={cn(
                  "flex cursor-pointer gap-2 rounded-xl border border-border p-2 sm:gap-3 sm:p-3",
                  isSel &&
                    "ring-ring bg-muted/25 ring-2 ring-offset-2 ring-offset-background",
                )}
                onClick={() => onSelectedIdChange(t.id)}
              >
                <div className="flex shrink-0 items-start pt-2 pl-0.5 sm:pt-3">
                  <RadioGroupItem value={t.id} id={`saved-team-radio-${t.id}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <SavedMatchTeamListCard
                    matchId={matchId}
                    team={t}
                    pitchTeamA={pitchTeamA}
                    pitchTeamB={pitchTeamB}
                    aShort={aShort}
                    bShort={bShort}
                    primaryAction="edit"
                    pickSelectorRow
                    embedded
                    editLocked={editLocked}
                    editReturnToPath={editReturnToPath}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </RadioGroup>
  );
}

/** Remount when the set of saved team ids changes so selection can reset in the parent. */
export function SavedMatchTeamsRadioList(props: SavedMatchTeamsRadioListProps) {
  const listKey = props.teams.map((t) => t.id).join("|");
  return <SavedMatchTeamsRadioListInner key={listKey} {...props} />;
}
