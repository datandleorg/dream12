import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function maintenanceModeEnabled(): boolean {
  const v = process.env.MAINTENANCE_MODE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function hasMaintenanceBypass(request: NextRequest): boolean {
  const secret = process.env.MAINTENANCE_BYPASS_SECRET;
  if (!secret) return false;
  return request.cookies.get("maintenance_bypass")?.value === secret;
}

export async function middleware(request: NextRequest) {
  if (maintenanceModeEnabled()) {
    const path = request.nextUrl.pathname;
    if (path !== "/maintenance" && !hasMaintenanceBypass(request)) {
      return NextResponse.redirect(new URL("/maintenance", request.url));
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|serwist|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
