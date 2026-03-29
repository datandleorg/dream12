"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function approvePayInRequest(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_pay_in_request", {
    p_id: id,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/pay-in-requests");
  revalidatePath("/wallet");
  return { ok: true as const };
}

export async function rejectPayInRequest(id: string, adminNote?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_pay_in_request", {
    p_id: id,
    p_admin_note: adminNote ?? null,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/pay-in-requests");
  revalidatePath("/wallet");
  return { ok: true as const };
}

export async function approvePayOutRequest(id: string, payoutUtrRef: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_pay_out_request", {
    p_id: id,
    p_payout_utr_ref: payoutUtrRef.trim(),
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/pay-out-requests");
  revalidatePath("/wallet");
  return { ok: true as const };
}

export async function rejectPayOutRequest(id: string, adminNote?: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_pay_out_request", {
    p_id: id,
    p_admin_note: adminNote ?? null,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/pay-out-requests");
  revalidatePath("/wallet");
  return { ok: true as const };
}
