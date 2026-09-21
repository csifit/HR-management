import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { benefitDictionary } from "@/lib/benefit-i18n";
import { singleParam, monthParam } from "@/lib/time";
import { pageNumber, searchTerm } from "@/lib/data";
import { moneyLabel, dateLabel } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import {
  PrepareBenefitsForm,
  ReviewBenefitForm,
  ApproveBenefitsForm,
} from "@/components/benefit-forms";
export default async function MonthlyBenefits({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation } = await requireHR();
  const locale = await getLocale();
  const d = benefitDictionary(locale);
  const q = await searchParams;
  const month = monthParam(singleParam(q.month));
  const page = pageNumber(singleParam(q.page));
  const search = searchTerm(singleParam(q.q));
  const pending = singleParam(q.pending) === "1";
  const result = await supabase
    .from("benefit_runs")
    .select("*")
    .eq("organisation_id", organisation.id)
    .eq("month", `${month}-01`)
    .maybeSingle();
  if (result.error) throw new Error("Benefits month could not be loaded.");
  const run = result.data;
  const writable = organisation.status === "active";
  let query = supabase
    .from("benefit_run_items")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation.id)
    .eq("run_id", run?.id ?? "00000000-0000-4000-8000-000000000000");
  if (pending) query = query.eq("reviewed", false);
  if (search) query = query.ilike("employee_name", `%${search}%`);
  const [rows, summary] = await Promise.all([
    query
      .order("employee_name")
      .order("benefit_name")
      .order("id")
      .range((page - 1) * 25, page * 25 - 1),
    run
      ? supabase.rpc("benefit_month_summary", {
          p_org: organisation.id,
          p_run: run.id,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (rows.error || summary.error)
    throw new Error("Benefit preparation could not be loaded.");
  const totals = summary.data;
  const href = (n: number) =>
    `/benefits/monthly?${new URLSearchParams({ month, q: search, pending: pending ? "1" : "", page: String(n) })}`;
  return (
    <>
      <Link className="back-link" href="/benefits">
        ← {d.back}
      </Link>
      <PageHeader title={d.monthly} description={d.prepareHelp} />
      <form action="/benefits/monthly" className="time-filters">
        <label className="field time-field">
          <span>{d.month}</span>
          <input
            name="month"
            type="month"
            required
            min="2000-01"
            max="2200-12"
            defaultValue={month}
          />
        </label>
        <label className="field time-field">
          <span>{d.search}</span>
          <input name="q" type="search" maxLength={80} defaultValue={search} />
        </label>
        <label className="field time-field">
          <span>{d.review}</span>
          <select name="pending" defaultValue={pending ? "1" : ""}>
            <option value="">{d.all}</option>
            <option value="1">{d.onlyPending}</option>
          </select>
        </label>
        <button className="button secondary">{d.filter}</button>
      </form>
      <p className="notice">{d.connectionHelp}</p>
      {run ? (
        <>
          <div className="benefit-run-heading">
            <h2>{month}</h2>
            <span
              className={`time-status ${run.status === "approved" ? "time-approved" : "time-pending"}`}
            >
              {d[run.status]}
            </span>
            <span className="muted">
              {dateLabel(run.approved_at ?? run.prepared_at, locale)}
            </span>
          </div>
          {totals && (
            <>
              <div className="attendance-totals benefit-totals">
                {[
                  [d.employees, totals.employees],
                  [d.workedDays, totals.worked_days],
                  [d.pending, totals.unreviewed],
                  [d.total, moneyLabel(totals.total, locale)],
                ].map(([label, value]) => (
                  <div className="card" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="time-help">{d.workedHelp}</p>
            </>
          )}
          <section className="card table-card time-section">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{d.employee}</th>
                    <th>{d.benefit}</th>
                    <th>{d.workedDays}</th>
                    <th>{d.suggested}</th>
                    <th>{d.final}</th>
                    <th>{d.review}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.data.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link
                          href={`/benefits?employee=${i.employee_id}&month=${month}`}
                        >
                          {i.employee_name}
                        </Link>
                      </td>
                      <td>
                        {i.benefit_name}
                        <small className="time-subline">
                          {i.provider_name} · {d[i.model]}
                        </small>
                        {i.model === "annual_allowance" && (
                          <small className="time-subline">
                            {d.annualRemaining}:{" "}
                            {moneyLabel(i.unit_amount - i.annual_used, locale)}
                          </small>
                        )}
                      </td>
                      <td>
                        {i.worked_days}
                        <small className="time-subline">
                          {d.missingDays}: {i.missing_days}
                        </small>
                      </td>
                      <td>
                        {i.model === "non_financial"
                          ? "—"
                          : moneyLabel(i.suggested_amount, locale)}
                      </td>
                      <td>
                        {i.model === "non_financial"
                          ? "—"
                          : moneyLabel(i.final_amount, locale)}
                        <small className="time-subline">
                          {i.included ? d.included : d.excluded}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`time-status ${i.reviewed ? "time-approved" : "time-pending"}`}
                        >
                          {i.reviewed ? d.reviewed : d.needsReview}
                        </span>
                        {!!i.flags.length && (
                          <ul className="benefit-flags">
                            {i.flags.map((f) => (
                              <li key={f}>{d[f]}</li>
                            ))}
                          </ul>
                        )}
                        {i.review_note && (
                          <p className="time-decision-note">{i.review_note}</p>
                        )}
                        {writable && run.status === "draft" && (
                          <details className="time-review">
                            <summary>{d.review}</summary>
                            <ReviewBenefitForm item={i} locale={locale} />
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.data.length && (
                <p className="time-padding muted">{d.none}</p>
              )}
            </div>
            <div className="table-footer">
              <span>
                {rows.count ?? 0} · {d.items}
              </span>
              <div className="pagination">
                {page > 1 && <Link href={href(page - 1)}>{d.previous}</Link>}
                <span>
                  {d.page} {page}
                </span>
                {page * 25 < (rows.count ?? 0) && (
                  <Link href={href(page + 1)}>{d.next}</Link>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <p className="notice">{d.noRun}</p>
      )}
      {writable && run?.status !== "approved" && (
        <div className="time-settings-grid">
          <section className="card time-padding">
            <h2>{run ? d.reprepare : d.prepare}</h2>
            <PrepareBenefitsForm run={run} month={month} locale={locale} />
          </section>
          {run && (
            <section className="card time-padding">
              <h2>{d.approve}</h2>
              <ApproveBenefitsForm run={run} locale={locale} />
            </section>
          )}
        </div>
      )}
    </>
  );
}
