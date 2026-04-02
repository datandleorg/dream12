/** Best-effort client IP behind proxies (trust X-Forwarded-For first hop only). */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return null;
}

/** Same as {@link clientIpFromHeaders} for plain `Headers` (Request, middleware). */
export function clientIpFromRequestHeaders(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return null;
}

export function getOrCreateRequestId(headers: { get(name: string): string | null }): string {
  const existing = headers.get("x-request-id")?.trim();
  if (existing) return existing;
  return crypto.randomUUID();
}

export function copyHeadersWithRequestId(source: Headers): { requestId: string; headers: Headers } {
  const h = new Headers();
  source.forEach((value, key) => {
    h.append(key, value);
  });
  const requestId = getOrCreateRequestId(h);
  h.set("x-request-id", requestId);
  return { requestId, headers: h };
}
