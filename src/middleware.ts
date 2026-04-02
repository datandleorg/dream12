import { type NextRequest, NextResponse } from "next/server";
import { copyHeadersWithRequestId } from "@/lib/request-context";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    const { requestId, headers } = copyHeadersWithRequestId(request.headers);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|serwist|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
