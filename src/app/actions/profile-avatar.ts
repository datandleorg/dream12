"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_PROFILE_AVATAR_BYTES } from "@/lib/profile-avatar-limits";
import {
  avatarUploadRequestHeaders,
  extensionForContentType,
  isAvatarUrlAllowedForUser,
  presignAvatarPut,
} from "@/lib/storage/do-spaces";

export type ProfileAvatarUploadResult =
  | {
      ok: true;
      uploadUrl: string;
      publicUrl: string;
      headers: Record<string, string>;
      maxBytes: number;
    }
  | { ok: false; message: string };

export type SetProfileAvatarResult = { ok: true } | { ok: false; message: string };

export async function requestProfileAvatarUpload(
  contentType: string,
): Promise<ProfileAvatarUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const ext = extensionForContentType(contentType);
  if (!ext) return { ok: false, message: "Use JPEG, PNG, or WebP." };

  // New key per upload — never overwrite; new URL in DB busts browser/CDN caches for the avatar.
  const version = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const objectKey = `avatars/${user.id}/${version}.${ext}`;
  try {
    const { uploadUrl, publicUrl } = await presignAvatarPut({
      contentType: contentType.trim(),
      objectKey,
    });
    return {
      ok: true,
      uploadUrl,
      publicUrl,
      headers: avatarUploadRequestHeaders(contentType.trim()),
      maxBytes: MAX_PROFILE_AVATAR_BYTES,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload not available.";
    return { ok: false, message: msg };
  }
}

export async function setProfileAvatarUrl(publicUrl: string): Promise<SetProfileAvatarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const trimmed = publicUrl.trim();
  if (!trimmed) return { ok: false, message: "Missing image URL." };

  let allowed = false;
  try {
    allowed = isAvatarUrlAllowedForUser(trimmed, user.id);
  } catch {
    allowed = false;
  }
  if (!allowed) return { ok: false, message: "Invalid image URL." };

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: trimmed })
    .eq("id", user.id);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}
