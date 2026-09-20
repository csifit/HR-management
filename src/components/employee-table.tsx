import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Avatar, StatusBadge } from "./ui";
import { dictionary, dateLabel, type Locale } from "@/lib/i18n";
import type { Employee, DirectoryDetail } from "@/lib/types";
export function EmployeeTable({
  employees,
  locale,
  compact = false,
  details = [],
}: {
  employees: Employee[];
  locale: Locale;
  compact?: boolean;
  details?: DirectoryDetail[];
}) {
  const d = dictionary(locale);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{d.employee}</th>
            <th>{d.department}</th>
            <th>{d.status}</th>
            {!compact && (
              <>
                <th>{d.startDate}</th>
                <th>{d.manager}</th>
                <th>{d.contractType}</th>
              </>
            )}
            <th>
              <span className="sr-only">{d.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const detail = details.find((row) => row.employee_id === e.id);
            return (
              <tr key={e.id}>
                <td>
                  <Link className="employee-cell" href={`/employees/${e.id}`}>
                    <Avatar name={`${e.first_name} ${e.last_name}`} />
                    <div>
                      <strong>
                        {e.first_name} {e.last_name}
                      </strong>
                      <small>{e.job_title}</small>
                    </div>
                  </Link>
                </td>
                <td>{e.department}</td>
                <td>
                  <StatusBadge value={e.status} d={d} />
                </td>
                {!compact && (
                  <>
                    <td>{dateLabel(e.start_date, locale)}</td>
                    <td>{detail?.manager_name ?? "—"}</td>
                    <td>
                      {detail?.contract_type ? d[detail.contract_type] : "—"}
                    </td>
                  </>
                )}
                <td>
                  <Link
                    className="icon-button table-arrow"
                    href={`/employees/${e.id}`}
                    aria-label={`${d.view}: ${e.first_name} ${e.last_name}`}
                  >
                    <ArrowUpRight size={18} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
