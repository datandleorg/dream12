import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Insert `contest_chatter_message` notifications for every other paid entrant (webhook → email + web push).
 */
export async function notifyContestChatterRecipients(input: {
  contestId: string;
  senderUserId: string;
  kind: "text" | "voice";
  bodyPreview: string;
}): Promise<void> {
  const service = createServiceClient();

  const { data: contest } = await service
    .from("contests")
    .select("name")
    .eq("id", input.contestId)
    .maybeSingle();

  const label = (contest?.name as string | null)?.trim() || "Contest";
  const title = `New message in ${label.length > 48 ? `${label.slice(0, 45)}…` : label}`;
  const body =
    input.kind === "voice"
      ? "Voice message — open the contest to listen."
      : input.bodyPreview.slice(0, 160);

  const { data: entrants, error: qErr } = await service
    .from("user_teams")
    .select("user_id")
    .eq("contest_id", input.contestId)
    .not("entry_fee_paid_at", "is", null);

  if (qErr || !entrants?.length) return;

  const targets = [
    ...new Set(
      entrants
        .map((r) => r.user_id as string)
        .filter((id) => id && id !== input.senderUserId),
    ),
  ];
  if (!targets.length) return;

  const href = `/contests/${input.contestId}?chatter=1`;
  const rows = targets.map((user_id) => ({
    user_id,
    type: "contest_chatter_message",
    title,
    body,
    payload: {
      contest_id: input.contestId,
      href,
      kind: input.kind,
    },
  }));

  await service.from("notifications").insert(rows);
}
