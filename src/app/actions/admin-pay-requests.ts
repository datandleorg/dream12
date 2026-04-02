"use server";

import { revalidatePath } from "next/cache";
import { getActionLogContext } from "@/lib/action-log-context";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/server-log";

export async function approvePayInRequest(id: string) {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("admin_approve_pay_in_request", {
    p_id: id,
  });
  if (error) {
    logActivity({
      action: "admin.pay_in.approve",
      userId: user?.id ?? null,
      ...ctx,
      ok: false,
      message: error.message,
      metadata: { requestId: id },
    });
    return { ok: false as const, message: error.message };
  }
  revalidatePath("/admin/pay-in-requests");
  revalidatePath("/wallet");
  logActivity({
    action: "admin.pay_in.approve",
    userId: user?.id ?? null,
    ...ctx,
    ok: true,
    metadata: { requestId: id },
  });
  return { ok: true as const };
}

export async function rejectPayInRequest(id: string, adminNote?: string) {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("admin_reject_pay_in_request", {
    p_id: id,
    p_admin_note: adminNote ?? null,
  });
  if (error) {
    logActivity({
      action: "admin.pay_in.reject",
      userId: user?.id ?? null,
      ...ctx,
      ok: false,
      message: error.message,
      metadata: { requestId: id },
    });
    return { ok: false as const, message: error.message };
  }
  revalidatePath("/admin/pay-in-requests");
  revalidatePath("/wallet");
  logActivity({
    action: "admin.pay_in.reject",
    userId: user?.id ?? null,
    ...ctx,
    ok: true,
    metadata: { requestId: id },
  });
  return { ok: true as const };
}

export async function approvePayOutRequest(id: string, payoutUtrRef: string) {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("admin_approve_pay_out_request", {
    p_id: id,
    p_payout_utr_ref: payoutUtrRef.trim(),
  });
  if (error) {
    logActivity({
      action: "admin.pay_out.approve",
      userId: user?.id ?? null,
      ...ctx,
      ok: false,
      message: error.message,
      metadata: { requestId: id },
    });
    return { ok: false as const, message: error.message };
  }
  revalidatePath("/admin/pay-out-requests");
  revalidatePath("/wallet");
  logActivity({
    action: "admin.pay_out.approve",
    userId: user?.id ?? null,
    ...ctx,
    ok: true,
    metadata: { requestId: id },
  });
  return { ok: true as const };
}

export async function rejectPayOutRequest(id: string, adminNote?: string) {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("admin_reject_pay_out_request", {
    p_id: id,
    p_admin_note: adminNote ?? null,
  });
  if (error) {
    logActivity({
      action: "admin.pay_out.reject",
      userId: user?.id ?? null,
      ...ctx,
      ok: false,
      message: error.message,
      metadata: { requestId: id },
    });
    return { ok: false as const, message: error.message };
  }
  revalidatePath("/admin/pay-out-requests");
  revalidatePath("/wallet");
  logActivity({
    action: "admin.pay_out.reject",
    userId: user?.id ?? null,
    ...ctx,
    ok: true,
    metadata: { requestId: id },
  });
  return { ok: true as const };
}
