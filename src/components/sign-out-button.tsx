"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <LoadingOverlay show={busy} label="Signing out…" />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
