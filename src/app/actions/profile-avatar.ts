"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getActionLogContext } from "@/lib/action-log-context";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/server-log";
import { MAX_PROFILE_AVATAR_BYTES } from "@/lib/profile-avatar-limits";
import {
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
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logActivity({ action: "profile.avatar_presign", ...ctx, ok: false, message: "not_signed_in" });
    return { ok: false, message: "Not signed in." };
  }

  const ext = extensionForContentType(contentType);
  if (!ext) {
    logActivity({ action: "profile.avatar_presign", userId: user.id, ...ctx, ok: false, message: "bad_type" });
    return { ok: false, message: "Use JPEG, PNG, or WebP." };
  }

  const objectKey = `avatars/${user.id}/${randomUUID()}.${ext}`;
  try {
    const { uploadUrl, publicUrl } = await presignAvatarPut({
      contentType: contentType.trim(),
      objectKey,
    });
    logActivity({ action: "profile.avatar_presign", userId: user.id, ...ctx, ok: true });
    return {
      ok: true,
      uploadUrl,
      publicUrl,
      // ACL is applied via query params on the presigned URL (not a separate header).
      headers: { "Content-Type": contentType.trim() },
      maxBytes: MAX_PROFILE_AVATAR_BYTES,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload not available.";
    logActivity({ action: "profile.avatar_presign", userId: user.id, ...ctx, ok: false, message: msg });
    return { ok: false, message: msg };
  }
}

export async function setProfileAvatarUrl(publicUrl: string): Promise<SetProfileAvatarResult> {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logActivity({ action: "profile.avatar_set", ...ctx, ok: false, message: "not_signed_in" });
    return { ok: false, message: "Not signed in." };
  }

  const trimmed = publicUrl.trim();
  if (!trimmed) {
    logActivity({ action: "profile.avatar_set", userId: user.id, ...ctx, ok: false, message: "empty_url" });
    return { ok: false, message: "Missing image URL." };
  }

  let allowed = false;
  try {
    allowed = isAvatarUrlAllowedForUser(trimmed, user.id);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    logActivity({ action: "profile.avatar_set", userId: user.id, ...ctx, ok: false, message: "url_not_allowed" });
    return { ok: false, message: "Invalid image URL." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: trimmed })
    .eq("id", user.id);

  if (error) {
    logActivity({ action: "profile.avatar_set", userId: user.id, ...ctx, ok: false, message: error.message });
    return { ok: false, message: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  logActivity({ action: "profile.avatar_set", userId: user.id, ...ctx, ok: true });
  return { ok: true };
}
