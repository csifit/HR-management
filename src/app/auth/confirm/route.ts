import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next =
    url.searchParams.get("next") === "/update-password" || type === "recovery"
      ? "/update-password"
      : "/dashboard";
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (
    hash &&
    type &&
    ["signup", "recovery", "email", "invite", "email_change"].includes(type)
  ) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: hash,
      type: type as EmailOtpType,
    });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(
    new URL("/login?error=confirmation", request.url),
  );
}
