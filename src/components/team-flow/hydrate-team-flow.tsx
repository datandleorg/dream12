"use client";

import { useEffect } from "react";
import {
  mapRowToBuilderPlayer,
  mergeBuilderPlayersWithPool,
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
  const setTeamFlowContestId = useTeamBuilderStore((s) => s.setTeamFlowContestId);

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

    const store = useTeamBuilderStore.getState();
    const { teamFlowContestId, captainId, viceCaptainId, selected: currentSelected } = store;

    /** Another contest’s session must not bleed into this page. */
    if (teamFlowContestId !== contestId) {
      if (pre.length) {
        reset(pre.map(mapRowToBuilderPlayer));
        setCaptain(initialCaptainId);
        setViceCaptain(initialViceId);
      } else {
        reset();
        setCaptain(null);
        setViceCaptain(null);
      }
      setTeamFlowContestId(contestId);
      return;
    }

    /** Captain / preview: keep any in-session picks (partial or full) — do not replace with stale DB roster. */
    if (!resetWhenNoSavedTeam && currentSelected.length > 0) {
      const merged = mergeBuilderPlayersWithPool(currentSelected, players);
      const ids = new Set(merged.map((p) => p.id));
      reset(merged);
      setCaptain(captainId && ids.has(captainId) ? captainId : null);
      setViceCaptain(viceCaptainId && ids.has(viceCaptainId) ? viceCaptainId : null);
      return;
    }

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
