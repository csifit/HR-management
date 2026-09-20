import Link from "next/link";
import { Plus, ChevronDown, Building2 } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dateLabel } from "@/lib/i18n";
import { platformDictionary } from "@/lib/platform-i18n";
import { PageHeader } from "@/components/ui";
import {
  PlatformOrganisationForm,
  OrganisationAccessForm,
} from "@/components/platform-forms";
export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
    created?: string | string[];
  }>;
}) {
  const { supabase } = await requirePlatformAdmin();
  const locale = await getLocale();
  const d = platformDictionary(locale);
  const query = await searchParams;
  const single = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : "";
  const search = single(query.q).trim().slice(0, 100);
  const status = ["active", "suspended", "blocked"].includes(
    single(query.status),
  )
    ? single(query.status)
    : "";
  const page = Math.min(
    100000,
    Math.max(1, Number.parseInt(single(query.page), 10) || 1),
  );
  const { data, error } = await supabase.rpc("platform_organisation_list", {
    p_search: search,
    p_status: status,
    p_page: page,
  });
  if (error || !data) throw new Error("Organisations could not be loaded.");
  const href = (page: number) =>
    `/platform?${new URLSearchParams({ q: search, status, page: String(page) })}`;
  return (
    <>
      <PageHeader
        title={d.organisations}
        eyebrow={d.title}
        description={d.intro}
      >
        <Link className="button primary" href="/platform/new">
          <Plus size={18} />
          {d.add}
        </Link>
      </PageHeader>
      {query.created &&
        data.organisations.some((o) => o.id === query.created) && (
          <p className="notice success" role="status">
            {d.created}
          </p>
        )}
      <form className="platform-filters" action="/platform">
        <label className="sr-only" htmlFor="platform-search">
          {d.search}
        </label>
        <input
          id="platform-search"
          type="search"
          name="q"
          placeholder={d.search}
          defaultValue={search}
          maxLength={100}
        />
        <label className="sr-only" htmlFor="platform-filter">
          {d.status}
        </label>
        <select id="platform-filter" name="status" defaultValue={status}>
          <option value="">{d.all}</option>
          {(["active", "suspended", "blocked"] as const).map((value) => (
            <option key={value} value={value}>
              {d[value]}
            </option>
          ))}
        </select>
        <button className="button secondary">{d.filter}</button>
        <span className="muted">
          {data.total} {d.total}
        </span>
      </form>
      <div className="organisation-list">
        {!data.organisations.length && (
          <div className="card platform-empty">{d.noResults}</div>
        )}
        {data.organisations.map((org) => (
          <details
            className="card organisation-accordion"
            key={org.id}
            open={org.id === query.created || undefined}
          >
            <summary>
              <span className="org-icon">
                <Building2 size={19} />
              </span>
              <span className="organisation-identity">
                <strong>{org.name}</strong>
                <small>{org.cui}</small>
              </span>
              <span className="organisation-counts">
                {org.employee_count} {d.employees}
                <small>
                  {org.member_count} {d.members}
                </small>
              </span>
              <span
                className={`organisation-status organisation-${org.status}`}
              >
                {d[org.status]}
              </span>
              <ChevronDown className="accordion-chevron" size={18} />
            </summary>
            <div className="organisation-expanded">
              <div className="organisation-edit-grid">
                <section>
                  <h2>{d.details}</h2>
                  <p className="muted platform-section-intro">
                    {d.profileHint}
                  </p>
                  <PlatformOrganisationForm
                    organisation={org}
                    locale={locale}
                  />
                </section>
                <section className="organisation-access">
                  <h2>{d.access}</h2>
                  <p className="platform-owner">
                    <strong>{d.owners}</strong>
                    <br />
                    {org.owners.join(", ") || "—"}
                  </p>
                  {org.status_reason && (
                    <div className="notice">
                      <div>
                        <strong>{d.reason}</strong>
                        <p>{org.status_reason}</p>
                        <small>
                          {dateLabel(org.status_changed_at, locale)}
                        </small>
                      </div>
                    </div>
                  )}
                  <OrganisationAccessForm organisation={org} locale={locale} />
                </section>
              </div>
              <section className="platform-history">
                <h2>{d.history}</h2>
                <p className="muted">{d.historyHint}</p>
                <ol>
                  {org.history.map((event) => (
                    <li key={event.id}>
                      <time dateTime={event.created_at}>
                        {new Intl.DateTimeFormat(
                          locale === "ro" ? "ro-RO" : "en-GB",
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Europe/Bucharest",
                          },
                        ).format(new Date(event.created_at))}
                      </time>
                      <div>
                        <strong>
                          {event.action === "organisation.created"
                            ? d.orgCreated
                            : event.action === "organisation.status_changed"
                              ? d.statusChanged
                              : d.orgUpdated}
                        </strong>
                        {event.metadata.from_status &&
                          event.metadata.to_status && (
                            <p>
                              {d[event.metadata.from_status]} →{" "}
                              {d[event.metadata.to_status]}
                            </p>
                          )}
                        {event.metadata.reason && (
                          <p>{event.metadata.reason}</p>
                        )}
                        {!!event.metadata.changed_fields?.length && (
                          <p className="muted">
                            {event.metadata.changed_fields
                              .map((field) =>
                                field === "status_reason"
                                  ? d.reason
                                  : field in d
                                    ? d[field as keyof typeof d]
                                    : field,
                              )
                              .join(", ")}
                          </p>
                        )}
                        <small className="muted">
                          {d.actor}: {event.user_id ?? "—"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </details>
        ))}
      </div>
      <nav className="platform-pagination" aria-label={d.page}>
        {page > 1 && (
          <Link className="button secondary" href={href(page - 1)}>
            {d.prev}
          </Link>
        )}
        <span>
          {d.page} {page} / {Math.max(1, Math.ceil(data.total / 25))}
        </span>
        {page * 25 < data.total && (
          <Link className="button secondary" href={href(page + 1)}>
            {d.next}
          </Link>
        )}
      </nav>
    </>
  );
}
