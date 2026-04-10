export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export function hrefFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload || typeof payload.href !== "string") return null;
  const h = payload.href.trim();
  return h.startsWith("/") ? h : null;
}

type NotificationDbRow = {
  id: unknown;
  type: unknown;
  title: unknown;
  body: unknown;
  payload: unknown;
  read_at: unknown;
  created_at: unknown;
};

export function notificationRowFromDb(r: NotificationDbRow): NotificationRow {
  return {
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    body: r.body as string,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    read_at: (r.read_at as string | null) ?? null,
    created_at: r.created_at as string,
  };
}
