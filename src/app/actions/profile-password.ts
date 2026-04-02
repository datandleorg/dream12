"use server";

import { revalidatePath } from "next/cache";
import { getActionLogContext } from "@/lib/action-log-context";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/server-log";
import { validateNewPasswordStrength } from "@/lib/password-policy";

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    logActivity({ action: "profile.password_change", ...ctx, ok: false, message: "no_user" });
    return { ok: false, message: "Not signed in or no email on this account." };
  }

  const hasEmailIdentity = user.identities?.some((i) => i.provider === "email");
  if (!hasEmailIdentity) {
    logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: false, message: "no_email_provider" });
    return {
      ok: false,
      message: "Password sign-in isn't enabled for this account.",
    };
  }

  const current = input.currentPassword;
  const next = input.newPassword;
  if (!current) {
    logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: false, message: "no_current" });
    return { ok: false, message: "Enter your current password." };
  }

  const strengthErr = validateNewPasswordStrength(next);
  if (strengthErr) {
    logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: false, message: "weak_password" });
    return { ok: false, message: strengthErr };
  }

  if (next === current) {
    logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: false, message: "same_password" });
    return { ok: false, message: "New password must differ from your current password." };
  }

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (signErr) {
    logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: false, message: "bad_current" });
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: next });
  if (updateErr) {
    logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: false, message: updateErr.message });
    return { ok: false, message: updateErr.message };
  }

  revalidatePath("/profile");
  logActivity({ action: "profile.password_change", userId: user.id, ...ctx, ok: true });
  return { ok: true };
}
