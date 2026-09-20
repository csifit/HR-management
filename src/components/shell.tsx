"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Files,
  CalendarDays,
  Clock3,
  Gift,
  FolderClosed,
  Plug,
  Settings2,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Plus,
  Building2,
} from "lucide-react";
import { changeLocale, signOut, switchOrganisation } from "@/app/actions";
import { dictionary, roleLabel, type Locale } from "@/lib/i18n";
import type { Membership, Organisation } from "@/lib/types";
import { canManage } from "@/lib/types";
import { Brand, Avatar } from "./ui";
import { platformDictionary } from "@/lib/platform-i18n";
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <form
      action={changeLocale}
      className="language-switch"
      aria-label={locale === "ro" ? "Limba interfeței" : "Interface language"}
    >
      <button name="locale" value="ro" aria-pressed={locale === "ro"}>
        RO
      </button>
      <button name="locale" value="en" aria-pressed={locale === "en"}>
        EN
      </button>
    </form>
  );
}
export function AppShell({
  children,
  locale,
  organisation,
  membership,
  organisations,
  platformAdmin,
}: {
  children: React.ReactNode;
  locale: Locale;
  organisation: Organisation;
  membership: Membership;
  organisations: Pick<Organisation, "id" | "name">[];
  platformAdmin: boolean;
}) {
  const d = dictionary(locale);
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    { href: "/dashboard", label: d.overview, icon: LayoutDashboard },
    { href: "/employees", label: d.employees, icon: Users },
    ...(membership.role !== "manager"
      ? [{ href: "/contracts", label: d.contracts, icon: Files }]
      : []),
  ];
  const current = path.startsWith("/settings/team")
    ? d.team
    : path.startsWith("/settings")
      ? d.settings
      : path.startsWith("/platform")
        ? d.platform
        : (nav.find((item) => path.startsWith(item.href))?.label ?? d.overview);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {locale === "ro" ? "Sari la conținut" : "Skip to content"}
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label={d.cancel}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label={d.cancel}
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="organisation-picker">
          <span className="org-icon">
            <Building2 size={18} />
          </span>
          <div>
            <strong>{organisation.name}</strong>
            <span>{roleLabel(membership.role, d)}</span>
          </div>
          {organisations.length > 1 && (
            <form action={switchOrganisation}>
              <label className="sr-only" htmlFor="organisation_id">
                {d.settings}
              </label>
              <select
                id="organisation_id"
                name="organisation_id"
                value={organisation.id}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                aria-label={d.settings}
              >
                {organisations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </form>
          )}
        </div>
        <nav className="sidebar-nav" aria-label={d.workspace}>
          <span className="nav-section-label">{d.workspace}</span>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${path.startsWith(href) ? "nav-active" : ""}`}
              aria-current={path.startsWith(href) ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
          <span className="nav-section-label next-section">{d.comingNext}</span>
          {[
            { label: d.leave, icon: CalendarDays },
            { label: d.attendance, icon: Clock3 },
            { label: d.benefits, icon: Gift },
            { label: d.documents, icon: FolderClosed },
            { label: d.integrations, icon: Plug },
          ].map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="nav-item nav-planned"
              aria-disabled="true"
            >
              <Icon size={19} />
              {label}
              <span className="planned-dash">—</span>
            </span>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {canManage(membership.role) && (
            <Link
              className={`nav-item ${path === "/settings/team" ? "nav-active" : ""}`}
              href="/settings/team"
              onClick={() => setMobileOpen(false)}
            >
              <ShieldCheck size={19} />
              {d.team}
            </Link>
          )}
          <Link
            className={`nav-item ${path === "/settings" ? "nav-active" : ""}`}
            href="/settings"
            onClick={() => setMobileOpen(false)}
          >
            <Settings2 size={19} />
            {d.settings}
          </Link>
          {platformAdmin && (
            <Link className="nav-item" href="/platform">
              <ShieldCheck size={19} />
              {d.platform}
            </Link>
          )}
          <div className="sidebar-user">
            <Avatar name={membership.display_name} />
            <div>
              <strong>{membership.display_name}</strong>
              <span>{roleLabel(membership.role, d)}</span>
            </div>
            <form action={signOut}>
              <button
                className="icon-button"
                title={d.signOut}
                aria-label={d.signOut}
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-label={d.workspace}
            >
              <Menu size={22} />
            </button>
            <span>{organisation.name}</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <LanguageSwitch locale={locale} />
            <span className="topbar-divider" />
            <span className="workspace-label">
              <ShieldCheck size={15} />
              {d.secureWorkspace}
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {organisation.status === "suspended" && (
            <div className="notice organisation-restriction" role="status">
              <div>
                <strong>{platformDictionary(locale).suspendedBanner}</strong>
                {organisation.status_reason && (
                  <p>{organisation.status_reason}</p>
                )}
              </div>
            </div>
          )}
          {children}
        </main>
        <footer className="app-footer">
          <span>{organisation.name}</span>
          <Link href="/onboarding">
            <Plus size={13} />
            {d.addOrg}
          </Link>
        </footer>
      </div>
    </div>
  );
}
