import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Server-only username check using the service role (bypasses RLS).
 * Avoids PostgREST RPC/view 404s when migrations are missing or schema cache is stale.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim().toLowerCase();

  if (!username || username.length < 3) {
    return NextResponse.json(
      { error: "Invalid username", available: false },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          available: false,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ available: !data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Server missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local for username checks.",
          available: false,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: message, available: false },
      { status: 500 },
    );
  }
}
