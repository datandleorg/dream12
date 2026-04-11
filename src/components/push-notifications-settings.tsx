"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  hasBrowserPushSubscription,
  pushNotificationsSupported,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from "@/lib/push/subscribe-client";

export function PushNotificationsSettings() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pushNotificationsSupported()) {
      setSupported(false);
      setSubscribed(false);
      setLoading(false);
      return;
    }
    setSupported(true);
    setLoading(true);
    try {
      const on = await hasBrowserPushSubscription();
      setSubscribed(on);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!supported) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-lg border p-4 text-sm">
        Browser push is not available here (unsupported browser or insecure context). Use the
        installed app on iOS for push.
      </div>
    );
  }

  const permission = typeof Notification !== "undefined" ? Notification.permission : "denied";

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium">Browser notifications</h2>
          <p className="text-muted-foreground text-xs">
            Get notified when you are not on the app. Respects the same categories as email (
            <code className="text-xs">EMAIL_NOTIFICATION_TYPES</code>).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {loading ? (
            <span className="text-muted-foreground text-xs">Checking…</span>
          ) : subscribed ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onDisable()}>
              {busy ? "Disabling…" : "Disable"}
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy || permission === "denied"} onClick={() => void onEnable()}>
              {busy ? "Enabling…" : "Enable"}
            </Button>
          )}
        </div>
      </div>
      {permission === "denied" && (
        <p className="text-destructive mt-2 text-xs">
          Notifications are blocked. Enable them in your browser or OS settings for this site, then try again.
        </p>
      )}
      {message && <p className="text-muted-foreground mt-2 text-xs">{message}</p>}
    </div>
  );

  async function onEnable() {
    setBusy(true);
    setMessage(null);
    const r = await subscribeToWebPush();
    setBusy(false);
    if (r.ok) {
      setSubscribed(true);
      setMessage(null);
    } else {
      setMessage(r.error);
    }
  }

  async function onDisable() {
    setBusy(true);
    setMessage(null);
    const r = await unsubscribeFromWebPush();
    setBusy(false);
    if (r.ok) {
      setSubscribed(false);
      setMessage(null);
    } else {
      setMessage(r.error);
    }
    await refresh();
  }
}
