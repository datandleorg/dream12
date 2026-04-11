"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminBroadcastNotificationToAllUsers } from "@/app/actions/admin-broadcast-notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminBroadcastNotificationsForm({ activeUserCount }: { activeUserCount: number }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      void (async () => {
        const r = await adminBroadcastNotificationToAllUsers({
          title,
          body,
          href: href.trim() || undefined,
        });
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        toast.success(`Notification queued for ${r.recipientCount} user(s). Email/push follow your existing webhook rules.`);
        setTitle("");
        setBody("");
        setHref("");
      })();
    });
  }

  return (
    <form onSubmit={onSubmit} className="bg-card max-w-xl space-y-4 rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-sm">
        Sends one in-app notification per <span className="text-foreground font-medium">active</span> user (
        {activeUserCount} total). The database webhook delivers email and web push where configured.
      </p>
      <div className="space-y-2">
        <Label htmlFor="broadcast-title">Title</Label>
        <Input
          id="broadcast-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Maintenance tonight 2am"
          maxLength={120}
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="broadcast-body">Message</Label>
        <textarea
          id="broadcast-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Full message shown in-app and in email…"
          rows={6}
          maxLength={4000}
          required
          disabled={pending}
          className="border-input bg-background focus-visible:ring-ring w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground text-xs">{body.length} / 4000</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="broadcast-href">Optional link path</Label>
        <Input
          id="broadcast-href"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="/notifications or /contests — no https://"
          disabled={pending}
        />
      </div>
      <Button type="submit" disabled={pending || activeUserCount === 0}>
        {pending ? "Sending…" : `Send to all ${activeUserCount} active user(s)`}
      </Button>
    </form>
  );
}
