"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteSavedMatchTeamAction } from "@/app/actions/saved-match-teams";

export function DeleteSavedMatchTeamButton({
  matchId,
  savedTeamId,
  slot,
}: {
  matchId: number;
  savedTeamId: string;
  slot: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    if (
      !window.confirm(
        `Delete T${slot}? You can create another match team later if you have room.`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await deleteSavedMatchTeamAction({ matchId, savedTeamId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`T${slot} deleted`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-9 border-destructive/40 text-destructive hover:bg-destructive/10"
      disabled={pending}
      onClick={() => onDelete()}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
