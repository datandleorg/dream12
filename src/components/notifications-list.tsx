"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hrefFromPayload, type NotificationRow } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export type { NotificationRow };

export function NotificationsList({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const unread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.rpc("mark_notification_read", { p_id: id });
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, read_at: r.read_at ?? new Date().toISOString() } : r,
      ),
    );
    router.refresh();
  }

  if (!rows.length) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">No notifications yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {unread > 0 ? (
        <p className="text-muted-foreground text-xs font-medium">
          {unread} unread
        </p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((n) => {
          const href = hrefFromPayload(n.payload);
          const inner = (
            <div
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                n.read_at ? "bg-background opacity-80" : "bg-muted/30 border-primary/20",
              )}
            >
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{n.body}</p>
              <p className="text-muted-foreground mt-1 text-[10px] tabular-nums">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          );

          return (
            <li key={n.id}>
              {href ? (
                <Link
                  href={href}
                  className="block"
                  onClick={() => void markRead(n.id)}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  className="w-full"
                  onClick={() => void markRead(n.id)}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
