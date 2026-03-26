import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Vercel preview/production: `www.*.vercel.app` is not a real hostname with TLS.
 * Razorpay and other crawlers sometimes probe `http(s)://www.<deployment>` — redirect
 * to canonical `https://<host-without-www>` so verification and auth cookies stay aligned.
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host") ?? "";
  if (!host.startsWith("www.")) return null;

  const withoutWww = host.slice(4);
  const dest = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    `https://${withoutWww}`,
  );
  return NextResponse.redirect(dest, 308);
}

export async function middleware(request: NextRequest) {
  const canonical = canonicalHostRedirect(request);
  if (canonical) return canonical;

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
