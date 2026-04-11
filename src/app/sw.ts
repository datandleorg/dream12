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

const NOTIFICATION_ICON = "/icons/icon-192.png";

type PushMessagePayload = {
  title?: string;
  body?: string;
  href?: string;
  tag?: string;
};

self.addEventListener("push", (event: PushEvent) => {
  let data: PushMessagePayload = {};
  try {
    data = event.data?.json() as PushMessagePayload;
  } catch {
    /* ignore */
  }
  const title = typeof data.title === "string" && data.title.trim() ? data.title : "Dream12";
  const body = typeof data.body === "string" ? data.body : "";
  const href = typeof data.href === "string" && data.href.startsWith("/") ? data.href : "/notifications";
  const tag = typeof data.tag === "string" ? data.tag : "dream12";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag,
      data: { href },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const hrefRaw = event.notification.data?.href;
  const href =
    typeof hrefRaw === "string" && hrefRaw.startsWith("/") ? hrefRaw : "/notifications";
  const url = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          const wc = c as WindowClient;
          void wc.focus();
          if (typeof wc.navigate === "function") {
            return wc.navigate(url);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
