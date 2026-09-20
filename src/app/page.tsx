import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/supabase/config";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  // Supabase may fall back to the configured site root before redirect URLs are set.
  if (code) redirect(`/auth/confirm?code=${encodeURIComponent(code)}`);
  redirect(isConfigured() ? "/dashboard" : "/setup");
}
