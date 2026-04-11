"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Mic, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteContestChatterMessage, postContestChatterText } from "@/app/actions/contest-chatter";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { useChatterVoiceRecorder } from "@/components/contest-chatter/use-chatter-voice-recorder";
import { VoiceMessagePlayer } from "@/components/contest-chatter/voice-message-player";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_CONTEST_CHATTER_TEXT_CHARS,
  MAX_CONTEST_CHATTER_VOICE_SECONDS,
} from "@/lib/contest-chatter/constants";
import { cn } from "@/lib/utils";

export type ContestChatterMessage = {
  id: string;
  contest_id: string;
  user_id: string;
  kind: "text" | "voice";
  body: string | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatRecSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function ChatterRecordingVuBars({ cancelPending }: { cancelPending: boolean }) {
  const n = 36;
  return (
    <div
      className="flex h-9 min-w-0 flex-1 items-end justify-center gap-px overflow-hidden px-1"
      aria-hidden
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn(
            "chatter-rec-vu-bar w-0.5 min-w-0.5 max-w-0.5 rounded-full",
            cancelPending ? "bg-muted-foreground/70" : "bg-destructive",
          )}
          style={{
            height: `${10 + ((i * 17) % 11) * 2}px`,
            animationDelay: `${(i % 10) * 45}ms`,
          }}
        />
      ))}
    </div>
  );
}

