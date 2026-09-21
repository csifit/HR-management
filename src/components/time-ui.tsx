import type { Locale } from "@/lib/i18n";
import { timeDictionary } from "@/lib/time-i18n";
import type {
  BalanceSummary,
  EmployeeOption,
  LeaveStatus,
} from "@/lib/time-types";
export function TimeStatus({
  status,
  locale,
}: {
  status: LeaveStatus;
  locale: Locale;
}) {
  return (
    <span className={`time-status time-${status}`}>
      {timeDictionary(locale)[status]}
    </span>
  );
}
export function EmployeeFilter({
  employees,
  selected,
  locale,
  empty = true,
}: {
  employees: EmployeeOption[];
  selected?: string;
  locale: Locale;
  empty?: boolean;
}) {
  const d = timeDictionary(locale);
  return (
    <label className="field time-field">
      <span>{d.employee}</span>
      <select name="employee" defaultValue={selected ?? ""}>
        <option value="">{empty ? d.allEmployees : d.chooseEmployee}</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.first_name} {e.last_name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function BalanceTable({
  balances,
  locale,
}: {
  balances: BalanceSummary[];
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {[
              d.type,
              d.allowance,
              d.used,
              d.pending,
              d.remaining,
              d.available,
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.leave_type_id}>
              <td>{b.name}</td>
              <td>{b.allowance ?? d.notSet}</td>
              <td>{b.used}</td>
              <td>{b.pending}</td>
              <td>{b.remaining ?? "—"}</td>
              <td>
                <strong>{b.available ?? "—"}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!balances.length && <p className="time-padding muted">{d.noBalances}</p>}
    </div>
  );
}
