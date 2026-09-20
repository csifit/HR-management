import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { isConfigured } from "@/lib/supabase/config";
export default async function RegisterPage() {
  if (!isConfigured()) redirect("/setup");
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <>
      <h1>{d.registerTitle}</h1>
      <p className="auth-description">{d.registerIntro}</p>
      <AuthForm mode="register" locale={locale} />
      <p className="auth-switch">
        {d.haveAccount} <Link href="/login">{d.login}</Link>
      </p>
    </>
  );
}
