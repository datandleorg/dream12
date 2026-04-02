/** Client-only helpers for Web Push (call from browser after Serwist registration). */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof navigator.serviceWorker?.ready !== "undefined"
  );
}

export function getPublicVapidKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return k || undefined;
}

export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    outputArray[i] = raw.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribePushAndSync(): Promise<void> {
  const vapid = getPublicVapidKey();
  if (!vapid) {
    throw new Error("Push is not configured (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY)");
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });

  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Subscribe failed (${res.status})`);
  }
}

export async function unsubscribePushAndSync(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const json = sub.toJSON();
  const endpoint = typeof json.endpoint === "string" ? json.endpoint : "";
  await sub.unsubscribe().catch(() => {});

  if (endpoint) {
    await fetch(`/api/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}
