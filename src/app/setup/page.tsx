import Link from "next/link";
import { redirect } from "next/navigation";
import { Database, ArrowRight } from "lucide-react";
import { Brand } from "@/components/ui";
import { LanguageSwitch } from "@/components/shell";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { isConfigured } from "@/lib/supabase/config";
export default async function SetupPage() {
  if (isConfigured()) redirect("/login");
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
          <Database />
        </div>
        <span className="eyebrow">{d.configuration}</span>
        <h1>{d.setupTitle}</h1>
        <p>{d.setupIntro}</p>
        <ol className="setup-steps">
          {[d.setupStep1, d.setupStep2, d.setupStep3].map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="notice">{d.setupNote}</p>
        <Link className="button primary" href="/login">
          {d.configured}
          <ArrowRight size={18} />
        </Link>
      </main>
    </div>
  );
}
