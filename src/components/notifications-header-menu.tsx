"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hrefFromPayload, notificationRowFromDb, type NotificationRow } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/play-notification-sound";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationsHeaderMenu({
  userId,
  initialPreview,
  unreadCount,
}: {
  userId: string;
  initialPreview: NotificationRow[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialPreview);
  const [liveUnread, setLiveUnread] = useState(unreadCount);
  /** Dedupes realtime + Strict Mode so we don't double-play sound or bump the badge. */
  const knownIdsRef = useRef<Set<string>>(new Set(initialPreview.map((r) => r.id)));

  useEffect(() => {
    setRows(initialPreview);
  }, [initialPreview]);

  useEffect(() => {
    knownIdsRef.current = new Set(initialPreview.map((r) => r.id));
  }, [initialPreview]);

  useEffect(() => {
    setLiveUnread(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const removeChannel = () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };

    const onInsert = (payload: {
      new: Record<string, unknown>;
    }) => {
      const row = notificationRowFromDb(
        payload.new as {
          id: unknown;
          type: unknown;
          title: unknown;
          body: unknown;
          payload: unknown;
          read_at: unknown;
          created_at: unknown;
        },
      );
      if (knownIdsRef.current.has(row.id)) return;
      knownIdsRef.current.add(row.id);

      setRows((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        return [row, ...prev].slice(0, 8);
      });
      if (!row.read_at) {
        setLiveUnread((c) => c + 1);
      }
      playNotificationSound();
    };

    /** RLS on `notifications` requires a user JWT on the Realtime join; subscribing before the session is ready uses the anon key and receives no rows. */
    const subscribeWithToken = async (accessToken: string) => {
      if (cancelled) return;
      await supabase.realtime.setAuth(accessToken);
      if (cancelled) return;

      removeChannel();
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          onInsert,
        )
        .subscribe();
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        void subscribeWithToken(data.session.access_token);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        removeChannel();
        return;
      }
      if (session?.access_token && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
        // Avoid awaiting auth APIs inside this callback (Supabase lock); token is already on the event.
        queueMicrotask(() => {
          void subscribeWithToken(session.access_token);
        });
      }
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      removeChannel();
    };
  }, [userId]);

  const unreadInPreview = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);
  const badgeCount = liveUnread;

  async function markRead(id: string) {
    const supabase = createClient();
    const wasUnread = rows.find((r) => r.id === id)?.read_at == null;
    await supabase.rpc("mark_notification_read", { p_id: id });
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, read_at: r.read_at ?? new Date().toISOString() } : r,
      ),
    );
    if (wasUnread) {
      setLiveUnread((c) => Math.max(0, c - 1));
    }
    router.refresh();
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="text-foreground hover:bg-muted/80 relative inline-flex size-9 items-center justify-center rounded-md transition-colors"
        aria-label="Notifications"
        aria-haspopup="dialog"
      >
        <BellIcon className="size-5" aria-hidden />
        {badgeCount > 0 ? (
          <span className="bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 flex min-w-4 justify-center rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-baseline justify-between gap-2 px-0.5">
            <PopoverTitle className="text-base">Notifications</PopoverTitle>
            {unreadInPreview > 0 ? (
              <span className="text-muted-foreground shrink-0 text-[10px] font-medium tabular-nums">
                {unreadInPreview} unread
              </span>
            ) : null}
          </div>

          {!rows.length ? (
            <p className="text-muted-foreground min-h-[4rem] flex-1 px-0.5 py-4 text-center text-xs">
              No notifications yet.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {rows.map((n) => {
                const href = hrefFromPayload(n.payload);
                const inner = (
                  <div
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-left transition-colors",
                      n.read_at ? "bg-background opacity-80" : "bg-muted/30 border-primary/20",
                    )}
                  >
                    <p className="text-xs font-semibold leading-snug">{n.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{n.body}</p>
                    <p className="text-muted-foreground mt-1 text-[10px] tabular-nums">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                );

                return (
                  <li key={n.id}>
                    {href ? (
                      <Link href={href} className="block" onClick={() => void markRead(n.id)}>
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" className="w-full" onClick={() => void markRead(n.id)}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-border mt-1 shrink-0 border-t pt-2">
            <PopoverClose
              nativeButton={false}
              render={
                <Link
                  href="/notifications"
                  className="text-primary block w-full rounded-md py-2 text-center text-xs font-semibold hover:underline"
                />
              }
            >
              View all
            </PopoverClose>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
