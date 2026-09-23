import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { PageHeader, Detail } from "@/components/ui";
import { OrganisationForm } from "@/components/forms";
import Link from "next/link";
import { canManage } from "@/lib/types";
export default async function SettingsPage() {
  const { organisation, membership } = await requireOrganisation();
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <>
      <PageHeader title={d.organisationDetails} />
      <div className="time-actions">
        <Link className="button secondary" href="/account/security">
          {locale === "ro" ? "Securitatea contului" : "Account security"}
        </Link>
        {canManage(membership.role) && (
          <Link className="button secondary" href="/settings/data-protection">
            {locale === "ro" ? "Protecția datelor" : "Data protection"}
          </Link>
        )}
      </div>
      <section className="card settings-form">
        {membership.role === "organisation_owner" &&
        organisation.status === "active" ? (
          <OrganisationForm locale={locale} organisation={organisation} />
        ) : (
          <>
            <dl className="details-grid">
              <Detail label={d.orgName}>{organisation.name}</Detail>
              <Detail label={d.cui}>{organisation.cui}</Detail>
            </dl>
            {organisation.status === "active" && (
              <p className="notice profile-aside-note">{d.orgReadOnly}</p>
            )}
          </>
        )}
      </section>
    </>
  );
}
