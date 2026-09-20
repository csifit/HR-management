import Link from "next/link";
import { AuthForm } from "@/components/forms";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
export default async function ForgotPage() {
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <>
      <h1>{d.forgotTitle}</h1>
      <p className="auth-description">{d.forgotIntro}</p>
      <AuthForm mode="forgot" locale={locale} />
      <p className="auth-switch">
        <Link href="/login">{d.back}</Link>
      </p>
    </>
  );
}
