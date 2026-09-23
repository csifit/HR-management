import Link from "next/link";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { requirePlatformAdmin, getMemberships } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { platformDictionary } from "@/lib/platform-i18n";
import { Brand } from "@/components/ui";
import { LanguageSwitch } from "@/components/shell";
import { signOut } from "@/app/actions";
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();
  const [locale, memberships] = await Promise.all([
    getLocale(),
    getMemberships(),
  ]);
  const d = platformDictionary(locale);
  return (
    <div className="platform-shell">
      <a className="skip-link" href="#main-content">
        {d.title}
      </a>
      <header className="platform-header">
        <Brand href="/platform" />
        <span className="platform-label">
          <ShieldCheck size={18} />
          {d.title}
        </span>
        <div className="platform-header-actions">
          {memberships.length > 0 && (
            <Link className="button secondary" href="/dashboard">
              {d.workspace}
              <ArrowUpRight size={16} />
            </Link>
          )}
          <LanguageSwitch locale={locale} />
          <Link className="button secondary" href="/account/security">
            {locale === "ro" ? "Securitate" : "Security"}
          </Link>
          <form action={signOut}>
            <button className="text-button">{d.signOut}</button>
          </form>
        </div>
      </header>
      <main id="main-content" className="platform-main">
        {children}
      </main>
    </div>
  );
}
