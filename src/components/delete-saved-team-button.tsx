"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteSavedMatchTeamAction } from "@/app/actions/saved-match-teams";

export function DeleteSavedTeamButton({
  matchId,
  savedTeamId,
}: {
  matchId: number;
  savedTeamId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function onConfirm() {
    start(async () => {
      const res = await deleteSavedMatchTeamAction({ matchId, savedTeamId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Team removed");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-9 text-destructive"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && pending) return;
          setOpen(next);
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this saved team?</DialogTitle>
            <DialogDescription>
              This removes the template from My teams for this match. Contest squads you already
              saved stay as they are; they just won&apos;t be linked to this template anymore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={() => onConfirm()}
            >
              {pending ? "Deleting…" : "Yes, delete team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
