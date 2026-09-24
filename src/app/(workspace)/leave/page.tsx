import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage } from "@/lib/types";
import { dateLabel } from "@/lib/i18n";
import { timeDictionary } from "@/lib/time-i18n";
import { employeeDictionary } from "@/lib/employee-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam, monthParam, monthDays, todayInRomania } from "@/lib/time";
import { timeDate } from "@/lib/time-validation";
import { pageNumber } from "@/lib/data";
import type { LeaveStatus } from "@/lib/time-types";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter, BalanceTable, TimeStatus } from "@/components/time-ui";
import { LeaveDecisionForm } from "@/components/time-forms";
export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation, membership, user } =
    await requireOrganisation();
  const locale = await getLocale();
  const d = timeDictionary(locale);
  const ed = employeeDictionary(locale);
  const self = membership.role === "employee";
  const q = await searchParams;
  const hr = canManage(membership.role);
  const writable = organisation.status === "active";
  const view = singleParam(q.view) === "calendar" ? "calendar" : "list";
  const month =
    singleParam(q.month) || view === "calendar"
      ? monthParam(singleParam(q.month))
      : "";
  const day = timeDate.safeParse(singleParam(q.day));
  const selectedDay = day.success ? day.data : "";
  const status = (
    ["pending", "approved", "rejected", "cancelled"] as string[]
  ).includes(singleParam(q.status))
    ? (singleParam(q.status) as LeaveStatus)
    : undefined;
  const page = pageNumber(singleParam(q.page));
  const search = singleParam(q.q);
  const { options, employee, hasMore } = await timeEmployees(
    self ? "" : singleParam(q.employee),
    self ? "" : search,
    self,
  );
  const year = Number((month || todayInRomania()).slice(0, 4));
  let query = supabase
    .from("leave_requests")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation.id);
  if (employee || self)
    query = query.eq(
      "employee_id",
      employee?.id ?? "00000000-0000-4000-8000-000000000000",
    );
  if (status) query = query.eq("status", status);
  if (month)
    query = query
      .lte("start_date", monthDays(month).at(-1)!)
      .gte("end_date", `${month}-01`);
  if (selectedDay) query = query.contains("work_dates", [selectedDay]);
  const [requests, types, balances, calendar] = await Promise.all([
    query
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * 25, page * 25 - 1),
    supabase
      .from("leave_types")
      .select("*")
      .eq("organisation_id", organisation.id),
    employee
      ? supabase.rpc("leave_balance_summary", {
          p_org: organisation.id,
          p_employee: employee.id,
          p_year: year,
        })
      : Promise.resolve({ data: [], error: null }),
    view === "calendar" && (!self || employee)
      ? supabase.rpc("leave_calendar", {
          p_org: organisation.id,
          p_month: `${month}-01`,
          p_employee: employee?.id ?? null,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (requests.error || types.error || balances.error || calendar.error)
    throw new Error("Leave could not be loaded.");
  const ids = [...new Set(requests.data.map((r) => r.employee_id))];
  const people = ids.length
    ? await supabase
        .from("employees")
        .select("id,first_name,last_name,user_id,manager_user_id,start_date")
        .eq("organisation_id", organisation.id)
        .in("id", ids)
    : { data: [], error: null };
  if (people.error) throw new Error("Leave employees could not be loaded.");
  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({
      month,
      employee: employee?.id ?? "",
      status: status ?? "",
      view,
      ...patch,
    });
    return `/leave?${params}`;
  };
  return (
    <>
      <PageHeader
        title={self ? ed.leave : d.leave}
        description={self ? ed.leaveIntro : d.leaveIntro}
      >
        <div className="time-actions">
          {hr && (
            <Link className="button secondary" href="/leave/settings">
              <Settings2 size={17} />
              {d.settings}
            </Link>
          )}
          {writable && (!self || employee) && (
            <Link
              className="button primary"
              href={`/leave/new${employee && (hr || employee.user_id === user.id) ? `?employee=${employee.id}` : ""}`}
            >
              <Plus size={17} />
              {d.request}
            </Link>
          )}
        </div>
      </PageHeader>
      {q.saved === "1" && (
        <p className="notice success" role="status">
          {d.requested}
        </p>
      )}
      <form className="time-filters" action="/leave">
        <input type="hidden" name="view" value={view} />
        {!self && (
          <label className="field time-field">
            <span>{d.search}</span>
            <input
              type="search"
              name="q"
              defaultValue={search}
              maxLength={80}
            />
          </label>
        )}
        {!self && (
          <EmployeeFilter
            employees={options}
            selected={employee?.id}
            locale={locale}
          />
        )}
        <label className="field time-field">
          <span>{d.month}</span>
          <input
            name="month"
            type="month"
            min="2000-01"
            max="2200-12"
            defaultValue={month}
          />
        </label>
        <label className="field time-field">
          <span>{d.status}</span>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">{d.allStatuses}</option>
            {(["pending", "approved", "rejected", "cancelled"] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {d[s]}
                </option>
              ),
            )}
          </select>
        </label>
        <button className="button secondary">{d.filter}</button>
      </form>
      <p className="time-help">{hasMore ? d.searchHint : d.allMonths}</p>
      {self && !employee && <p className="notice">{ed.noAccount}</p>}
      {employee && (
        <section className="card time-section">
          <div className="card-heading">
            <h2>
              {d.balances} · {year}
            </h2>
            {hr && (
              <Link
                href={`/leave/settings?employee=${employee.id}&year=${year}`}
              >
                {d.settings}
              </Link>
            )}
          </div>
          <BalanceTable balances={balances.data ?? []} locale={locale} />
          <p className="time-padding form-help">{d.balanceHelp}</p>
        </section>
      )}
      <nav className="time-tabs">
        <Link
          href={href({ view: "list" })}
          aria-current={view === "list" ? "page" : undefined}
        >
          {d.list}
        </Link>
        <Link
          href={href({ view: "calendar", month: month || monthParam("") })}
          aria-current={view === "calendar" ? "page" : undefined}
        >
          {d.calendar}
        </Link>
      </nav>
      {view === "calendar" ? (
        <section className="card time-section">
          <p className="time-padding form-help">{d.calendarOnly}</p>
          <div className="leave-calendar">
            {Array.from({ length: 7 }, (_, i) => (
              <strong key={i} className="calendar-weekday">
                {new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2024, 0, i + 1)))}
              </strong>
            ))}
            {Array.from(
              {
                length: (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7,
              },
              (_, i) => (
                <span key={`empty-${i}`} />
              ),
            )}
            {calendar.data?.map((c) => (
              <Link
                className={`calendar-day ${c.pending || c.approved ? "has-leave" : ""}`}
                href={href({ view: "list", day: c.day })}
                key={c.day}
              >
                <strong>{Number(c.day.slice(-2))}</strong>
                {c.approved > 0 && (
                  <span>
                    {c.approved} {d.approved}
                  </span>
                )}
                {c.pending > 0 && (
                  <small>
                    {c.pending} {d.pending}
                  </small>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="card table-card">
          {selectedDay && (
            <div className="card-heading">
              <h2>{dateLabel(selectedDay, locale)}</h2>
              <Link href={href({ day: "" })}>{d.clearDay}</Link>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {!self && <th>{d.employee}</th>}
                  <th>{d.type}</th>
                  <th>{d.period}</th>
                  <th>{d.status}</th>
                  <th>{d.actions}</th>
                </tr>
              </thead>
              <tbody>
                {requests.data.map((r) => {
                  const person = people.data?.find(
                    (e) => e.id === r.employee_id,
                  );
                  const own = person?.user_id === user.id;
                  const approve =
                    writable &&
                    r.status === "pending" &&
                    !own &&
                    (hr ||
                      (membership.role === "manager" &&
                        person?.manager_user_id === user.id));
                  const cancel =
                    writable &&
                    ((hr && ["pending", "approved"].includes(r.status)) ||
                      (own && r.status === "pending"));
                  return (
                    <tr key={r.id}>
                      {!self && (
                        <td>
                          <Link href={`/employees/${r.employee_id}`}>
                            {person
                              ? `${person.first_name} ${person.last_name}`
                              : "—"}
                          </Link>
                        </td>
                      )}
                      <td>
                        {types.data.find((t) => t.id === r.leave_type_id)
                          ?.name ?? "—"}
                      </td>
                      <td>
                        {dateLabel(r.start_date, locale)} —{" "}
                        {dateLabel(r.end_date, locale)}
                        <small className="time-subline">
                          {r.days} {d.days}
                        </small>
                      </td>
                      <td>
                        <TimeStatus status={r.status} locale={locale} />
                        {r.decision_note && (
                          <p className="time-decision-note">
                            {r.decision_note}
                          </p>
                        )}
                      </td>
                      <td>
                        {(approve || cancel) && (
                          <details className="time-review">
                            <summary>{self ? d.cancel : d.decision}</summary>
                            <LeaveDecisionForm
                              key={r.version}
                              request={r}
                              approve={approve}
                              cancel={!!cancel}
                              locale={locale}
                            />
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!requests.data.length && (
              <p className="time-padding muted">{d.noRequests}</p>
            )}
          </div>
          <div className="table-footer">
            <span>
              {requests.count ?? 0} {d.results}
            </span>
            <div className="pagination">
              {page > 1 && (
                <Link href={href({ page: String(page - 1), day: selectedDay })}>
                  {d.previous}
                </Link>
              )}
              <span>
                {d.page} {page}
              </span>
              {page * 25 < (requests.count ?? 0) && (
                <Link href={href({ page: String(page + 1), day: selectedDay })}>
                  {d.next}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
