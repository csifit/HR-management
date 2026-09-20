import { Brand } from "@/components/ui";
import { LanguageSwitch } from "@/components/shell";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { Users, Files, ShieldCheck, ArrowUpRight } from "lucide-react";
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand light />
        <div className="story-content">
          <span className="story-eyebrow">{d.authEyebrow}</span>
          <h1>{d.authStory}</h1>
          <p>{d.authStoryBody}</p>
          <div className="story-modules">
            <span>
              <Users size={20} />
              {d.employees}
              <ArrowUpRight size={16} />
            </span>
            <span>
              <Files size={20} />
              {d.contracts}
              <ArrowUpRight size={16} />
            </span>
            <span>
              <ShieldCheck size={20} />
              {d.team}
              <ArrowUpRight size={16} />
            </span>
          </div>
        </div>
        <div className="story-footer">
          <span className="story-line" />
          {d.authFoot}
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-top">
          <div className="mobile-only">
            <Brand />
          </div>
          <LanguageSwitch locale={locale} />
        </div>
        <main className="auth-content">{children}</main>
        <div className="auth-bottom">{d.secureWorkspace}</div>
      </div>
    </div>
  );
}
