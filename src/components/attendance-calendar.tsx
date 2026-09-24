import { dateLabel, type Locale } from "@/lib/i18n";
import { monthDays } from "@/lib/time";
import { timeDictionary } from "@/lib/time-i18n";
import type { AttendanceDay } from "@/lib/time-types";

export function AttendanceCalendar({
  rows,
  month,
  startDate,
  locale,
}: {
  rows: AttendanceDay[];
  month: string;
  startDate: string;
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  const language = locale === "ro" ? "ro-RO" : "en-GB";
  const label = new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const weekday = new Intl.DateTimeFormat(language, {
    weekday: "long",
    timeZone: "UTC",
  });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const days = monthDays(month);
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const records = new Map(rows.map((row) => [row.day, row]));
  const weeks = Array.from(
    { length: Math.ceil((offset + days.length) / 7) },
    (_, week) =>
      Array.from(
        { length: 7 },
        (_, weekday) => days[week * 7 + weekday - offset],
      ),
  );
  return (
    <section className="card attendance-calendar-card">
      <div className="card-heading">
        <h2>{label}</h2>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label={`${d.attendance} · ${label}`}
        tabIndex={0}
      >
        <table className="attendance-calendar">
          <caption className="sr-only">
            {d.attendance} · {label}
          </caption>
          <thead>
            <tr>
              {Array.from({ length: 7 }, (_, i) => (
                <th scope="col" key={i}>
                  {weekday.format(new Date(Date.UTC(2024, 0, i + 1)))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={index}>
                {week.map((day, column) => {
                  if (!day)
                    return (
                      <td key={column} className="attendance-calendar-empty" />
                    );
                  const row = records.get(day);
                  const beforeStart = day < startDate;
                  const nonWorking =
                    row && row.planned_hours === 0 && row.worked_hours === null;
                  const category = beforeStart
                    ? d.beforeStart
                    : row
                      ? nonWorking
                        ? d.nonWorking
                        : d[row.category]
                      : d.unrecorded;
                  return (
                    <td
                      key={day}
                      className={
                        row?.leave_request_id
                          ? "attendance-calendar-leave"
                          : undefined
                      }
                    >
                      <time dateTime={day} aria-label={dateLabel(day, locale)}>
                        {Number(day.slice(-2))}
                      </time>
                      <span className="attendance-calendar-category">
                        {category}
                      </span>
                      {!beforeStart && row && (
                        <>
                          <span>
                            {d.worked}:{" "}
                            <strong>
                              {row.worked_hours === null
                                ? "—"
                                : number.format(row.worked_hours)}
                            </strong>
                          </span>
                          <small>
                            {d.planned}: {number.format(row.planned_hours)}
                          </small>
                          {row.leave_request_id && <small>{d.fromLeave}</small>}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
