"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function approveTransaction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_transaction", {
    p_transaction_id: id,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/transactions");
  revalidatePath("/wallet");
  return { ok: true as const };
}

export async function rejectTransaction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_transaction", {
    p_transaction_id: id,
  });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/admin/transactions");
  return { ok: true as const };
}
