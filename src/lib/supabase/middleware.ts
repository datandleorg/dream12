import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { copyHeadersWithRequestId } from "@/lib/request-context";

export async function updateSession(request: NextRequest) {
  const { headers: forwardHeaders } = copyHeadersWithRequestId(request.headers);
  const requestId = forwardHeaders.get("x-request-id")!;

  let supabaseResponse = NextResponse.next({
    request: { headers: forwardHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: { headers: forwardHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (prof?.is_active === false) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("reason", "inactive");
      let redirectResponse = NextResponse.redirect(redirectUrl);
      redirectResponse.headers.set("x-request-id", requestId);
      const supabaseSignOut = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              redirectResponse = NextResponse.redirect(redirectUrl);
              redirectResponse.headers.set("x-request-id", requestId);
              cookiesToSet.forEach(({ name, value, options }) =>
                redirectResponse.cookies.set(name, value, options),
              );
            },
          },
        },
      );
      await supabaseSignOut.auth.signOut();
      return redirectResponse;
    }
  }

  const requestHeaders = new Headers(forwardHeaders);
  requestHeaders.set("x-return-to", request.nextUrl.pathname + request.nextUrl.search);
  const withReturnTo = NextResponse.next({
    request: { headers: requestHeaders },
  });
  withReturnTo.headers.set("x-request-id", requestId);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    withReturnTo.cookies.set(cookie.name, cookie.value, cookie);
  });
  return withReturnTo;
}
