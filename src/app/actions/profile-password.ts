"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateNewPasswordStrength } from "@/lib/password-policy";

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, message: "Not signed in or no email on this account." };
  }

  const hasEmailIdentity = user.identities?.some((i) => i.provider === "email");
  if (!hasEmailIdentity) {
    return {
      ok: false,
      message: "Password sign-in isn't enabled for this account.",
    };
  }

  const current = input.currentPassword;
  const next = input.newPassword;
  if (!current) {
    return { ok: false, message: "Enter your current password." };
  }

  const strengthErr = validateNewPasswordStrength(next);
  if (strengthErr) return { ok: false, message: strengthErr };

  if (next === current) {
    return { ok: false, message: "New password must differ from your current password." };
  }

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (signErr) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: next });
  if (updateErr) {
    return { ok: false, message: updateErr.message };
  }

  revalidatePath("/profile");
  return { ok: true };
}
