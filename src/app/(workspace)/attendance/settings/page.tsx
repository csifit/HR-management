import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dateLabel, type Locale } from "@/lib/i18n";
import { timeDictionary } from "@/lib/time-i18n";
import { scheduleDictionary, weekdayLabels } from "@/lib/schedule-i18n";
import { pageNumber } from "@/lib/data";
import { timeEmployees } from "@/lib/time-data";
import { singleParam, todayInRomania } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { WorkScheduleForm } from "@/components/work-schedule-form";

async function SchedulePanel({
  employeeId,
  title,
  locale,
  today,
  page,
  href,
}: {
  employeeId: string | null;
  title: string;
  locale: Locale;
  today: string;
  page: number;
  href: (page: number) => string;
}) {
  const { supabase, organisation } = await requireHR();
  const d = scheduleDictionary(locale);
  const td = timeDictionary(locale);
  const writable = organisation.status === "active";
  const scoped = () => {
    const query = supabase
      .from("work_schedules")
      .select("*", { count: "exact" })
      .eq("organisation_id", organisation.id);
    return employeeId
      ? query.eq("employee_id", employeeId)
      : query.is("employee_id", null);
  };
  const [history, current, company] = await Promise.all([
    scoped()
      .order("effective_from", { ascending: false })
      .range((page - 1) * 20, page * 20 - 1),
    scoped()
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    employeeId
      ? supabase
          .from("work_schedules")
          .select("weekdays")
          .eq("organisation_id", organisation.id)
          .is("employee_id", null)
          .lte("effective_from", today)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (history.error || current.error || company.error)
    throw new Error("Work schedules could not be loaded.");
  const weekdays = weekdayLabels(locale);
  const describe = (days: number[] | null) =>
    days
      ? `${days.map((n) => weekdays[n - 1]).join(", ")} · ${days.length} ${d.days}`
      : d.inherit;
  const effective = current.data?.weekdays ??
    company.data?.weekdays ?? [1, 2, 3, 4, 5];
  return (
    <section className="card time-padding time-section">
      <h2>{title}</h2>
      <p className="time-help">
        <strong>{d.current}:</strong> {describe(effective)}
        {employeeId && !current.data?.weekdays ? ` (${d.inherit})` : ""}
      </p>
      {writable && (
        <details className="time-setting-row">
          <summary>+ {d.add}</summary>
          <WorkScheduleForm
            key={`${employeeId ?? "company"}-${history.count}`}
            employeeId={employeeId}
            today={today}
            locale={locale}
          />
        </details>
      )}
      <h3 className="schedule-history-title">{d.history}</h3>
      {!history.data.length && <p className="time-help">{d.none}</p>}
      {history.data.map((schedule) => (
        <details key={schedule.id} className="time-setting-row">
          <summary>
            {dateLabel(schedule.effective_from, locale)} ·{" "}
            {describe(schedule.weekdays)}
          </summary>
          {writable && schedule.effective_from >= today ? (
            <WorkScheduleForm
              key={schedule.version}
              employeeId={employeeId}
              schedule={schedule}
              today={today}
              locale={locale}
            />
          ) : (
            <p className="time-help">{d.past}</p>
          )}
        </details>
      ))}
      <div className="pagination">
        {page > 1 && <Link href={href(page - 1)}>{td.previous}</Link>}
        {page * 20 < (history.count ?? 0) && (
          <Link href={href(page + 1)}>{td.next}</Link>
        )}
      </div>
    </section>
  );
}

export default async function WorkSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireHR();
  const locale = await getLocale();
  const d = scheduleDictionary(locale);
  const td = timeDictionary(locale);
  const q = await searchParams;
  const { employee, options, hasMore } = await timeEmployees(
    singleParam(q.employee),
    singleParam(q.q),
  );
  const today = todayInRomania();
  const orgPage = pageNumber(singleParam(q.orgPage));
  const employeePage = pageNumber(singleParam(q.employeePage));
  const href = (patch: Record<string, string>) =>
    `/attendance/settings?${new URLSearchParams({ employee: employee?.id ?? "", q: singleParam(q.q), orgPage: String(orgPage), employeePage: String(employeePage), ...patch })}`;
  return (
    <>
      <Link className="back-link" href="/attendance">
        ← {td.attendance}
      </Link>
      <PageHeader title={d.title} description={d.intro}>
        <Link className="button secondary" href="/leave/settings">
          {td.workCalendar}
        </Link>
      </PageHeader>
      <p className="notice">{d.help}</p>
      <p className="time-help">{d.effectiveHelp}</p>
      <p className="time-help">{d.payroll}</p>
      <SchedulePanel
        employeeId={null}
        title={d.organisation}
        locale={locale}
        today={today}
        page={orgPage}
        href={(page) => href({ orgPage: String(page) })}
      />
      <form action="/attendance/settings" className="time-filters">
        <label className="field time-field">
          <span>{td.search}</span>
          <input
            name="q"
            type="search"
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
        <button className="button secondary">{td.filter}</button>
      </form>
      {hasMore && <p className="time-help">{td.searchHint}</p>}
      {employee ? (
        <SchedulePanel
          key={employee.id}
          employeeId={employee.id}
          title={`${d.employee} · ${employee.first_name} ${employee.last_name}`}
          locale={locale}
          today={today}
          page={employeePage}
          href={(page) => href({ employeePage: String(page) })}
        />
      ) : (
        <p className="notice">{td.chooseEmployee}</p>
      )}
    </>
  );
}
