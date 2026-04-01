"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminSetUserActive } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/loading-overlay";
import { formatStatusLabel } from "@/lib/format-status-ui";

export function AdminUserActiveToggle({
  userId,
  isActive,
  currentAdminId,
  layout = "detail",
}: {
  userId: string;
  isActive: boolean;
  currentAdminId: string;
  layout?: "detail" | "table";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const self = userId === currentAdminId;

  async function setActive(next: boolean) {
    if (self && !next) return;
    if (!next && !confirm("Deactivate this user? They will be signed out and cannot sign in until reactivated.")) {
      return;
    }
    setLoading(true);
    const r = await adminSetUserActive(userId, next);
    setLoading(false);
    if (!r.ok) toast.error(r.message);
    else {
      toast.success(next ? "User activated" : "User deactivated");
      router.refresh();
    }
  }

  if (self) {
    return (
      <div className={layout === "table" ? "flex flex-col items-end gap-1" : "flex flex-wrap items-center gap-3"}>
        <Badge variant="secondary" className="tracking-wide">
          {formatStatusLabel("active")}
        </Badge>
        <span className="text-muted-foreground text-xs">Cannot change own status</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <LoadingOverlay show={loading} label="Updating…" />
      {layout === "table" ? (
        <>
          <Badge variant={isActive ? "default" : "destructive"} className="tracking-wide">
            {formatStatusLabel(isActive ? "active" : "inactive")}
          </Badge>
          <Button
            type="button"
            variant={isActive ? "outline" : "secondary"}
            size="sm"
            className="min-h-8"
            disabled={loading}
            onClick={() => void setActive(!isActive)}
          >
            {isActive ? "Deactivate" : "Activate"}
          </Button>
        </>
      ) : (
        <>
          <Badge variant={isActive ? "default" : "destructive"} className="tracking-wide">
            {formatStatusLabel(isActive ? "active" : "inactive")}
          </Badge>
          <Button
            type="button"
            variant={isActive ? "outline" : "secondary"}
            size="sm"
            className="min-h-11"
            disabled={loading}
            onClick={() => void setActive(!isActive)}
          >
            {isActive ? "Deactivate user" : "Activate user"}
          </Button>
        </>
      )}
    </div>
  );
}
