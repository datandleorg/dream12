"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  isMatchStatusOpenForContestChatter,
  MAX_CONTEST_CHATTER_POSTS_PER_MINUTE,
  MAX_CONTEST_CHATTER_TEXT_CHARS,
  MAX_CONTEST_CHATTER_VOICE_BYTES,
  MAX_CONTEST_CHATTER_VOICE_SECONDS,
} from "@/lib/contest-chatter/constants";
import { notifyContestChatterRecipients } from "@/lib/contest-chatter/notify-entrants";
import {
  chatterVoiceUploadRequestHeaders,
  isChatterVoiceUrlAllowedForContest,
  presignChatterVoicePut,
} from "@/lib/storage/do-spaces";

export type ChatterActionResult = { ok: true } | { ok: false; message: string };

export type PresignChatterVoiceResult =
  | {
      ok: true;
      uploadUrl: string;
      publicUrl: string;
      headers: Record<string, string>;
      maxBytes: number;
      maxSeconds: number;
    }
  | { ok: false; message: string };

async function assertPaidEntrantAndChatterWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  contestId: string,
): Promise<{ ok: true; matchId: number } | { ok: false; message: string }> {
  const { data: ut, error: utErr } = await supabase
    .from("user_teams")
    .select("id")
    .eq("contest_id", contestId)
    .eq("user_id", userId)
    .not("entry_fee_paid_at", "is", null)
    .maybeSingle();

  if (utErr || !ut) {
    return { ok: false, message: "You must join this contest to use chatter." };
  }

  const { data: contest, error: cErr } = await supabase
    .from("contests")
    .select("match_id")
    .eq("id", contestId)
    .single();

  if (cErr || !contest?.match_id) {
    return { ok: false, message: "Contest not found." };
  }

  const matchId = Number(contest.match_id);
  const { data: match, error: mErr } = await supabase
    .from("matches")
    .select("status")
    .eq("id", matchId)
    .single();

  if (mErr || !match) {
    return { ok: false, message: "Match not found." };
  }

  if (!isMatchStatusOpenForContestChatter(String(match.status))) {
    return {
      ok: false,
      message: "Chatter is only open before or during the live match.",
    };
  }

  return { ok: true, matchId };
}

async function rateLimitOk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contestId: string,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("contest_chatter_messages")
    .select("*", { count: "exact", head: true })
    .eq("contest_id", contestId)
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) return false;
  return (count ?? 0) < MAX_CONTEST_CHATTER_POSTS_PER_MINUTE;
}

export async function postContestChatterText(
  contestId: string,
  rawBody: string,
): Promise<ChatterActionResult> {
  const body = rawBody.trim();
  if (!body) return { ok: false, message: "Message is empty." };
  if (body.length > MAX_CONTEST_CHATTER_TEXT_CHARS) {
    return { ok: false, message: `Message is too long (max ${MAX_CONTEST_CHATTER_TEXT_CHARS} characters).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const gate = await assertPaidEntrantAndChatterWindow(supabase, user.id, contestId);
  if (!gate.ok) return gate;

  if (!(await rateLimitOk(supabase, contestId, user.id))) {
    return { ok: false, message: "You are sending messages too quickly. Try again in a minute." };
  }

  const { error: insErr } = await supabase.from("contest_chatter_messages").insert({
    contest_id: contestId,
    user_id: user.id,
    kind: "text",
    body,
  });

  if (insErr) {
    return { ok: false, message: insErr.message || "Could not send message." };
  }

  try {
    await notifyContestChatterRecipients({
      contestId,
      senderUserId: user.id,
      kind: "text",
      bodyPreview: body,
    });
  } catch {
    /* non-fatal */
  }

  return { ok: true };
}

export async function deleteContestChatterMessage(
  contestId: string,
  messageId: string,
): Promise<ChatterActionResult> {
  const id = messageId.trim();
  if (!id) return { ok: false, message: "Invalid message." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase
    .from("contest_chatter_messages")
    .delete()
    .eq("id", id)
    .eq("contest_id", contestId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, message: error.message || "Could not delete message." };
  }

  return { ok: true };
}

export async function requestContestChatterVoiceUpload(
  contestId: string,
  contentType: string,
): Promise<PresignChatterVoiceResult> {
  const ct = contentType.trim().toLowerCase();
  if (!ct.startsWith("audio/webm") && !ct.startsWith("audio/mp4")) {
    return { ok: false, message: "Unsupported audio type. Use WebM or MP4." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const gate = await assertPaidEntrantAndChatterWindow(supabase, user.id, contestId);
  if (!gate.ok) return gate;

  const ext = ct.startsWith("audio/mp4") ? "m4a" : "webm";
  const objectKey = `contest-chatter/${contestId}/${randomUUID()}.${ext}`;

  try {
    const { uploadUrl, publicUrl } = await presignChatterVoicePut({
      contentType: contentType.trim(),
      objectKey,
    });
    return {
      ok: true,
      uploadUrl,
      publicUrl,
      headers: chatterVoiceUploadRequestHeaders(contentType.trim()),
      maxBytes: MAX_CONTEST_CHATTER_VOICE_BYTES,
      maxSeconds: MAX_CONTEST_CHATTER_VOICE_SECONDS,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Storage is not configured.";
    return { ok: false, message: msg };
  }
}

export async function postContestChatterVoice(
  contestId: string,
  publicUrl: string,
  durationSeconds: number,
): Promise<ChatterActionResult> {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return { ok: false, message: "Invalid voice duration." };
  }
  if (durationSeconds > MAX_CONTEST_CHATTER_VOICE_SECONDS) {
    return { ok: false, message: `Voice clips must be ${MAX_CONTEST_CHATTER_VOICE_SECONDS} seconds or shorter.` };
  }

  if (!isChatterVoiceUrlAllowedForContest(publicUrl, contestId)) {
    return { ok: false, message: "Invalid audio URL." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const gate = await assertPaidEntrantAndChatterWindow(supabase, user.id, contestId);
  if (!gate.ok) return gate;

  if (!(await rateLimitOk(supabase, contestId, user.id))) {
    return { ok: false, message: "You are sending messages too quickly. Try again in a minute." };
  }

  const { error: insErr } = await supabase.from("contest_chatter_messages").insert({
    contest_id: contestId,
    user_id: user.id,
    kind: "voice",
    body: null,
    audio_url: publicUrl.trim(),
    audio_duration_seconds: Math.round(durationSeconds),
  });

  if (insErr) {
    return { ok: false, message: insErr.message || "Could not save voice message." };
  }

  try {
    await notifyContestChatterRecipients({
      contestId,
      senderUserId: user.id,
      kind: "voice",
      bodyPreview: "",
    });
  } catch {
    /* non-fatal */
  }

  return { ok: true };
}
