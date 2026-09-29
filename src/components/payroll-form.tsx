"use client";
import { useActionState, useRef, useState } from "react";
import {
  calculatePayroll,
  floorExceptions,
  type PayrollInput,
  type PayrollResult,
} from "@/lib/payroll";
import {
  payrollDictionary,
  payrollRows,
  floorExceptionLabels,
} from "@/lib/payroll-i18n";
import { savePayrollEntry } from "@/app/(workspace)/payroll/actions";
import { payrollRunDictionary } from "@/lib/payroll-run-i18n";
import { moneyLabel, type Locale } from "@/lib/i18n";
export function PayrollForm({
  employeeId,
  basic,
  hours,
  locale,
  runId,
  runVersion,
  month,
  savedInput,
}: {
  employeeId: string;
  basic?: number;
  hours?: number;
  locale: Locale;
  runId: string;
  runVersion: number;
  month: string;
  savedInput?: PayrollInput;
}) {
  const [state, submit, pending] = useActionState(savePayrollEntry, {}),
    [result, setResult] = useState<PayrollResult | null>(null),
    [error, setError] = useState(false),
    form = useRef<HTMLFormElement>(null),
    d = payrollDictionary(locale),
    rd = payrollRunDictionary(locale);
  const value = (key: keyof PayrollInput, fallback: string | number = "") =>
    state.values?.[key] ?? savedInput?.[key] ?? fallback;
  function calculate() {
    if (!form.current?.reportValidity()) return;
    try {
      setResult(
        calculatePayroll(Object.fromEntries(new FormData(form.current!))),
      );
      setError(false);
    } catch {
      setResult(null);
      setError(true);
    }
  }
  return (
    <form
      ref={form}
      action={submit}
      onChange={() => {
        setResult(null);
        setError(false);
      }}
      className="form-stack"
      onSubmit={(event) => {
        if (!result) event.preventDefault();
      }}
    >
      <input name="employee_id" type="hidden" value={employeeId} />
      <input name="run_id" type="hidden" value={runId} />
      <input name="run_version" type="hidden" value={runVersion} />
      {(state.error || error) && (
        <p className="notice error" role="alert">
          {error ? d.invalid : state.error}
        </p>
      )}
      {state.success && (
        <p className="notice success" role="status">
          {state.success}
        </p>
      )}
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <div className="form-grid">
          <label className="field">
            <span>{d.month}</span>
            <input
              name="month"
              type="month"
              min="2026-01"
              max="2026-12"
              required
              value={month}
              readOnly
            />
          </label>
          <label className="field">
            <span>{d.hours}</span>
            <input
              name="hours"
              type="number"
              min="0.01"
              max="8"
              step="0.01"
              required
              defaultValue={value("hours", hours ?? 8)}
            />
          </label>
          {(["basic", "bonus", "meals", "advance"] as const).map((k) => (
            <label className="field" key={k}>
              <span>{d[k]}</span>
              <input
                name={k}
                type="number"
                step="0.01"
                min={k === "basic" ? 0.01 : 0}
                max="1000000"
                required
                defaultValue={value(k, k === "basic" ? (basic ?? "") : 0)}
              />
            </label>
          ))}
          <label className="field">
            <span>{d.floorException}</span>
            <select
              name="floorException"
              defaultValue={value("floorException", "none")}
            >
              {floorExceptions.map((key) => (
                <option value={key} key={key}>
                  {floorExceptionLabels(locale)[key]}
                </option>
              ))}
            </select>
          </label>
          {(["evidence", "mealsReference", "advanceReference"] as const).map(
            (key) => (
              <label className="field" key={key}>
                <span>{d[key]}</span>
                <input name={key} maxLength={120} defaultValue={value(key)} />
              </label>
            ),
          )}
          {(["primary", "young", "reduced"] as const).map((k) => (
            <label className="field" key={k}>
              <span>{d[k]}</span>
              <select name={k} defaultValue={value(k)} required>
                <option value="">—</option>
                <option value="yes">{d.yes}</option>
                <option value="no">{d.no}</option>
              </select>
            </label>
          ))}
          {(["dependants", "children"] as const).map((k) => (
            <label className="field" key={k}>
              <span>{d[k]}</span>
              <input
                type="number"
                name={k}
                min="0"
                max={k === "dependants" ? 4 : 20}
                step="1"
                required
                defaultValue={value(k, 0)}
              />
            </label>
          ))}
        </div>
        <p className="time-help">{d.scope}</p>
        <p className="time-help">{rd.hoursScope}</p>
        <p className="time-help">{d.floorHelp}</p>
        <p className="time-help">{d.referencesHelp}</p>
        <label className="benefit-confirm">
          <input type="checkbox" name="benefits_reviewed" required />
          {d.benefitsReview}
        </label>
        <label className="benefit-confirm">
          <input type="checkbox" name="standard" required />
          {d.standard}
        </label>
        <button type="button" className="button secondary" onClick={calculate}>
          {d.calculate}
        </button>
        {result && (
          <section className="card table-card">
            <div className="card-heading">
              <h2>{d.preview}</h2>
            </div>
            <table>
              <tbody>
                {payrollRows.map((k) => (
                  <tr key={k}>
                    <th>{d[k]}</th>
                    <td>
                      <strong>{moneyLabel(result[k], locale)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="time-padding time-help">
              {d.rules}: {result.rules}. {d.footer}
            </p>
          </section>
        )}
        <p className="time-help">{rd.savedHelp}</p>
        <p className="time-help">{rd.sourceHelp}</p>
        <button className="button primary" disabled={!result || pending}>
          {rd.save}
          {pending ? "…" : ""}
        </button>
      </fieldset>
    </form>
  );
}
