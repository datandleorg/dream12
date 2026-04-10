"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  requestProfileAvatarUpload,
  setProfileAvatarUrl,
} from "@/app/actions/profile-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { compressProfileAvatarForUpload } from "@/lib/profile-avatar-compress";
import {
  MAX_PROFILE_AVATAR_BYTES,
  PROFILE_AVATAR_CONTENT_TYPES,
  PROFILE_AVATAR_OUTPUT_CONTENT_TYPE,
} from "@/lib/profile-avatar-limits";

export function ProfileAvatarEditor({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!(PROFILE_AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Use JPEG, PNG, or WebP.");
      return;
    }

    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await compressProfileAvatarForUpload(file);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not process image.");
        return;
      }
      if (blob.size > MAX_PROFILE_AVATAR_BYTES) {
        toast.error("Compressed image is still too large. Try another photo.");
        return;
      }

      const up = await requestProfileAvatarUpload(PROFILE_AVATAR_OUTPUT_CONTENT_TYPE);
      if (!up.ok) {
        toast.error(up.message);
        return;
      }
      if (blob.size > up.maxBytes) {
        toast.error("Compressed image exceeds upload limit.");
        return;
      }
      let put: Response;
      try {
        put = await fetch(up.uploadUrl, {
          method: "PUT",
          body: blob,
          headers: up.headers,
        });
      } catch {
        toast.error(
          "Upload was blocked (often CORS). In DigitalOcean Spaces → Settings → CORS, allow PUT from this site’s origin (e.g. http://localhost:3000). See docs/digitalocean-deployment.md.",
        );
        return;
      }
      if (!put.ok) {
        toast.error("Upload failed. Check Spaces CORS, bucket policy, and credentials.");
        return;
      }
      const saved = await setProfileAvatarUrl(up.publicUrl);
      if (!saved.ok) {
        toast.error(saved.message);
        return;
      }
      toast.success("Profile photo updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <UserAvatar avatarUrl={avatarUrl} username={username} size="xl" className="text-base" />
      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_AVATAR_CONTENT_TYPES.join(",")}
        className="sr-only"
        onChange={(ev) => void onFile(ev)}
      />
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-10"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : "Change photo"}
        </Button>
        <p className="text-muted-foreground max-w-xs text-xs">
          JPEG, PNG, or WebP · up to 10 MB (compressed to ≤ 2 MB). Shown on leaderboards and contest
          previews.
        </p>
      </div>
    </div>
  );
}
