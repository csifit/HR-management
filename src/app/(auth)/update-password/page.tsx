import { AuthForm } from "@/components/forms";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
export default async function UpdatePage() {
  await requireUser();
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <>
      <h1>{d.newPassword}</h1>
      <p className="auth-description">{d.passwordHint}</p>
      <AuthForm mode="update" locale={locale} />
    </>
  );
}
