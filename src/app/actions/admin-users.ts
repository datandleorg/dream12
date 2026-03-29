"use server";

import { revalidatePath } from "next/cache";
import { requireAdminService, requireAdminSession } from "@/lib/admin-server";

export async function adminCreateUser(input: {
  email: string;
  password: string;
  username: string;
}) {
  const r = await requireAdminService();
  if (!r.ok) return { ok: false as const, message: r.message };
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();
  if (!email || !input.password || !username) {
    return { ok: false as const, message: "Email, password, and username required" };
  }
  const { data, error } = await r.service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) return { ok: false as const, message: error.message };
  await r.service.from("admin_audit_log").insert({
    actor_id: r.userId,
    action: "user.created",
    entity_type: "auth_user",
    entity_id: data.user?.id ?? "",
    metadata: { email, username },
  });
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function adminDeleteUser(userId: string) {
  const r = await requireAdminService();
  if (!r.ok) return { ok: false as const, message: r.message };
  if (userId === r.userId) {
    return { ok: false as const, message: "You cannot delete your own account" };
  }
  const { error } = await r.service.auth.admin.deleteUser(userId);
  if (error) return { ok: false as const, message: error.message };
  await r.service.from("admin_audit_log").insert({
    actor_id: r.userId,
    action: "user.deleted",
    entity_type: "auth_user",
    entity_id: userId,
    metadata: {},
  });
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function adminUpdateUsername(userId: string, username: string) {
  const r = await requireAdminService();
  if (!r.ok) return { ok: false as const, message: r.message };
  const u = username.trim();
  if (!u) return { ok: false as const, message: "Username required" };
  const { error } = await r.service.from("profiles").update({ username: u }).eq("id", userId);
  if (error) return { ok: false as const, message: error.message };
  await r.service.from("admin_audit_log").insert({
    actor_id: r.userId,
    action: "profile.username_updated",
    entity_type: "profile",
    entity_id: userId,
    metadata: { username: u },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function adminUpdateEmail(userId: string, email: string) {
  const r = await requireAdminService();
  if (!r.ok) return { ok: false as const, message: r.message };
  const em = email.trim().toLowerCase();
  if (!em) return { ok: false as const, message: "Email required" };
  const { error } = await r.service.auth.admin.updateUserById(userId, { email: em });
  if (error) return { ok: false as const, message: error.message };
  await r.service.from("admin_audit_log").insert({
    actor_id: r.userId,
    action: "user.email_updated",
    entity_type: "auth_user",
    entity_id: userId,
    metadata: { email: em },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function adminSetIsAdmin(userId: string, isAdmin: boolean) {
  const r = await requireAdminService();
  if (!r.ok) return { ok: false as const, message: r.message };
  if (userId === r.userId && !isAdmin) {
    return { ok: false as const, message: "Cannot remove your own admin access" };
  }
  const { error } = await r.service.from("profiles").update({ is_admin: isAdmin }).eq("id", userId);
  if (error) return { ok: false as const, message: error.message };
  await r.service.from("admin_audit_log").insert({
    actor_id: r.userId,
    action: "profile.is_admin_updated",
    entity_type: "profile",
    entity_id: userId,
    metadata: { is_admin: isAdmin },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function adminAdjustWallet(
  userId: string,
  deltaInr: number,
  reason: string,
) {
  const gate = await requireAdminSession();
  if (!gate.ok) return { ok: false as const, message: gate.message };
  const why = reason.trim();
  if (!why) return { ok: false as const, message: "Reason required" };
  const { error } = await gate.supabase.rpc("admin_adjust_wallet_balance", {
    p_user_id: userId,
    p_delta_inr: deltaInr,
    p_reason: why,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/wallet");
  return { ok: true as const };
}
