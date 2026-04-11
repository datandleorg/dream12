"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VOICE_AUDIO_SELECTOR = "audio[data-contest-chatter-voice]";

function formatTrackTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pauseAllContestChatterAudio(except: HTMLAudioElement | null) {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLAudioElement>(VOICE_AUDIO_SELECTOR).forEach((el) => {
    if (el !== except && !el.paused) el.pause();
  });
}

const SPEEDS = [1, 1.5, 2] as const;

export function VoiceMessagePlayer({
  src,
  durationSeconds,
  messageId,
  isOwn = false,
}: {
  src: string;
  durationSeconds: number | null;
  messageId: string;
  /** Sender is the current user — tweaks bubble colors for alignment column. */
  isOwn?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const fallbackTotal =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : 0;
  const total = dur > 0 ? dur : fallbackTotal;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onLoaded = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDur(a.duration);
    };
    const onTime = () => setCurrent(a.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onPlay = () => {
      pauseAllContestChatterAudio(a);
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => {
        /* autoplay policies */
      });
    } else {
      a.pause();
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    a.playbackRate = SPEEDS[next];
  }, [speedIdx]);

  const onBarPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const a = audioRef.current;
      if (!a || total <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      a.currentTime = Math.max(0, Math.min(total, pct * total));
      setCurrent(a.currentTime);
    },
    [total],
  );

  const progressPct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  const barHeights = useMemo(() => {
    let h = 0;
    for (let i = 0; i < messageId.length; i++) h = (h * 31 + messageId.charCodeAt(i)) >>> 0;
    return Array.from({ length: 24 }, (_, i) => 6 + ((h >> (i % 20)) & 0xf));
  }, [messageId]);

  return (
    <div
      className={cn(
        "flex w-full max-w-[min(100%,300px)] items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-2",
        isOwn
          ? "border-primary/35 bg-primary/10 dark:bg-primary/15"
          : "border-primary/25 bg-muted/60 dark:bg-muted/40",
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-contest-chatter-voice=""
        className="hidden"
        aria-hidden
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="size-9 shrink-0 rounded-full"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 pl-0.5" />}
      </Button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-7 cursor-pointer items-end justify-between gap-px px-0.5"
          onPointerDown={onBarPointerDown}
          role="slider"
          aria-valuenow={Math.round(current)}
          aria-valuemin={0}
          aria-valuemax={Math.round(total) || 1}
          aria-label="Playback position"
        >
          {barHeights.map((hp, i) => {
            const filled = (i + 1) / barHeights.length <= progressPct / 100;
            return (
              <span
                key={i}
                className={cn(
                  "w-0.5 min-w-0.5 shrink-0 rounded-full bg-primary/35 transition-colors",
                  filled && "bg-primary/85",
                )}
                style={{ height: `${hp}px` }}
              />
            );
          })}
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center justify-between gap-2 text-[10px] tabular-nums">
          <span>
            {formatTrackTime(current)} / {formatTrackTime(total || fallbackTotal)}
          </span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${SPEEDS[speedIdx]} times`}
          >
            {SPEEDS[speedIdx]}×
          </button>
        </div>
      </div>
    </div>
  );
}
