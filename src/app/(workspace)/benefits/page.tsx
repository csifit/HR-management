import Link from "next/link";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage } from "@/lib/types";
import { benefitDictionary } from "@/lib/benefit-i18n";
import { employeeDictionary } from "@/lib/employee-i18n";
import { benefitCatalogue } from "@/lib/benefit-data";
import { timeEmployees } from "@/lib/time-data";
import { singleParam, monthParam } from "@/lib/time";
import { dateLabel, moneyLabel } from "@/lib/i18n";
import { pageNumber } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { EnrolmentForm } from "@/components/benefit-forms";
export default async function BenefitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation, membership } = await requireOrganisation();
  const locale = await getLocale();
  const d = benefitDictionary(locale);
  const ed = employeeDictionary(locale);
  const self = membership.role === "employee";
  const q = await searchParams;
  const hr = canManage(membership.role);
  const writable = hr && organisation.status === "active";
  const page = pageNumber(singleParam(q.page));
  const month = monthParam(singleParam(q.month));
  const [{ employee, options, hasMore }, { benefits, providers }] =
    await Promise.all([
      timeEmployees(
        hr ? singleParam(q.employee) : "",
        hr ? singleParam(q.q) : "",
        !hr,
      ),
      benefitCatalogue(),
    ]);
  // Restrict before pagination so a draft cannot produce empty history pages.
  const approvedRun =
    hr && employee
      ? await supabase
          .from("benefit_runs")
          .select("id")
          .eq("organisation_id", organisation.id)
          .eq("month", `${month}-01`)
          .eq("status", "approved")
          .maybeSingle()
      : { data: null, error: null };
  if (approvedRun.error)
    throw new Error("Benefit history could not be loaded.");
  let historyQuery = supabase
    .from("benefit_run_items")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation.id)
    .eq("employee_id", employee?.id ?? "00000000-0000-4000-8000-000000000000")
    .eq("month", `${month}-01`);
  if (hr)
    historyQuery = historyQuery.eq(
      "run_id",
      approvedRun.data?.id ?? "00000000-0000-4000-8000-000000000000",
    );
  const [enrolments, history] = employee
    ? await Promise.all([
        supabase
          .from("employee_benefits")
          .select("*", { count: "exact" })
          .eq("organisation_id", organisation.id)
          .eq("employee_id", employee.id)
          .order("id")
          .range((page - 1) * 25, page * 25 - 1),
        historyQuery
          .order("benefit_name")
          .order("id")
          .range(
            (pageNumber(singleParam(q.historyPage)) - 1) * 25,
            pageNumber(singleParam(q.historyPage)) * 25 - 1,
          ),
      ])
    : [
        { data: [], error: null, count: 0 },
        { data: [], error: null, count: 0 },
      ];
  if (enrolments.error || history.error)
    throw new Error("Employee benefits could not be loaded.");
  const items = history.data;
  const historyPage = pageNumber(singleParam(q.historyPage));
  const href = (patch: Record<string, string>) =>
    `/benefits?${new URLSearchParams({ employee: employee?.id ?? "", month, page: String(page), historyPage: String(historyPage), ...patch })}`;
  return (
    <>
      <PageHeader
        title={self ? ed.benefits : d.title}
        description={self ? ed.benefitsIntro : d.intro}
      >
        {hr && (
          <div className="time-actions">
            <Link className="button secondary" href="/benefits/settings">
              {d.settings}
            </Link>
            <Link className="button primary" href="/benefits/monthly">
              {d.monthly}
            </Link>
          </div>
        )}
      </PageHeader>
      <form action="/benefits" className="time-filters">
        {hr && (
          <label className="field time-field">
            <span>{d.search}</span>
            <input
              type="search"
              name="q"
              defaultValue={singleParam(q.q)}
              maxLength={80}
            />
          </label>
        )}
        {hr && (
          <EmployeeFilter
            employees={options}
            selected={employee?.id}
            locale={locale}
            empty={false}
          />
        )}
        <label className="field time-field">
          <span>{d.month}</span>
          <input
            type="month"
            name="month"
            required
            min="2000-01"
            max="2200-12"
            defaultValue={month}
          />
        </label>
        <button className="button secondary">{d.filter}</button>
      </form>
      {hasMore && <p className="time-help">{d.searchHint}</p>}
      {employee ? (
        <>
          <section className="card time-padding time-section">
            <h2>
              {employee.first_name} {employee.last_name}
            </h2>
            <p className="time-help">
              {hr ? d.enrolmentHelp : ed.benefitsHelp}
            </p>
            {enrolments.data.map((e) => {
              const b = benefits.find((b) => b.id === e.benefit_id);
              return (
                <details className="time-setting-row" key={e.id}>
                  <summary>
                    {b?.name ?? "—"} · {dateLabel(e.starts_on, locale)} —{" "}
                    {e.ends_on ? dateLabel(e.ends_on, locale) : d.ongoing} ·{" "}
                    {e.active ? d.enabled : d.disabledLabel}
                  </summary>
                  {b && (
                    <p className="time-help">
                      {d[b.model]} · {moneyLabel(b.amount, locale)} ·{" "}
                      {providers.find((p) => p.id === b.provider_id)?.name}
                    </p>
                  )}
                  {writable && (
                    <EnrolmentForm
                      record={e}
                      employeeId={employee.id}
                      startDate={employee.start_date}
                      benefits={benefits}
                      locale={locale}
                    />
                  )}
                </details>
              );
            })}
            {!enrolments.data.length && <p className="time-help">{d.none}</p>}
            <div className="pagination">
              {page > 1 && (
                <Link href={href({ page: String(page - 1) })}>
                  {d.previous}
                </Link>
              )}
              {page * 25 < (enrolments.count ?? 0) && (
                <Link href={href({ page: String(page + 1) })}>{d.next}</Link>
              )}
            </div>
            {writable &&
              (benefits.some((b) => b.active) ? (
                <details className="time-setting-row">
                  <summary>+ {d.enrol}</summary>
                  <EnrolmentForm
                    employeeId={employee.id}
                    startDate={employee.start_date}
                    benefits={benefits}
                    locale={locale}
                  />
                </details>
              ) : (
                <p className="notice">{d.catalogueFirst}</p>
              ))}
          </section>
          <section className="card table-card">
            <div className="card-heading">
              <h2>
                {d.history} · {month}
              </h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{d.benefit}</th>
                    <th>{d.provider}</th>
                    <th>{d.review}</th>
                    <th>{d.final}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.benefit_name}</td>
                      <td>{i.provider_name}</td>
                      <td>{i.included ? d.included : d.excluded}</td>
                      <td>
                        {i.model === "non_financial"
                          ? "—"
                          : moneyLabel(i.final_amount, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!items.length && <p className="time-padding muted">{d.none}</p>}
            </div>
            <div className="table-footer pagination">
              {historyPage > 1 && (
                <Link href={href({ historyPage: String(historyPage - 1) })}>
                  {d.previous}
                </Link>
              )}
              {historyPage * 25 < (history.count ?? 0) && (
                <Link href={href({ historyPage: String(historyPage + 1) })}>
                  {d.next}
                </Link>
              )}
            </div>
          </section>
        </>
      ) : (
        <p className="notice">{hr ? d.chooseEmployee : d.noAccount}</p>
      )}
    </>
  );
}
