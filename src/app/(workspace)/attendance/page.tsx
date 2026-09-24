import Link from "next/link";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage } from "@/lib/types";
import { dateLabel } from "@/lib/i18n";
import { timeDictionary } from "@/lib/time-i18n";
import { employeeDictionary } from "@/lib/employee-i18n";
import { scheduleDictionary } from "@/lib/schedule-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam, monthParam, attendanceTotals } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { AttendanceCalendar } from "@/components/attendance-calendar";
export default async function AttendancePage({
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
  const month = monthParam(singleParam(q.month));
  const { options, employee, hasMore } = await timeEmployees(
    self ? "" : singleParam(q.employee),
    self ? "" : singleParam(q.q),
    self,
  );
  const result = employee
    ? await supabase.rpc("attendance_month", {
        p_org: organisation.id,
        p_employee: employee.id,
        p_month: `${month}-01`,
      })
    : { data: [], error: null };
  if (result.error) throw new Error("Attendance could not be loaded.");
  const rows = result.data ?? [];
  const totals = attendanceTotals(rows);
  const writable =
    organisation.status === "active" &&
    (canManage(membership.role) ||
      (membership.role === "manager" && employee?.manager_user_id === user.id));
  return (
    <>
      <PageHeader
        title={self ? ed.attendance : d.attendance}
        description={self ? ed.attendanceIntro : d.attendanceIntro}
      >
        {canManage(membership.role) && (
          <Link className="button secondary" href="/attendance/settings">
            {scheduleDictionary(locale).title}
          </Link>
        )}
      </PageHeader>
      <form className="time-filters" action="/attendance">
        {!self && (
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
        {!self && (
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
            min="2000-01"
            max="2200-12"
            required
            defaultValue={month}
          />
        </label>
        <button className="button secondary">{d.filter}</button>
      </form>
      {!self && q.saved === "1" && (
        <p className="notice success" role="status">
          {d.saved}
        </p>
      )}
      {hasMore && <p className="time-help">{d.searchHint}</p>}
      <p className="notice">{self ? ed.attendanceHelp : d.attendanceHelp}</p>
      {employee ? (
        <>
          <div className="attendance-totals">
            {(
              [
                [d.workingDays, totals.working],
                [d.workedDays, totals.worked],
                [d.totalHours, totals.hours.toFixed(2)],
                [d.annual, totals.annual],
                [d.medical, totals.medical],
                [d.unpaid, totals.unpaid],
                [d.other, totals.other],
                [d.missing, totals.missing],
              ] as const
            ).map(([label, value]) => (
              <div className="card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {self ? (
            <AttendanceCalendar
              rows={rows}
              month={month}
              startDate={employee.start_date}
              locale={locale}
            />
          ) : (
            <section className="card table-card">
              <div className="card-heading">
                <h2>
                  {employee.first_name} {employee.last_name} · {month}
                </h2>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{d.day}</th>
                      <th>{d.planned}</th>
                      <th>{d.worked}</th>
                      <th>{d.category}</th>
                      <th>{d.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.day}>
                        <td>{dateLabel(row.day, locale)}</td>
                        <td>{row.planned_hours}</td>
                        <td>{row.worked_hours ?? "—"}</td>
                        <td>
                          {row.day < employee.start_date
                            ? d.beforeStart
                            : d[row.category]}
                          {row.leave_request_id && (
                            <small className="time-subline">
                              {d.fromLeave}
                            </small>
                          )}
                        </td>
                        <td>
                          {row.leave_request_id ? (
                            <Link
                              href={`/leave?employee=${employee.id}&month=${month}&day=${row.day}`}
                            >
                              {d.linkedLeave}
                            </Link>
                          ) : writable && row.day >= employee.start_date ? (
                            <Link
                              href={`/attendance/edit?employee=${employee.id}&day=${row.day}`}
                            >
                              {d.edit}
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="card time-padding">
          <p>
            {options.length
              ? d.chooseEmployee
              : membership.role === "employee"
                ? d.noAccount
                : d.noEmployees}
          </p>
        </div>
      )}
    </>
  );
}
