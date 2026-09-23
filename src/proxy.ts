import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, supabaseConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  // Public editorial page: no session refresh, cookies, or HR queries for crawlers.
  if (
    ["/hr-management-romania", "/sitemap.xml", "/robots.txt"].includes(
      request.nextUrl.pathname,
    )
  )
    return NextResponse.next({ request });
  // Keep local auth cookies on the same host as email confirmation redirects.
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (
    process.env.NODE_ENV === "development" &&
    origin &&
    request.nextUrl.hostname === "127.0.0.1" &&
    new URL(origin).hostname === "localhost"
  ) {
    return NextResponse.redirect(
      new URL(request.nextUrl.pathname + request.nextUrl.search, origin),
    );
  }
  if (!isConfigured()) return NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
