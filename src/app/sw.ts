/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event: PushEvent) => {
  let parsed: Record<string, unknown> = {};
  try {
    const j = event.data?.json() as unknown;
    if (j && typeof j === "object" && !Array.isArray(j)) parsed = j as Record<string, unknown>;
  } catch {
    parsed = { body: event.data?.text() ?? "" };
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Dream12";
  const body = typeof parsed.body === "string" ? parsed.body : "";
  const urlRaw = typeof parsed.url === "string" ? parsed.url.trim() : "";
  const url = urlRaw.startsWith("/") ? urlRaw : "/notifications";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: {
        url,
        notificationId: parsed.notificationId,
        type: parsed.type,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const d = event.notification.data as { url?: unknown } | undefined;
  const urlRaw = d && typeof d.url === "string" ? d.url.trim() : "";
  const path = urlRaw.startsWith("/") ? urlRaw : "/notifications";
  const absolute = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of clientsList) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          await c.focus();
          return;
        }
      }
      await self.clients.openWindow(absolute);
    })(),
  );
});
