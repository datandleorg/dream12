"use client";

import { mockSelectionPct } from "@/lib/fantasy/mock-stats";
import { playerAvatarUrl } from "@/lib/avatar-url";
import {
  mapRowToBuilderPlayer,
  type BuilderPlayer,
} from "@/stores/team-builder";
import type { TeamFlowPlayerRow } from "@/lib/team-flow-data";
import { canAddPlayerToSquad } from "@/lib/fantasy/validate-squad";
import { PlayingXiDot } from "@/components/team-flow/playing-xi-dot";
import { cn } from "@/lib/utils";

function teamBadgeLabel(teamName: string): string {
  const w = teamName.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) return `${w[0][0]}${w[1][0]}`.toUpperCase();
  return teamName.slice(0, 3).toUpperCase();
}

type PickSlice = {
  id: string;
  team: string;
  role: BuilderPlayer["role"];
  credit_value: number;
};

export function SquadPlayerRow({
  player,
  contestId,
  selected,
  pickSelected,
  rosterLocked,
  onTogglePlayer,
}: {
  player: TeamFlowPlayerRow;
  contestId: string;
  selected: BuilderPlayer[];
  pickSelected: PickSlice[];
  rosterLocked: boolean;
  onTogglePlayer: (bp: ReturnType<typeof mapRowToBuilderPlayer>) => void;
}) {
  const bp = mapRowToBuilderPlayer(player);
  const isOn = selected.some((x) => x.id === player.id);
  const pickFields = {
    id: bp.id,
    team: bp.team,
    role: bp.role,
    credit_value: bp.credit_value,
  };
  const addCheck = isOn
    ? ({ ok: true as const })
    : canAddPlayerToSquad(pickSelected, pickFields);
  const blockAdd = !isOn && !addCheck.ok;
  const conflictPick = isOn && player.in_playing_xi === false;
  const selPct =
    player.selection_pct != null
      ? Number(player.selection_pct)
      : mockSelectionPct(player.id, contestId);
  const avatar = playerAvatarUrl(player.photo_url, player.name);
  const badge = teamBadgeLabel(player.team);

  return (
    <li>
      <button
        type="button"
        disabled={rosterLocked}
        title={
          rosterLocked
            ? "Team is locked"
            : blockAdd && !addCheck.ok
              ? addCheck.message
              : isOn
                ? "Tap to remove from squad"
                : "Tap to add to squad"
        }
        onClick={() => onTogglePlayer(bp)}
        className={cn(
          "text-left transition-colors",
          "grid w-full grid-cols-[48px_minmax(0,1fr)_44px_44px] items-center gap-x-1.5 rounded-xl border py-3 pl-0.5 pr-2",
          rosterLocked && "cursor-not-allowed opacity-80",
          !rosterLocked &&
            "hover:bg-zinc-50/90 active:bg-zinc-100/80 dark:hover:bg-zinc-900/40",
          conflictPick &&
            "ring-2 ring-rose-400/70 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950",
          isOn && !conflictPick
            ? "border-amber-200/90 bg-amber-50/90 shadow-sm"
            : "border-zinc-100 bg-white",
          blockAdd && !rosterLocked && "opacity-[0.72]",
        )}
      >
        <div className="relative size-12 shrink-0 justify-self-start">
          <div className="size-12 rounded-full border border-zinc-200 p-0.5 dark:border-zinc-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar}
              alt=""
              width={48}
              height={48}
              className="size-full rounded-full object-cover"
            />
          </div>
          <PlayingXiDot
            in_playing_xi={player.in_playing_xi}
            className="-top-0.5 -right-0.5"
          />
          <span className="absolute -bottom-0.5 -left-0.5 min-w-[1.25rem] rounded border border-zinc-200 bg-white px-0.5 text-center text-[9px] font-bold leading-tight text-zinc-800 shadow-sm">
            {badge}
          </span>
        </div>

        <div className="min-w-0 pl-1">
          <div className="truncate text-[15px] font-semibold leading-tight text-zinc-900">
            {player.name}
          </div>
          <div className="text-zinc-500 mt-1 text-[11px] tabular-nums">
            Sel by {selPct.toFixed(2)}%
          </div>
        </div>

        <div className="text-right text-sm font-medium tabular-nums text-zinc-800">
          {bp.season_points}
        </div>
        <div className="text-right text-sm font-semibold tabular-nums text-zinc-900">
          {Number(player.credit_value).toFixed(1)}
        </div>
      </button>
    </li>
  );
}
