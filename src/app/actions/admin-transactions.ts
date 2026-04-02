"use server";

import { revalidatePath } from "next/cache";
import { getActionLogContext } from "@/lib/action-log-context";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/server-log";

export async function approveTransaction(id: string) {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("admin_approve_transaction", {
    p_transaction_id: id,
  });
  if (error) {
    logActivity({
      action: "admin.transaction.approve",
      userId: user?.id ?? null,
      ...ctx,
      ok: false,
      message: error.message,
      metadata: { transactionId: id },
    });
    return { ok: false as const, message: error.message };
  }
  revalidatePath("/admin/transactions");
  revalidatePath("/wallet");
  logActivity({
    action: "admin.transaction.approve",
    userId: user?.id ?? null,
    ...ctx,
    ok: true,
    metadata: { transactionId: id },
  });
  return { ok: true as const };
}

export async function rejectTransaction(id: string) {
  const ctx = await getActionLogContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("admin_reject_transaction", {
    p_transaction_id: id,
  });
  if (error) {
    logActivity({
      action: "admin.transaction.reject",
      userId: user?.id ?? null,
      ...ctx,
      ok: false,
      message: error.message,
      metadata: { transactionId: id },
    });
    return { ok: false as const, message: error.message };
  }
  revalidatePath("/admin/transactions");
  logActivity({
    action: "admin.transaction.reject",
    userId: user?.id ?? null,
    ...ctx,
    ok: true,
    metadata: { transactionId: id },
  });
  return { ok: true as const };
}
