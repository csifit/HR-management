import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/forms";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { isConfigured } from "@/lib/supabase/config";
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isConfigured()) redirect("/setup");
  const locale = await getLocale();
  const d = dictionary(locale);
  const join = (await searchParams).next === "/join";
  return (
    <>
      <h1>{d.registerTitle}</h1>
      <p className="auth-description">
        {join
          ? locale === "ro"
            ? "Creează contul cu adresa de email invitată, apoi acceptă accesul de angajat."
            : "Create your account with the invited email, then accept employee access."
          : d.registerIntro}
      </p>
      <AuthForm mode="register" locale={locale} join={join} />
      <p className="auth-switch">
        {d.haveAccount}{" "}
        <Link href={join ? "/login?next=/join" : "/login"}>{d.login}</Link>
      </p>
    </>
  );
}
