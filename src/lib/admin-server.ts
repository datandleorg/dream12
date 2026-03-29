import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminGate =
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; message: string };

/** Cookie session must be an admin. */
export async function requireAdminSession(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return { ok: false, message: "Not authorized" };
  return { ok: true, userId: user.id, supabase };
}

export async function requireAdminService() {
  const gate = await requireAdminSession();
  if (!gate.ok) return { ok: false as const, message: gate.message };
  return {
    ok: true as const,
    userId: gate.userId,
    supabase: gate.supabase,
    service: createServiceClient(),
  };
}
