import Link from "next/link";
import { Building2 } from "lucide-react";
import { requireUser, getMemberships } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { Brand } from "@/components/ui";
import { LanguageSwitch } from "@/components/shell";
import { OrganisationForm } from "@/components/forms";
import { signOut } from "@/app/actions";
export default async function OnboardingPage() {
  const { supabase } = await requireUser();
  const admin = await supabase.rpc("is_platform_admin");
  if (admin.error) throw new Error("Platform access could not be checked.");
  const memberships = await getMemberships();
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <div className="standalone-page">
      <header>
        <Brand />
        <LanguageSwitch locale={locale} />
      </header>
      <main className="setup-card card">
        <div className="empty-icon">
          <Building2 size={25} />
        </div>
        <h1>{d.orgTitle}</h1>
        <p>{d.orgIntro}</p>
        <OrganisationForm locale={locale} />
        <div className="onboarding-footer">
          {memberships.length > 0 && <Link href="/dashboard">{d.back}</Link>}
          {admin.data && <Link href="/platform">{d.platform}</Link>}
          <form action={signOut}>
            <button className="text-button">{d.signOut}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
