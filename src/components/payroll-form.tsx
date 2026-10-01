"use client";
import { useActionState, useRef, useState } from "react";
import {
  floorExceptions,
  type PayrollInput,
  type PayrollResult,
} from "@/lib/payroll";
import {
  calculatePayrollRun,
  payrollRunInputSchema,
  PartialPayrollReliefReview,
  type PayrollPeriodContext,
} from "@/lib/payroll-period";
import {
  payrollPeriodDictionary,
  payrollPeriodLines,
} from "@/lib/payroll-period-i18n";
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
  periodContext,
}: {
  employeeId: string;
  basic?: number;
  hours?: number;
  locale: Locale;
  runId: string;
  runVersion: number;
  month: string;
  savedInput?: PayrollInput;
  periodContext: PayrollPeriodContext;
}) {
  const [state, submit, pending] = useActionState(savePayrollEntry, {}),
    [result, setResult] = useState<PayrollResult | null>(null),
    [previewInput, setPreviewInput] = useState<PayrollInput | null>(null),
    [error, setError] = useState(""),
    form = useRef<HTMLFormElement>(null),
    d = payrollDictionary(locale),
    rd = payrollRunDictionary(locale),
    periodD = payrollPeriodDictionary(locale);
  const value = (
    key: Exclude<keyof PayrollInput, "period">,
    fallback: string | number = "",
  ) => state.values?.[key] ?? savedInput?.[key] ?? fallback;
  function calculate() {
    if (!form.current?.reportValidity()) return;
    try {
      const input = payrollRunInputSchema.parse({
        ...Object.fromEntries(new FormData(form.current)),
        period: periodContext.period,
      });
      setResult(calculatePayrollRun(input));
      setPreviewInput(input);
      setError("");
    } catch (error) {
      setResult(null);
      setError(
        error instanceof PartialPayrollReliefReview
          ? periodD.reliefReview
          : d.invalid,
      );
    }
  }
  return (
    <form
      ref={form}
      action={submit}
      onChange={() => {
        setResult(null);
        setError("");
      }}
      className="form-stack"
      onSubmit={(event) => {
        if (!result) event.preventDefault();
      }}
    >
      <input name="employee_id" type="hidden" value={employeeId} />
      <input name="run_id" type="hidden" value={runId} />
      <input name="run_version" type="hidden" value={runVersion} />
      <input
        name="period"
        type="hidden"
        value={JSON.stringify(periodContext.period)}
      />
      {(state.error || error) && (
        <p className="notice error" role="alert">
          {error || state.error}
        </p>
      )}
      {state.success && (
        <p className="notice success" role="status">
          {state.success}
        </p>
      )}
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <section className="notice">
          <h3>{periodD.title}</h3>
          <p>
            {periodD.start}: {periodContext.period.start} · {periodD.end}:{" "}
            {periodContext.period.end}
          </p>
          <p>
            {periodD.paidDays}: {periodContext.period.employedWorkingDays} /{" "}
            {periodContext.period.monthWorkingDays}
          </p>
          <p>{periodD.help}</p>
        </section>
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
              value={hours ?? periodContext.hours}
              readOnly
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
                {...(k === "basic"
                  ? { value: basic ?? periodContext.basic, readOnly: true }
                  : { defaultValue: value(k, 0) })}
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
          <label className="field">
            <span>{periodD.deductionEmployer}</span>
            <select
              name="deductionEmployer"
              required
              defaultValue={value("deductionEmployer", "")}
            >
              <option value="">—</option>
              <option value="this">{periodD.thisEmployer}</option>
              <option value="other">{periodD.otherEmployer}</option>
            </select>
          </label>
          <label className="field">
            <span>{periodD.deductionReference}</span>
            <input
              name="deductionReference"
              maxLength={120}
              defaultValue={value("deductionReference")}
            />
          </label>
        </div>
        <p className="time-help">{periodD.scope}</p>
        <p className="time-help">{periodD.deductionHelp}</p>
        <p className="time-help">{rd.hoursScope}</p>
        <p className="time-help">{d.floorHelp}</p>
        <p className="time-help">{d.referencesHelp}</p>
        <label className="benefit-confirm">
          <input type="checkbox" name="benefits_reviewed" required />
          {d.benefitsReview}
        </label>
        <label className="benefit-confirm">
          <input type="checkbox" name="period_reviewed" required />
          {periodD.calendarConfirm}
        </label>
        <label className="benefit-confirm">
          <input type="checkbox" name="standard" required />
          {periodD.standard}
        </label>
        <button type="button" className="button secondary" onClick={calculate}>
          {d.calculate}
        </button>
        {result && (
          <section className="card table-card">
            <div className="card-heading">
              <h2>{d.preview}</h2>
            </div>
            {previewInput && (
              <div className="time-padding">
                {payrollPeriodLines(previewInput, locale).map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            )}
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
