"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "dream12-pwa-install-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type Variant = "hidden" | "chromium" | "ios" | "android-menu";

/** Chromium-only; not in all TS lib versions. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function wasDismissedRecently(): boolean {
  try {
    const t = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
    if (!t) return false;
    return Date.now() - t < DISMISS_MS;
  } catch {
    return false;
  }
}

export type PwaInstallPromptProps = {
  /** e.g. sit above bottom nav: `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]` */
  bottomClassName?: string;
};

/**
 * Desktop Chrome shows an install icon in the address bar; mobile often does not.
 * - Chromium: capture `beforeinstallprompt` and offer Install.
 * - iOS (all browsers): no programmatic install — show Share → Add to Home Screen.
 * - Android without an event yet: suggest ⋮ menu → Install app.
 */
export function PwaInstallPrompt({ bottomClassName = "bottom-6" }: PwaInstallPromptProps) {
  const [variant, setVariant] = useState<Variant>("hidden");
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const fallbackTimerRef = useRef<number>(0);

  const dismiss = useCallback(() => {
    setVariant("hidden");
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (wasDismissedRecently()) return;

    const showChromium = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      deferredRef.current = ev;
      window.clearTimeout(fallbackTimerRef.current);
      setVariant("chromium");
    };

    window.addEventListener("beforeinstallprompt", showChromium);

    fallbackTimerRef.current = window.setTimeout(() => {
      if (deferredRef.current) return;
      if (isIos()) {
        setVariant("ios");
        return;
      }
      if (isAndroid()) {
        setVariant("android-menu");
      }
    }, 3500);

    return () => {
      window.removeEventListener("beforeinstallprompt", showChromium);
      window.clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  const onInstallClick = useCallback(async () => {
    const ev = deferredRef.current;
    if (!ev) return;
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      /* user dismissed or unsupported */
    }
    deferredRef.current = null;
    setVariant("hidden");
  }, []);

  if (variant === "hidden") return null;

  return (
    <div
      role="region"
      aria-label="Install app"
      className={cn(
        "border-border/80 bg-card/95 text-card-foreground fixed left-3 right-3 z-[45] rounded-xl border p-3 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-card/90",
        bottomClassName,
      )}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 text-sm">
          {variant === "chromium" ? (
            <>
              <p className="font-medium">Install Dream12</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Add to your home screen for quick access and notifications.
              </p>
            </>
          ) : null}
          {variant === "ios" ? (
            <>
              <p className="font-medium">Add Dream12 to Home Screen</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Tap <span className="text-foreground font-medium">Share</span>
                {" "}→{" "}
                <span className="text-foreground font-medium">Add to Home Screen</span>
                . iPhone and iPad do not show a store-style install popup for web apps.
              </p>
            </>
          ) : null}
          {variant === "android-menu" ? (
            <>
              <p className="font-medium">Install Dream12</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Tap the browser <span className="text-foreground font-medium">⋮</span> menu →{" "}
                <span className="text-foreground font-medium">Install app</span> or{" "}
                <span className="text-foreground font-medium">Add to Home screen</span>.
              </p>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground size-8"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </Button>
          {variant === "chromium" ? (
            <Button type="button" size="sm" className="tap-app" onClick={onInstallClick}>
              Install
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
