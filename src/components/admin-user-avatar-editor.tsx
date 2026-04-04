"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminClearProfileAvatar,
  adminRequestProfileAvatarUpload,
  adminSetProfileAvatarUrl,
} from "@/app/actions/admin-users";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MAX_PROFILE_AVATAR_BYTES,
  PROFILE_AVATAR_CONTENT_TYPES,
} from "@/lib/profile-avatar-limits";

export function AdminUserAvatarEditor({
  userId,
  username,
  avatarUrl,
}: {
  userId: string;
  username: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  /** Optimistic URL so the avatar updates immediately; stays in sync with server props after refresh. */
  const [displayAvatarUrl, setDisplayAvatarUrl] = useState<string | null>(avatarUrl?.trim() ? avatarUrl : null);

  useEffect(() => {
    setDisplayAvatarUrl(avatarUrl?.trim() ? avatarUrl : null);
  }, [avatarUrl]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!(PROFILE_AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_PROFILE_AVATAR_BYTES) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const up = await adminRequestProfileAvatarUpload(userId, file.type);
      if (!up.ok) {
        toast.error(up.message);
        return;
      }
      if (file.size > up.maxBytes) {
        toast.error("Image must be 2 MB or smaller.");
        return;
      }
      let put: Response;
      try {
        put = await fetch(up.uploadUrl, {
          method: "PUT",
          body: file,
          headers: up.headers,
        });
      } catch {
        const origin = window.location.origin;
        toast.error(
          `Upload was blocked (often CORS). In DigitalOcean Spaces → Settings → CORS, allow PUT from this origin (must match exactly): ${origin}. See docs/digitalocean-deployment.md.`,
        );
        return;
      }
      if (!put.ok) {
        toast.error("Upload failed. Check Spaces CORS, bucket policy, and credentials.");
        return;
      }
      const saved = await adminSetProfileAvatarUrl(userId, up.publicUrl);
      if (!saved.ok) {
        toast.error(saved.message);
        return;
      }
      setDisplayAvatarUrl(up.publicUrl.trim());
      toast.success("Profile photo updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    if (!confirm("Remove this user’s profile photo? They will see a generated avatar until they upload again.")) {
      return;
    }
    setBusy(true);
    try {
      const r = await adminClearProfileAvatar(userId);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setDisplayAvatarUrl(null);
      toast.success("Profile photo removed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-md gap-3">
      <Label className="text-sm font-medium">Profile photo</Label>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <UserAvatar
          avatarUrl={displayAvatarUrl}
          username={username || undefined}
          userIdFallback={userId}
          size="xl"
          className="text-base"
        />
        <input
          ref={inputRef}
          type="file"
          accept={PROFILE_AVATAR_CONTENT_TYPES.join(",")}
          className="sr-only"
          onChange={(ev) => void onFile(ev)}
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-10"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Working…" : "Change photo"}
            </Button>
            {displayAvatarUrl?.trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void onClear()}
              >
                Remove photo
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Same storage as user self-service uploads (JPEG, PNG, WebP · max 2 MB). Shown on leaderboards and
            contest previews.
          </p>
        </div>
      </div>
    </div>
  );
}
