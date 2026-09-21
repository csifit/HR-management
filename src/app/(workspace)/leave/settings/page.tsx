import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { timeDictionary } from "@/lib/time-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam, todayInRomania } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter, BalanceTable } from "@/components/time-ui";
import {
  LeaveTypeForm,
  AllowanceForm,
  CalendarDayForm,
} from "@/components/time-forms";
export default async function LeaveSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation } = await requireHR();
  const locale = await getLocale();
  const d = timeDictionary(locale);
  const q = await searchParams;
  const proposed = Number(singleParam(q.year));
  const year =
    Number.isInteger(proposed) && proposed >= 2000 && proposed <= 2200
      ? proposed
      : Number(todayInRomania().slice(0, 4));
  const { options, employee, hasMore } = await timeEmployees(
    singleParam(q.employee),
    singleParam(q.q),
  );
  const [types, calendar, balances] = await Promise.all([
    supabase
      .from("leave_types")
      .select("*")
      .eq("organisation_id", organisation.id)
      .order("name"),
    supabase
      .from("work_calendar_days")
      .select("*")
      .eq("organisation_id", organisation.id)
      .gte("day", `${year}-01-01`)
      .lte("day", `${year}-12-31`)
      .order("day")
      .limit(366),
    employee
      ? supabase.rpc("leave_balance_summary", {
          p_org: organisation.id,
          p_employee: employee.id,
          p_year: year,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (types.error || calendar.error || balances.error)
    throw new Error("Leave settings could not be loaded.");
  const writable = organisation.status === "active";
  return (
    <>
      <Link className="back-link" href="/leave">
        ← {d.back}
      </Link>
      <PageHeader title={d.settings} />
      <form className="time-filters" action="/leave/settings">
        <label className="field time-field">
          <span>{d.search}</span>
          <input
            type="search"
            name="q"
            maxLength={80}
            defaultValue={singleParam(q.q)}
          />
        </label>
        <EmployeeFilter
          employees={options}
          selected={employee?.id}
          locale={locale}
          empty={false}
        />
        <label className="field time-field">
          <span>{d.year}</span>
          <input
            type="number"
            name="year"
            min={2000}
            max={2200}
            step={1}
            defaultValue={year}
          />
        </label>
        <button className="button secondary">{d.filter}</button>
      </form>
      {hasMore && <p className="time-help">{d.searchHint}</p>}
      <section className="card time-section">
        <div className="card-heading">
          <h2>
            {d.balances} · {year}
          </h2>
        </div>
        <p className="time-padding form-help">{d.balanceHelp}</p>
        {employee ? (
          <>
            <BalanceTable balances={balances.data ?? []} locale={locale} />
            {writable && (
              <div className="time-settings-grid time-padding">
                {balances.data?.map((b) => (
                  <AllowanceForm
                    key={`${employee.id}-${year}-${b.leave_type_id}-${b.allowance}`}
                    employeeId={employee.id}
                    balance={b}
                    year={year}
                    locale={locale}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="time-padding muted">{d.chooseEmployee}</p>
        )}
      </section>
      <div className="time-settings-grid">
        <section className="card time-padding">
          <h2>{d.types}</h2>
          <p className="time-help">{d.typeHelp}</p>
          {types.data.map((t) => (
            <details className="time-setting-row" key={t.id}>
              <summary>
                {t.name} · {t.active ? d.yes : d.no}
              </summary>
              {writable ? (
                <LeaveTypeForm type={t} locale={locale} />
              ) : (
                <p>{d[t.category]}</p>
              )}
            </details>
          ))}
          {writable && (
            <details className="time-setting-row">
              <summary>+ {d.addType}</summary>
              <LeaveTypeForm locale={locale} />
            </details>
          )}
        </section>
        <section className="card time-padding">
          <h2>
            {d.workCalendar} · {year}
          </h2>
          <p className="time-help">{d.calendarHelp}</p>
          {calendar.data.map((c) => (
            <details className="time-setting-row" key={c.id}>
              <summary>
                {c.day} · {c.label} · {c.is_working ? d.working : d.nonWorking}
              </summary>
              {writable && <CalendarDayForm day={c} locale={locale} />}
            </details>
          ))}
          {writable && <CalendarDayForm locale={locale} />}
        </section>
      </div>
    </>
  );
}