export function ContestChatterPanel({
  contestId,
  currentUserId,
  chatterOpen,
  initialMessages,
}: {
  contestId: string;
  currentUserId: string | null;
  /** True when match status allows posting (e.g. upcoming for testing, or live). */
  chatterOpen: boolean;
  initialMessages: ContestChatterMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [tapMode, setTapMode] = useState(false);
  const [textSending, setTextSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const suppressMicClickRef = useRef(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const voice = useChatterVoiceRecorder({
    contestId,
    enabled: chatterOpen,
    tapMode,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTapMode(true);
    }
  }, []);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const appendMessage = useCallback((row: ContestChatterMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === row.id)) return prev;
      return [...prev, row].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const run = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;
      await supabase.realtime.setAuth(token);
      if (cancelled) return;
      channel = supabase
        .channel(`contest-chatter:${contestId}`)
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "contest_chatter_messages",
            filter: `contest_id=eq.${contestId}`,
          },
          (payload) => {
            const oldRow = payload.old as Record<string, unknown> | null;
            const delId = typeof oldRow?.id === "string" ? oldRow.id : null;
            if (!delId) return;
            setMessages((prev) => prev.filter((x) => x.id !== delId));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "contest_chatter_messages",
            filter: `contest_id=eq.${contestId}`,
          },
          async (payload) => {
            const n = payload.new as Record<string, unknown>;
            const id = typeof n.id === "string" ? n.id : null;
            const user_id = typeof n.user_id === "string" ? n.user_id : null;
            const kind = n.kind === "voice" || n.kind === "text" ? n.kind : null;
            if (!id || !user_id || !kind) return;

            let username: string | null = null;
            let avatar_url: string | null = null;
            const { data: prof } = await supabase
              .from("profile_usernames")
              .select("username,avatar_url")
              .eq("id", user_id)
              .maybeSingle();
            if (prof) {
              username = (prof.username as string) ?? null;
              avatar_url = (prof.avatar_url as string | null) ?? null;
            }

            appendMessage({
              id,
              contest_id: contestId,
              user_id,
              kind,
              body: typeof n.body === "string" ? n.body : null,
              audio_url: typeof n.audio_url === "string" ? n.audio_url : null,
              audio_duration_seconds:
                typeof n.audio_duration_seconds === "number"
                  ? n.audio_duration_seconds
                  : n.audio_duration_seconds != null
                    ? Number(n.audio_duration_seconds)
                    : null,
              created_at: typeof n.created_at === "string" ? n.created_at : new Date().toISOString(),
              username,
              avatar_url,
            });
          },
        )
        .subscribe();
    };

    void run();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [contestId, currentUserId, appendMessage]);

  async function onSendText() {
    const t = text.trim();
    if (!t || voice.sending || textSending || !chatterOpen) return;
    setTextSending(true);
    const r = await postContestChatterText(contestId, t);
    setTextSending(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    setText("");
  }

  const wrapVoicePointerUp = useCallback(
    (handler: (e: React.PointerEvent) => void | Promise<void>) => {
      return (e: React.PointerEvent) => {
        suppressMicClickRef.current = true;
        window.setTimeout(() => {
          suppressMicClickRef.current = false;
        }, 400);
        void handler(e);
      };
    },
    [],
  );

  async function onDeleteMessage(messageId: string) {
    if (!currentUserId || deletingId) return;
    if (!window.confirm("Delete this message?")) return;
    setDeletingId(messageId);
    const r = await deleteContestChatterMessage(contestId, messageId);
    setDeletingId(null);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    toast.success("Message deleted");
  }

  const canCompose = Boolean(currentUserId) && chatterOpen;

  return (
    <div className="relative flex flex-col gap-3">
      {!chatterOpen ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg border px-3 py-2 text-sm">
          Chatter opens while the match is <span className="font-medium text-foreground">upcoming</span> or{" "}
          <span className="font-medium text-foreground">live</span>. You can still read messages below.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Keep it fun and respectful. Voice up to {MAX_CONTEST_CHATTER_VOICE_SECONDS}s —{" "}
          {tapMode ? (
            <span>tap mic to start/stop.</span>
          ) : (
            <span>
              <span className="text-foreground/90">hold mic</span> to record, release to send; slide up to cancel.
            </span>
          )}{" "}
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setTapMode((v) => !v)}
          >
            {tapMode ? "Use hold-to-record" : "Tap mode"}
          </button>
        </p>
      )}

      <div className="bg-card max-h-[min(420px,50vh)] space-y-3 overflow-y-auto rounded-xl border p-3">
        {messages.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const isOwn = Boolean(currentUserId && m.user_id === currentUserId);
            const bubble = (
              <div
                className={cn(
                  "min-w-0 max-w-[min(88%,380px)] rounded-2xl px-3 py-2 shadow-sm",
                  isOwn ? "bg-primary/18 text-foreground" : "bg-muted/70 hover:bg-muted/85",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="truncate text-sm font-medium">{m.username ?? "Player"}</span>
                    <span className="text-muted-foreground shrink-0 text-[10px]">{formatTime(m.created_at)}</span>
                  </div>
                  {isOwn ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-7 shrink-0"
                      disabled={deletingId === m.id}
                      aria-label="Delete message"
                      onClick={() => void onDeleteMessage(m.id)}
                    >
                      {deletingId === m.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-3.5" aria-hidden />
                      )}
                    </Button>
                  ) : null}
                </div>
                {m.kind === "text" && m.body ? (
                  <p className="wrap-break-word text-sm whitespace-pre-wrap">{m.body}</p>
                ) : m.kind === "voice" && m.audio_url ? (
                  <VoiceMessagePlayer
                    src={m.audio_url}
                    durationSeconds={m.audio_duration_seconds}
                    messageId={m.id}
                    isOwn={isOwn}
                  />
                ) : null}
              </div>
            );
            const avatar = (
              <UserAvatar avatarUrl={m.avatar_url} username={m.username} size="sm" className="shrink-0" />
            );
            return (
              <div
                key={m.id}
                className={cn(
                  "flex w-full min-w-0 items-end gap-2",
                  isOwn ? "flex-row justify-end" : "flex-row justify-start",
                )}
              >
                {isOwn ? (
                  <>
                    {bubble}
                    {avatar}
                  </>
                ) : (
                  <>
                    {avatar}
                    {bubble}
                  </>
                )}
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {canCompose ? (
        voice.recording ? (
          <div
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-2 shadow-sm",
              "border-destructive/35 bg-destructive/8",
              voice.cancelPending && "border-destructive bg-destructive/15",
            )}
            aria-live="polite"
          >
            <div
              className={cn(
                "flex max-w-[38%] shrink-0 flex-col gap-0.5 text-[11px] leading-tight sm:max-w-[42%]",
                voice.cancelPending ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {tapMode ? (
                <span className="font-medium">Tap red mic to send</span>
              ) : (
                <>
                  <span className="flex items-center gap-0.5 font-medium">
                    <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
                    {voice.cancelPending ? "Release to cancel" : "Slide up to cancel"}
                  </span>
                  {!voice.cancelPending ? (
                    <span className="text-muted-foreground/85 pl-4">Release to send</span>
                  ) : null}
                </>
              )}
            </div>
            <ChatterRecordingVuBars cancelPending={voice.cancelPending} />
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-foreground w-[3.25rem] text-center text-lg font-semibold tabular-nums tracking-tight">
                {formatRecSecs(voice.recordSeconds)}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className={cn(
                  "size-10 shrink-0 touch-none select-none rounded-full !bg-red-600 !text-white hover:!bg-red-700 focus-visible:ring-red-500/40 dark:!bg-red-600 dark:hover:!bg-red-700",
                  "ring-2 ring-red-500/35 ring-offset-2 ring-offset-background",
                  voice.recording && "animate-pulse motion-reduce:animate-none",
                  !tapMode && "cursor-grab active:cursor-grabbing",
                )}
                disabled={voice.sending || textSending}
                aria-pressed={voice.recording}
                aria-label={
                  voice.sending
                    ? "Sending voice message"
                    : tapMode
                      ? `Stop recording and send (${voice.recordSeconds}s)`
                      : "Recording — release to send"
                }
                onClick={(e) => {
                  if (suppressMicClickRef.current) {
                    e.preventDefault();
                    return;
                  }
                  if (!tapMode) {
                    e.preventDefault();
                    return;
                  }
                  void voice.onMicClickTapMode();
                }}
                onPointerDown={tapMode ? undefined : voice.onMicPointerDown}
                onPointerMove={tapMode ? undefined : voice.onMicPointerMove}
                onPointerUp={tapMode ? undefined : wrapVoicePointerUp(voice.onMicPointerUp)}
                onPointerCancel={tapMode ? undefined : wrapVoicePointerUp(voice.onMicPointerCancel)}
                onContextMenu={voice.onMicContextMenu}
              >
                {voice.sending ? (
                  <Loader2 className="size-4 animate-spin text-white" aria-hidden />
                ) : (
                  <Mic className="size-4 text-white" aria-hidden />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CONTEST_CHATTER_TEXT_CHARS))}
              placeholder="Tease, rag, cheer…"
              rows={2}
              className="border-input bg-background focus-visible:ring-ring min-h-10 flex-1 resize-y rounded-xl border px-3 py-2.5 text-sm leading-snug outline-none focus-visible:ring-2"
              disabled={voice.sending || textSending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSendText();
                }
              }}
            />
            <div className="flex shrink-0 items-center gap-1 pb-0.5">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-10 shrink-0 rounded-full !bg-red-600 !text-white hover:!bg-red-700 focus-visible:ring-red-500/40 dark:!bg-red-600 dark:hover:!bg-red-700"
                disabled={voice.sending || textSending || !text.trim()}
                aria-label="Send message"
                onClick={() => void onSendText()}
              >
                {textSending ? (
                  <Loader2 className="size-4 animate-spin text-white" aria-hidden />
                ) : (
                  <Send className="size-4 text-white" aria-hidden />
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className={cn(
                  "size-10 shrink-0 touch-none select-none rounded-full",
                  !tapMode && "cursor-grab active:cursor-grabbing",
                )}
                disabled={voice.sending || textSending}
                aria-pressed={false}
                aria-label={
                  voice.sending
                    ? "Sending voice message"
                    : tapMode
                      ? "Start voice recording"
                      : "Hold to record voice"
                }
                onClick={(e) => {
                  if (suppressMicClickRef.current) {
                    e.preventDefault();
                    return;
                  }
                  if (!tapMode) {
                    e.preventDefault();
                    return;
                  }
                  void voice.onMicClickTapMode();
                }}
                onPointerDown={tapMode ? undefined : voice.onMicPointerDown}
                onPointerMove={tapMode ? undefined : voice.onMicPointerMove}
                onPointerUp={tapMode ? undefined : wrapVoicePointerUp(voice.onMicPointerUp)}
                onPointerCancel={tapMode ? undefined : wrapVoicePointerUp(voice.onMicPointerCancel)}
                onContextMenu={voice.onMicContextMenu}
              >
                {voice.sending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Mic className="size-4" aria-hidden />
                )}
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
