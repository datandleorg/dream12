"use client";

import { useMemo } from "react";
import { ROLE_ORDER } from "@/lib/fantasy/rules";
import { playerAvatarUrl } from "@/lib/avatar-url";
import type { BuilderPlayer } from "@/stores/team-builder";
import { cn } from "@/lib/utils";

const ROLE_HEADLINES: Record<string, string> = {
  WK: "WICKET-KEEPERS",
  BAT: "BATTERS",
  AR: "ALL-ROUNDERS",
  BOWL: "BOWLERS",
};

function abbrTeam(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) {
    return `${w[0].slice(0, 1)}${w[1].slice(0, 1)}`.toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

function fantasyPtsForPlayer(
  map: Record<string, number> | undefined,
  playerId: string,
): number {
  if (!map) return 0;
  const s = String(playerId);
  if (Object.prototype.hasOwnProperty.call(map, s)) return map[s] ?? 0;
  return map[playerId] ?? 0;
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return full.slice(0, 12);
  const last = parts[parts.length - 1]!;
  const first = parts[0]!;
  if (last.length <= 12) return last;
  return `${first[0]}. ${last}`.slice(0, 14);
}

type TeamFieldPreviewProps = {
  teamA: string;
  teamB: string;
  selected: BuilderPlayer[];
  squadSize: number;
  creditsLeft: number;
  captainId?: string | null;
  viceCaptainId?: string | null;
  className?: string;
  /** When set, show fantasy pts under each player instead of credits. */
  fantasyPointsByPlayerId?: Record<string, number>;
  /** Override top-right header (e.g. Team pts when showing fantasy). */
  statsRightOverride?: { label: string; value: string };
};

/**
 * Dream11-style pitch preview: black stats bar + grass field + players by role.
 * Shared by the squad “Team preview” sheet and the /preview page.
 */
export function TeamFieldPreview({
  teamA,
  teamB,
  selected,
  squadSize,
  creditsLeft,
  captainId,
  viceCaptainId,
  className,
  fantasyPointsByPlayerId,
  statsRightOverride,
}: TeamFieldPreviewProps) {
  const showFantasy =
    fantasyPointsByPlayerId != null && Object.keys(fantasyPointsByPlayerId).length > 0;
  const a = abbrTeam(teamA);
  const b = abbrTeam(teamB);
  const countA = selected.filter((p) => p.team === teamA).length;
  const countB = selected.filter((p) => p.team === teamB).length;

  const byRole = useMemo(() => {
    const m: Record<string, BuilderPlayer[]> = {
      WK: [],
      BAT: [],
      AR: [],
      BOWL: [],
    };
    for (const p of selected) {
      m[p.role]?.push(p);
    }
    return m;
  }, [selected]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-zinc-800/80 shadow-lg",
        className,
      )}
    >
      {/* Stats bar — black */}
      <header className="bg-zinc-950 px-2 py-3 text-white sm:px-3">
        <div className="grid grid-cols-3 items-end gap-1 sm:gap-2">
          <div className="flex flex-col items-start gap-0.5 text-left">
            <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
              Players
            </span>
            <span className="text-xl font-bold tabular-nums leading-none sm:text-2xl">
              {selected.length}/{squadSize}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-1 text-xs font-bold tabular-nums sm:gap-1.5 sm:text-sm">
            <span className="rounded-sm bg-white px-2 py-1 text-[10px] text-zinc-900 shadow-sm sm:text-xs">
              {a} {countA}
            </span>
            <span className="text-zinc-500">:</span>
            <span className="rounded-sm bg-white px-2 py-1 text-[10px] text-zinc-900 shadow-sm sm:text-xs">
              {b} {countB}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
              {statsRightOverride?.label ?? "Credits left"}
            </span>
            <span
              className={cn(
                "text-xl font-bold tabular-nums leading-none sm:text-2xl",
                !statsRightOverride && creditsLeft < 0 ? "text-red-400" : "text-white",
              )}
            >
              {statsRightOverride?.value ?? creditsLeft.toFixed(1)}
            </span>
          </div>
        </div>
      </header>

      {/* Grass field */}
      <div className="relative min-h-[280px] flex-1 overflow-hidden px-2 py-4 sm:min-h-[340px] sm:px-3 sm:py-5">
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(180deg, #22a35e 0%, #168a4a 38%, #0f6b3d 72%, #0a5230 100%)
            `,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 11px,
              rgba(255, 255, 255, 0.045) 11px,
              rgba(255, 255, 255, 0.045) 12px
            )`,
          }}
        />
        {/* Inner ground + pitch strip */}
        <div className="pointer-events-none absolute inset-[8%] rounded-[50%] border border-white/20 bg-[#1f9a58]/25" />
        <div className="pointer-events-none absolute top-[42%] left-[22%] right-[22%] h-[18%] rounded-sm border border-white/35 bg-[#3dd17e]/20" />

        <div className="relative z-[1] flex flex-col gap-5">
          {ROLE_ORDER.map((role) => {
            const list = byRole[role] ?? [];
            if (!list.length) return null;
            return (
              <section key={role}>
                <h3 className="mb-2 text-center text-[10px] font-bold tracking-[0.2em] text-white drop-shadow-sm sm:text-[11px]">
                  {ROLE_HEADLINES[role] ?? role}
                </h3>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 sm:gap-x-4">
                  {list.map((p) => {
                    const avatar = playerAvatarUrl(p.photo_url, p.name);
                    const isTeamA = p.team === teamA;
                    const isC =
                      captainId != null &&
                      String(captainId) !== "" &&
                      String(p.id) === String(captainId);
                    const isVc =
                      viceCaptainId != null &&
                      String(viceCaptainId) !== "" &&
                      String(p.id) === String(viceCaptainId);
                    return (
                      <div
                        key={p.id}
                        className="flex w-[68px] flex-col items-center gap-1 text-center sm:w-[76px]"
                      >
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatar}
                            alt=""
                            width={52}
                            height={52}
                            className="size-[52px] rounded-full border-2 border-white/90 object-cover shadow-md ring-1 ring-black/10"
                          />
                          {isC ? (
                            <span className="absolute -right-0.5 -bottom-0.5 rounded bg-red-600 px-1 text-[8px] font-bold text-white shadow">
                              C
                            </span>
                          ) : null}
                          {isVc ? (
                            <span className="absolute -bottom-0.5 -left-0.5 rounded bg-amber-500 px-1 text-[8px] font-bold text-zinc-900 shadow">
                              VC
                            </span>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "max-w-[68px] truncate rounded px-1 py-0.5 text-[10px] font-bold leading-tight shadow-sm sm:max-w-[76px] sm:text-[11px]",
                            isTeamA
                              ? "bg-white text-zinc-900"
                              : "border border-white/25 bg-zinc-950 text-white",
                          )}
                          title={p.name}
                        >
                          {shortName(p.name)}
                        </span>
                        <span className="text-[10px] font-medium tabular-nums text-white/90 drop-shadow">
                          {showFantasy
                            ? `${fantasyPtsForPlayer(fantasyPointsByPlayerId, p.id).toFixed(1)} pts`
                            : `${p.credit_value.toFixed(1)} Cr`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
