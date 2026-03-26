"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin indeterminate bar during in-app navigations (internal link clicks).
 * Route segments still use loading.tsx skeletons when RSC streams.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [active, setActive] = useState(false);
  const prevKey = useRef<string | null>(null);

  useEffect(() => {
    if (prevKey.current === null) {
      prevKey.current = routeKey;
      return;
    }
    if (prevKey.current !== routeKey) {
      prevKey.current = routeKey;
      const id = requestAnimationFrame(() => setActive(false));
      return () => cancelAnimationFrame(id);
    }
  }, [routeKey]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      const a = t?.closest?.("a") as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target === "_blank" || a.download) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        const next = url.pathname + url.search;
        const current = window.location.pathname + window.location.search;
        if (next === current) return;
      } catch {
        return;
      }
      setActive(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed top-0 right-0 left-0 z-[150] h-1 overflow-hidden bg-primary/15"
      aria-hidden
    >
      <div className="nav-progress-indeterminate h-full w-full bg-primary/90" />
    </div>
  );
}
