"use client";

import { useEffect } from "react";
import {
  mapRowToBuilderPlayer,
  useTeamBuilderStore,
} from "@/stores/team-builder";
import type { TeamFlowPlayerRow } from "@/lib/team-flow-data";

export function HydrateTeamFlow({
  contestId,
  players,
  initialRoster,
  initialCaptainId,
  initialViceId,
  /** Squad step: clear client state when DB has no team (new contest / switch contest). Captain & preview: keep in-session picks until first save. */
  resetWhenNoSavedTeam = true,
}: {
  contestId: string;
  players: TeamFlowPlayerRow[];
  initialRoster: string[];
  initialCaptainId: string | null;
  initialViceId: string | null;
  resetWhenNoSavedTeam?: boolean;
}) {
  const reset = useTeamBuilderStore((s) => s.reset);
  const setCaptain = useTeamBuilderStore((s) => s.setCaptain);
  const setViceCaptain = useTeamBuilderStore((s) => s.setViceCaptain);

  const xiSig = players
    .map((p) => `${p.id}:${p.in_playing_xi === true ? "t" : p.in_playing_xi === false ? "f" : "n"}`)
    .sort()
    .join(";");
  /** Must change when DB roles change, or Zustand keeps stale roles after refresh/sync. */
  const roleSig = players
    .map((p) => `${p.id}:${p.role}`)
    .sort()
    .join(";");
  const hydrateKey = `${contestId}|${initialRoster.join(",")}|${initialCaptainId ?? ""}|${initialViceId ?? ""}|${xiSig}|${roleSig}`;

  useEffect(() => {
    const pre = initialRoster
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean) as TeamFlowPlayerRow[];
    if (pre.length) {
      reset(pre.map(mapRowToBuilderPlayer));
      setCaptain(initialCaptainId);
      setViceCaptain(initialViceId);
    } else if (resetWhenNoSavedTeam) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate from server snapshot per contest/team
  }, [hydrateKey, resetWhenNoSavedTeam]);

  return null;
}
