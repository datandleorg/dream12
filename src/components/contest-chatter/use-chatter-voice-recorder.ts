"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { postContestChatterVoice, requestContestChatterVoiceUpload } from "@/app/actions/contest-chatter";
import {
  MAX_CONTEST_CHATTER_VOICE_BYTES,
  MAX_CONTEST_CHATTER_VOICE_SECONDS,
} from "@/lib/contest-chatter/constants";

const HOLD_DELAY_MS = 220;
const CANCEL_SLIDE_PX = 56;

function pickMime(): string {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")) {
    return "audio/webm";
  }
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4";
  }
  return "audio/webm";
}

export function useChatterVoiceRecorder(args: {
  contestId: string;
  /** When false, recording cannot start. */
  enabled: boolean;
  tapMode: boolean;
}) {
  const { contestId, enabled, tapMode } = args;

  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cancelPending, setCancelPending] = useState(false);
  const cancelPendingRef = useRef(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const secondsRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownYRef = useRef<number | null>(null);
  const recordingStartedForGestureRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const cleanupTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const stopStreamTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const cleanupRecording = useCallback(() => {
    cleanupTimers();
    recorderRef.current = null;
    chunksRef.current = [];
    secondsRef.current = 0;
    stopStreamTracks();
    setRecording(false);
    setRecordSeconds(0);
    cancelPendingRef.current = false;
    setCancelPending(false);
    recordingStartedForGestureRef.current = false;
    activePointerIdRef.current = null;
    pointerDownYRef.current = null;
  }, [cleanupTimers, stopStreamTracks]);

  const finalizeSend = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      cleanupRecording();
      return;
    }
    cleanupTimers();

    setSending(true);
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });

    const mime = rec.mimeType || pickMime();
    const blob = new Blob(chunksRef.current, { type: mime });
    const secondsAtStop = secondsRef.current;
    cleanupRecording();

    if (blob.size > MAX_CONTEST_CHATTER_VOICE_BYTES) {
      setSending(false);
      toast.error("Recording is too large. Try a shorter message.");
      return;
    }

    const duration = Math.min(Math.max(1, secondsAtStop), MAX_CONTEST_CHATTER_VOICE_SECONDS);

    const presign = await requestContestChatterVoiceUpload(contestId, mime);
    if (!presign.ok) {
      setSending(false);
      toast.error(presign.message);
      return;
    }

    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: presign.headers,
      body: blob,
    });
    if (!put.ok) {
      setSending(false);
      toast.error("Could not upload voice clip.");
      return;
    }

    const post = await postContestChatterVoice(contestId, presign.publicUrl, duration);
    setSending(false);
    if (!post.ok) {
      toast.error(post.message);
      return;
    }
    toast.success("Voice sent");
  }, [cleanupRecording, cleanupTimers, contestId]);

  const discardRecording = useCallback(async () => {
    const rec = recorderRef.current;
    cleanupTimers();
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.stop();
      });
    }
    cleanupRecording();
  }, [cleanupRecording, cleanupTimers]);

  const startRecordingCore = useCallback(async () => {
    if (!enabled || sending || recorderRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start(200);
      secondsRef.current = 0;
      setRecording(true);
      setRecordSeconds(0);
      cancelPendingRef.current = false;
      setCancelPending(false);
      tickRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordSeconds(secondsRef.current);
      }, 1000);
      stopTimerRef.current = setTimeout(() => {
        void finalizeSend();
      }, MAX_CONTEST_CHATTER_VOICE_SECONDS * 1000);
    } catch {
      cleanupRecording();
      toast.error("Microphone permission is required for voice messages.");
    }
  }, [cleanupRecording, enabled, finalizeSend, sending]);

  const discardRecordingRef = useRef(discardRecording);
  discardRecordingRef.current = discardRecording;
  useEffect(
    () => () => {
      void discardRecordingRef.current();
    },
    [],
  );

  const onMicPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (tapMode || !enabled || sending) return;
      e.preventDefault();
      activePointerIdRef.current = e.pointerId;
      pointerDownYRef.current = e.clientY;
      recordingStartedForGestureRef.current = false;
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        recordingStartedForGestureRef.current = true;
        void startRecordingCore();
      }, HOLD_DELAY_MS);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [enabled, sending, startRecordingCore, tapMode],
  );

  const onMicPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (tapMode || activePointerIdRef.current !== e.pointerId) return;
      const startY = pointerDownYRef.current;
      if (startY == null) return;
      if (startY - e.clientY >= CANCEL_SLIDE_PX) {
        cancelPendingRef.current = true;
        setCancelPending(true);
      } else {
        cancelPendingRef.current = false;
        setCancelPending(false);
      }
    },
    [tapMode],
  );

  const onMicPointerUpOrCancel = useCallback(
    async (e: React.PointerEvent) => {
      if (tapMode) return;
      if (activePointerIdRef.current !== e.pointerId) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      activePointerIdRef.current = null;
      pointerDownYRef.current = null;

      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
        return;
      }

      if (!recordingStartedForGestureRef.current) return;

      const shouldCancel = cancelPendingRef.current;
      cancelPendingRef.current = false;
      setCancelPending(false);
      recordingStartedForGestureRef.current = false;

      if (shouldCancel) {
        await discardRecording();
        toast.message("Voice message cancelled");
        return;
      }
      await finalizeSend();
    },
    [discardRecording, finalizeSend, tapMode],
  );

  const onMicContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const onMicClickTapMode = useCallback(() => {
    if (!tapMode || !enabled || sending) return;
    if (recording) {
      void finalizeSend();
    } else {
      void startRecordingCore();
    }
  }, [enabled, finalizeSend, recording, sending, startRecordingCore, tapMode]);

  return {
    sending,
    recording,
    recordSeconds,
    cancelPending,
    onMicPointerDown,
    onMicPointerMove,
    onMicPointerUp: onMicPointerUpOrCancel,
    onMicPointerCancel: onMicPointerUpOrCancel,
    onMicContextMenu,
    onMicClickTapMode,
    discardRecording,
  };
}
