import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dateLabel } from "@/lib/i18n";
import { payrollRunDictionary } from "@/lib/payroll-run-i18n";
import { singleParam } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { PayrollRunCreateForm } from "@/components/payroll-run-forms";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation } = await requireHR(),
    locale = await getLocale(),
    d = payrollRunDictionary(locale),
    params = await searchParams;
  const monthParam = singleParam(params.month),
    month = /^2026-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : "",
    page = Math.min(
      10000,
      Math.max(1, Math.floor(Number(singleParam(params.page))) || 1),
    );
  let query = supabase
    .from("payroll_runs")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation.id)
    .order("month", { ascending: false })
    .order("revision", { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  if (month) query = query.eq("month", `${month}-01`);
  const runs = await query;
  if (runs.error)
    throw new Error("Payroll runs could not be loaded. Check migration 015.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
  }).format(new Date());
  const href = (n: number) =>
    `?${new URLSearchParams({ month, page: String(n) })}`;
  return (
    <>
      <PageHeader title={d.title} description={d.intro} />
      <p className="time-help">{d.payrollScope}</p>
      <form className="time-filters" method="get">
        <label className="field time-field">
          <span>{d.month}</span>
          <input
            type="month"
            name="month"
            min="2026-01"
            max="2026-12"
            defaultValue={month}
          />
        </label>
        <button className="button secondary">{d.filter}</button>
        {month && (
          <Link href="/payroll" className="button secondary">
            {d.allMonths}
          </Link>
        )}
      </form>
      <section className="card table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{d.month}</th>
                <th>{d.revision}</th>
                <th>{d.status}</th>
                <th>{d.created}</th>
                <th>{d.approvedOn}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.month.slice(0, 7)}</td>
                  <td>{r.revision}</td>
                  <td>{d[r.status]}</td>
                  <td>{dateLabel(r.created_at, locale)}</td>
                  <td>{dateLabel(r.approved_at, locale)}</td>
                  <td>
                    <Link href={`/payroll/runs/${r.id}`}>{d.details}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!runs.data.length && <p className="time-padding">{d.empty}</p>}
      </section>
      <nav className="heading-actions" aria-label={d.title}>
        {page > 1 && <Link href={href(page - 1)}>{d.previous}</Link>}
        {page * 30 < (runs.count ?? 0) && (
          <Link href={href(page + 1)}>{d.next}</Link>
        )}
      </nav>
      {organisation.status === "active" ? (
        <section className="card time-form-card">
          <h2>{d.newRun}</h2>
          <PayrollRunCreateForm
            locale={locale}
            month={
              month ||
              (today.startsWith("2026") ? today.slice(0, 7) : "2026-12")
            }
          />
        </section>
      ) : (
        <p className="notice">{d.inactive}</p>
      )}
    </>
  );
}
