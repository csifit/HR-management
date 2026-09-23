import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { securityDictionary } from "@/lib/security-i18n";
import { SecurityForm } from "@/components/security-form";
import { Brand } from "@/components/ui";
import { LanguageSwitch } from "@/components/shell";
import { signOut } from "@/app/actions";
export default async function SecurityPage() {
  const { supabase, user } = await requireSession(),
    locale = await getLocale(),
    d = securityDictionary(locale);
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw new Error("Account security could not be loaded.");
  const factors = (user.factors ?? [])
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({
      id: f.id,
      name: f.friendly_name ?? d.factor,
      verified: f.status === "verified",
    }));
  const needsVerification =
    (user.factors ?? []).some((f) => f.status === "verified") &&
    data.currentLevel !== "aal2";
  return (
    <main className="security-page">
      <header className="security-header">
        <Brand />
        <LanguageSwitch locale={locale} />
      </header>
      <section className="card time-form-card">
        <h1>{needsVerification ? d.verifyTitle : d.title}</h1>
        <p className="time-help">
          {needsVerification ? d.verifyHelp : d.intro}
        </p>
        <SecurityForm
          locale={locale}
          factors={factors}
          needsVerification={needsVerification}
        />
        {!needsVerification && (
          <Link className="button secondary" href="/dashboard">
            {d.continue}
          </Link>
        )}
        <p className="time-help">{d.recovery}</p>
        <form action={signOut}>
          <button className="text-button">{d.signOut}</button>
        </form>
      </section>
    </main>
  );
}
