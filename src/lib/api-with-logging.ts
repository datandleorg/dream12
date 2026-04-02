import type { NextRequest } from "next/server";
import { clientIpFromRequestHeaders } from "@/lib/request-context";
import { logHttp } from "@/lib/server-log";

type ApiHandler<T extends Request> = (
  request: T,
  ctx: { requestId: string | null; ip: string | null },
) => Promise<Response>;

/**
 * Wrap a route handler to emit one structured `kind: http` line per request.
 * Preserves thrown errors after logging.
 */
export function withApiLogging<T extends Request = Request>(handler: ApiHandler<T>): (request: T) => Promise<Response> {
  return async (request: T) => {
    const requestId = request.headers.get("x-request-id");
    const ip = clientIpFromRequestHeaders(request.headers);
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    const t0 = Date.now();
    try {
      const res = await handler(request, { requestId, ip });
      const durationMs = Date.now() - t0;
      logHttp({
        method: request.method,
        path,
        status: res.status,
        durationMs,
        requestId,
        ip,
        userAgent: request.headers.get("user-agent"),
      });
      return res;
    } catch (e) {
      const durationMs = Date.now() - t0;
      const msg = e instanceof Error ? e.message : String(e);
      logHttp({
        method: request.method,
        path,
        status: 500,
        durationMs,
        requestId,
        ip,
        userAgent: request.headers.get("user-agent"),
        error: msg,
      });
      throw e;
    }
  };
}

/** NextRequest variant for routes that need `nextUrl` etc. */
export function withNextApiLogging(
  handler: ApiHandler<NextRequest>,
): (request: NextRequest) => Promise<Response> {
  return withApiLogging(handler);
}
