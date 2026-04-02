"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD_PX = 56;

export function PullToRefresh({
  children,
  scrollContainerClassName,
  onAfterRefresh,
}: {
  children: React.ReactNode;
  scrollContainerClassName?: string;
  onAfterRefresh?: () => void;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      router.refresh();
      await new Promise((r) => setTimeout(r, 750));
      onAfterRefresh?.();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }, [router, onAfterRefresh]);

  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (startY.current == null || !el || el.scrollTop > 0) return;
    const y = e.touches[0]?.clientY ?? 0;
    const dy = y - startY.current;
    if (dy > 0) {
      setPull(Math.min(dy * 0.45, 72));
    }
  };

  const onTouchEnd = () => {
    startY.current = null;
    if (pull >= PULL_THRESHOLD_PX * 0.45) {
      void doRefresh();
    } else {
      setPull(0);
    }
  };

  const indicator = Math.max(0, pull);
  const releaseThreshold = PULL_THRESHOLD_PX * 0.45;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{ height: indicator + 8, opacity: indicator > 4 ? 1 : 0 }}
        aria-hidden
      >
        <div className="text-muted-foreground flex items-end pb-1">
          {refreshing ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <span className="text-xs font-medium">
              {indicator >= releaseThreshold ? "Release to refresh" : "↓ Pull to refresh"}
            </span>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "relative overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]",
          scrollContainerClassName,
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: indicator > 0 ? `translateY(${Math.min(indicator, 48)}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
