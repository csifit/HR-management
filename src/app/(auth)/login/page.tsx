import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { isConfigured } from "@/lib/supabase/config";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isConfigured()) redirect("/setup");
  const locale = await getLocale();
  const d = dictionary(locale);
  const { error } = await searchParams;
  return (
    <>
      <span className="eyebrow">{d.secureWorkspace}</span>
      <h1>{d.loginTitle}</h1>
      <p className="auth-description">{d.loginIntro}</p>
      {error && (
        <p className="notice error" role="alert">
          {d.authError}
        </p>
      )}
      <AuthForm mode="login" locale={locale} />
      <p className="auth-switch">
        {d.noAccount} <Link href="/register">{d.register}</Link>
      </p>
    </>
  );
}
