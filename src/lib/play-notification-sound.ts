let sharedCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

/** Short UI chime for new in-app notifications (best-effort; may be blocked until user gesture). */
export function playNotificationSound(): void {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  const ctx = audioContext();
  if (!ctx) return;

  const run = () => {
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.06);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    } catch {
      /* autoplay / suspended context */
    }
  };

  void ctx.resume().then(run).catch(run);
}
