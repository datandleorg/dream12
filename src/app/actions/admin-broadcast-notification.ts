"use server";

import { revalidatePath } from "next/cache";
import { requireAdminService } from "@/lib/admin-server";

const MAX_TITLE_LEN = 120;
const MAX_BODY_LEN = 4000;
const INSERT_CHUNK = 400;

function safeInternalHref(raw: string | undefined): string | null {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  if (!t.startsWith("/")) return null;
  if (t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  return t;
}

export type AdminBroadcastResult =
  | { ok: true; recipientCount: number }
  | { ok: false; message: string };

/**
 * Inserts one in-app notification row per active profile (webhook → email/push per user).
 */
export async function adminBroadcastNotificationToAllUsers(input: {
  title: string;
  body: string;
  /** Optional in-app / email CTA path, e.g. /contests or /notifications */
  href?: string;
}): Promise<AdminBroadcastResult> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, message: "Title is required." };
  if (!body) return { ok: false, message: "Message body is required." };
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false, message: `Title must be at most ${MAX_TITLE_LEN} characters.` };
  }
  if (body.length > MAX_BODY_LEN) {
    return { ok: false, message: `Body must be at most ${MAX_BODY_LEN} characters.` };
  }

  const href = safeInternalHref(input.href);
  if (input.href?.trim() && !href) {
    return { ok: false, message: "Link must be a path starting with / (no http or //)." };
  }

  const gate = await requireAdminService();
  if (!gate.ok) return { ok: false, message: gate.message };

  const { service, userId } = gate;

  const { data: profiles, error: listErr } = await service
    .from("profiles")
    .select("id")
    .eq("is_active", true);

  if (listErr) {
    return { ok: false, message: listErr.message || "Could not list users." };
  }

  const ids = [...new Set((profiles ?? []).map((p) => p.id as string).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, message: "No active users to notify." };
  }

  const payload: Record<string, unknown> = {};
  if (href) payload.href = href;

  const rows = ids.map((user_id) => ({
    user_id,
    type: "admin_broadcast",
    title,
    body,
    payload,
  }));

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error: insErr } = await service.from("notifications").insert(chunk);
    if (insErr) {
      return {
        ok: false,
        message: insErr.message || "Insert failed partway through. Some users may not have received this broadcast.",
      };
    }
  }

  await service.from("admin_audit_log").insert({
    actor_id: userId,
    action: "notifications.admin_broadcast",
    entity_type: "notifications",
    entity_id: null,
    metadata: {
      recipient_count: ids.length,
      title_len: title.length,
      body_len: body.length,
      has_href: Boolean(href),
    },
  });

  revalidatePath("/admin/notifications");
  return { ok: true, recipientCount: ids.length };
}
