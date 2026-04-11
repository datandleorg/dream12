/** Browser-only helpers for Web Push (VAPID). */

export function pushNotificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getVapidPublicKey(): string | null {
  const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return k || null;
}

/**
 * Registers this browser for push and stores the subscription server-side (cookie auth).
 */
export async function subscribeToWebPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushNotificationsSupported()) {
    return { ok: false, error: "Web Push is not supported in this browser." };
  }

  const vapid = getVapidPublicKey();
  if (!vapid) {
    return { ok: false, error: "App is missing NEXT_PUBLIC_VAPID_PUBLIC_KEY." };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, error: perm === "denied" ? "Notifications blocked in browser settings." : "Permission not granted." };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }

  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: errBody?.error ?? `Subscribe failed (${res.status})` };
  }

  return { ok: true };
}

/**
 * Removes push subscription from the server and from the browser.
 */
export async function unsubscribeFromWebPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushNotificationsSupported()) {
    return { ok: false, error: "Web Push is not supported in this browser." };
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    return { ok: true };
  }

  const endpoint = sub.endpoint;
  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
    credentials: "same-origin",
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: errBody?.error ?? `Unsubscribe failed (${res.status})` };
  }

  await sub.unsubscribe();
  return { ok: true };
}

export async function hasBrowserPushSubscription(): Promise<boolean> {
  if (!pushNotificationsSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return Boolean(sub);
}
