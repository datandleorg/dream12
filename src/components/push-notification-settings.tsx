"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getPublicVapidKey,
  isPushSupported,
  subscribePushAndSync,
  unsubscribePushAndSync,
} from "@/lib/push/client-subscribe";
import { cn } from "@/lib/utils";

type PermissionState = NotificationPermission | "unsupported" | "no-vapid";

export function PushNotificationSettings({ className }: { className?: string }) {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      setSubscribed(false);
      return;
    }
    if (!getPublicVapidKey()) {
      setPermission("no-vapid");
      setSubscribed(false);
      return;
    }
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onEnable() {
    setError(null);
    setBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== "granted") return;
      await subscribePushAndSync();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setError(null);
    setBusy(true);
    try {
      await unsubscribePushAndSync();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable notifications");
    } finally {
      setBusy(false);
    }
  }

  if (permission === "unsupported") {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/30 p-3 text-sm", className)}>
        <p className="font-medium">Browser notifications</p>
        <p className="text-muted-foreground mt-1">
          This browser does not support Web Push. On iOS, install the app to the home screen and use
          a recent iOS version that supports push for installed web apps.
        </p>
      </div>
    );
  }

  if (permission === "no-vapid") {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/30 p-3 text-sm", className)}>
        <p className="font-medium">Browser notifications</p>
        <p className="text-muted-foreground mt-1">Push is not configured on this deployment.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30 p-3 text-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Browser notifications</p>
          <p className="text-muted-foreground mt-0.5">
            {permission === "denied"
              ? "Notifications are blocked for this site. Enable them in browser settings to use this feature."
              : subscribed
                ? "You will get system alerts for new Dream12 notifications when the app is in the background."
                : "Get alerted when you receive wallet and contest updates."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {permission === "granted" && subscribed ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDisable}>
              {busy ? "…" : "Disable"}
            </Button>
          ) : permission !== "denied" ? (
            <Button type="button" size="sm" disabled={busy} onClick={onEnable}>
              {busy ? "…" : "Turn on"}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-destructive mt-2 text-xs">{error}</p> : null}
    </div>
  );
}
