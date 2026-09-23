import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { isConfigured } from "@/lib/supabase/config";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!isConfigured()) redirect("/setup");
  const locale = await getLocale();
  const d = dictionary(locale);
  const { error, next } = await searchParams;
  const join = next === "/join";
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
      <AuthForm mode="login" locale={locale} join={join} />
      <p className="auth-switch">
        {d.noAccount}{" "}
        <Link href={join ? "/register?next=/join" : "/register"}>
          {d.register}
        </Link>
      </p>
    </>
  );
}
