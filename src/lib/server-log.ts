import pino from "pino";
import { getServerLogDir, getServerLogFilePath } from "@/lib/server-log-paths";

const SENSITIVE_KEYS = new Set([
  "password",
  "authorization",
  "cookie",
  "set-cookie",
  "access_token",
  "refresh_token",
  "secret",
  "apikey",
  "api_key",
  "razorpay_payment_id",
  "razorpay_order_id",
]);

/** Shallow redact for nested metadata (no full deep clone of huge trees). */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 2000) return `${value.slice(0, 2000)}…`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redactForLog(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const low = k.toLowerCase();
    if (SENSITIVE_KEYS.has(low) || low.includes("password") || low.includes("secret")) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = redactForLog(v, depth + 1);
  }
  return out;
}

function buildLogger(): pino.Logger {
  getServerLogDir();
  const destPath = getServerLogFilePath();
  const level = process.env.SERVER_LOG_LEVEL?.trim() || "info";
  try {
    return pino(
      { level },
      pino.multistream([
        { level, stream: process.stdout },
        { level, stream: pino.destination({ dest: destPath, sync: false }) },
      ]),
    );
  } catch {
    return pino({ level });
  }
}

let _logger: pino.Logger | null = null;

export function serverLogger(): pino.Logger {
  if (!_logger) _logger = buildLogger();
  return _logger;
}

export type HttpLogFields = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string | null;
  ip: string | null;
  userId?: string | null;
  userAgent?: string | null;
  error?: string;
};

export function logHttp(fields: HttpLogFields): void {
  const ua =
    fields.userAgent && fields.userAgent.length > 200
      ? `${fields.userAgent.slice(0, 200)}…`
      : fields.userAgent;
  serverLogger().info({
    kind: "http",
    ...fields,
    userAgent: ua ?? null,
  });
}

export function logActivity(input: {
  action: string;
  userId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  ok?: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}): void {
  serverLogger().info({
    kind: "activity",
    action: input.action,
    userId: input.userId ?? null,
    requestId: input.requestId ?? null,
    ip: input.ip ?? null,
    ok: input.ok ?? true,
    message: input.message,
    metadata: input.metadata ? (redactForLog(input.metadata) as Record<string, unknown>) : undefined,
  });
}

export function logCron(input: {
  route: string;
  ok: boolean;
  durationMs: number;
  summary?: Record<string, unknown>;
  error?: string;
}): void {
  serverLogger().info({
    kind: "cron",
    route: input.route,
    ok: input.ok,
    durationMs: input.durationMs,
    summary: input.summary ? (redactForLog(input.summary) as Record<string, unknown>) : undefined,
    error: input.error,
  });
}
