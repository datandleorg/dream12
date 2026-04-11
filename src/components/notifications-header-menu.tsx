"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
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
  const routerRef = useRef(router);
  routerRef.current = router;
  const [rows, setRows] = useState(initialPreview);
  const [liveUnread, setLiveUnread] = useState(unreadCount);
  const [bellPop, setBellPop] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
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

      const link = hrefFromPayload(row.payload);
      const destination = link ?? "/notifications";
      toast.custom(
        (id) => (
          <div className="group relative flex w-full gap-3">
            <div
              role="button"
              tabIndex={0}
              className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={
                link
                  ? `Open notification: ${row.title}`
                  : "View all notifications"
              }
              onClick={() => {
                routerRef.current.push(destination);
                toast.dismiss(id);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                routerRef.current.push(destination);
                toast.dismiss(id);
              }}
            >
              <BellIcon className="text-primary size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="text-foreground text-sm font-semibold">
                  {row.title}
                </span>
                {row.body ? (
                  <span className="text-muted-foreground mt-1 block text-sm font-normal">
                    {row.body}
                  </span>
                ) : null}
              </span>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="text-muted-foreground hover:bg-muted hover:text-foreground absolute right-0 top-0 rounded-md p-1 opacity-70 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                toast.dismiss(id);
              }}
            >
              <XIcon className="size-4 shrink-0" aria-hidden />
            </button>
          </div>
        ),
        {
          duration: 7200,
          // Sonner skips default surface styles when toast.custom sets data-styled=false;
          // mirror [data-styled=true] so we keep popover background + padding like toast.message.
          className: cn(
            "flex w-full items-start gap-2 border p-4 text-[13px] shadow-md",
            "bg-popover text-popover-foreground border-border rounded-[var(--border-radius)]",
            "!border-primary/45 !shadow-lg !shadow-primary/15",
          ),
        },
      );

      setBellPop(true);
      window.setTimeout(() => {
        if (!cancelled) setBellPop(false);
      }, 760);
      setHighlightId(row.id);
      window.setTimeout(() => {
        if (!cancelled) {
          setHighlightId((cur) => (cur === row.id ? null : cur));
        }
      }, 2600);

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
        className={cn(
          "text-foreground hover:bg-muted/80 relative inline-flex size-9 items-center justify-center rounded-md transition-colors",
          bellPop && "notify-bell-pop",
        )}
        aria-label="Notifications"
        aria-haspopup="dialog"
      >
        <BellIcon className="size-5" aria-hidden />
        {badgeCount > 0 ? (
          <span
            className={cn(
              "bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 flex min-w-4 justify-center rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums",
              bellPop && "notify-badge-bump",
            )}
          >
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
                const isNewHighlight = n.id === highlightId;
                const inner = (
                  <div
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-left transition-colors",
                      n.read_at ? "bg-background opacity-80" : "bg-muted/30 border-primary/20",
                      isNewHighlight && "notify-row-arrive border-primary/50 notify-row-glow",
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
