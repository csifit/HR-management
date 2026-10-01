"use client";
import { useActionState, useRef, useState } from "react";
import {
  floorExceptions,
  type PayrollInput,
  type PayrollResult,
} from "@/lib/payroll";
import {
  PartialPayrollReliefReview,
  type PayrollPeriodContext,
} from "@/lib/payroll-period";
import { payrollSettlementFromForm } from "@/lib/payroll-settlement";
import { payrollAnnualFromForm } from "@/lib/payroll-annual-leave";
import {
  calculatePayrollAdjusted,
  payrollWithUnpaidSchema,
  payrollUnpaidFromForm,
  UnpaidPayrollReview,
} from "@/lib/payroll-unpaid";
import {
  payrollUnpaidDictionary,
  payrollUnpaidLines,
} from "@/lib/payroll-unpaid-i18n";
import {
  payrollAnnualDictionary,
  payrollAnnualLines,
} from "@/lib/payroll-annual-i18n";
import {
  payrollSettlementDictionary,
  payrollSettlementLines,
} from "@/lib/payroll-settlement-i18n";
import {
  payrollPeriodDictionary,
  payrollPeriodLines,
} from "@/lib/payroll-period-i18n";
import { payrollDictionary, floorExceptionLabels } from "@/lib/payroll-i18n";
import { savePayrollEntry } from "@/app/(workspace)/payroll/actions";
import { payrollRunDictionary } from "@/lib/payroll-run-i18n";
import { workflowDictionary } from "@/lib/workflow-i18n";
import { PayrollFigures } from "@/components/payroll-figures";
import type { Locale } from "@/lib/i18n";

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
  const unpaidDates = [
    ...(periodContext.unpaid?.requests.flatMap((r) => r.dates) ?? []),
    ...(periodContext.unpaid?.absences ?? []),
  ].sort();
  const [suspendedCount, setSuspendedCount] = useState(
    unpaidDates.filter((d) => savedInput?.unpaid?.suspendedDates.includes(d))
      .length,
  );
  const [state, submit, pending] = useActionState(savePayrollEntry, {}),
    [result, setResult] = useState<PayrollResult | null>(null),
    [previewInput, setPreviewInput] = useState<PayrollInput | null>(null),
    [includeSettlement, setIncludeSettlement] = useState(
      !!savedInput?.settlement && !!periodContext.settlement_allowed,
    ),
    [error, setError] = useState(""),
    form = useRef<HTMLFormElement>(null),
    d = payrollDictionary(locale),
    rd = payrollRunDictionary(locale),
    periodD = payrollPeriodDictionary(locale),
    sd = payrollSettlementDictionary(locale),
    ad = payrollAnnualDictionary(locale),
    ud = payrollUnpaidDictionary(locale),
    wd = workflowDictionary(locale);
  const value = (
    key: Exclude<
      keyof PayrollInput,
      "period" | "settlement" | "annualLeave" | "unpaid"
    >,
    fallback: string | number = "",
  ) => state.values?.[key] ?? savedInput?.[key] ?? fallback;
  function calculate() {
    if (!form.current?.reportValidity()) return;
    try {
      const values = Object.fromEntries(new FormData(form.current));
      const input = payrollWithUnpaidSchema.parse({
        ...values,
        period: periodContext.period,
        settlement: payrollSettlementFromForm(values),
        annualLeave: payrollAnnualFromForm(values),
        unpaid: payrollUnpaidFromForm(values),
      });
      setResult(calculatePayrollAdjusted(input));
      setPreviewInput(input);
      setError("");
    } catch (error) {
      setResult(null);
      setError(
        error instanceof UnpaidPayrollReview
          ? ud.needsReview
          : error instanceof PartialPayrollReliefReview
            ? periodD.reliefReview
            : d.invalid,
      );
    }
  }
  const reference = (
    key: "mealsReference" | "advanceReference" | "evidence",
  ) => (
    <label className="field">
      <span>{d[key]}</span>
      <input name={key} maxLength={120} defaultValue={value(key)} />
    </label>
  );
  const amount = (key: "bonus" | "meals" | "advance") => (
    <label className="field">
      <span>{d[key]}</span>
      <input
        name={key}
        type="number"
        step="0.01"
        min="0"
        max="1000000"
        required
        defaultValue={value(key, 0)}
      />
    </label>
  );
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
      {periodContext.annual_leave && (
        <input
          name="annualRequests"
          type="hidden"
          value={JSON.stringify(periodContext.annual_leave.requests)}
        />
      )}
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
      {savedInput?.settlement && !periodContext.settlement_allowed && (
        <p className="notice error" role="alert">
          {sd.unavailable}
        </p>
      )}
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <section className="workflow-section">
          <h3>{wd.contractFacts}</h3>
          <dl className="workflow-facts">
            <div>
              <dt>{periodD.start}</dt>
              <dd>{periodContext.period.start}</dd>
            </div>
            <div>
              <dt>{periodD.end}</dt>
              <dd>{periodContext.period.end}</dd>
            </div>
            <div>
              <dt>{periodD.paidDays}</dt>
              <dd>
                {periodContext.period.employedWorkingDays} /{" "}
                {periodContext.period.monthWorkingDays}
              </dd>
            </div>
          </dl>
          <div className="form-grid">
            <label className="field">
              <span>{d.month}</span>
              <input
                name="month"
                type="month"
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
                step="0.01"
                required
                value={hours ?? periodContext.hours}
                readOnly
              />
            </label>
            <label className="field">
              <span>{d.basic}</span>
              <input
                name="basic"
                type="number"
                step="0.01"
                required
                value={basic ?? periodContext.basic}
                readOnly
              />
            </label>
          </div>
        </section>
        <section className="workflow-section">
          <h3>{wd.earnings}</h3>
          <div className="form-grid">
            {amount("bonus")}
            <div />
            {amount("meals")}
            {reference("mealsReference")}
            {amount("advance")}
            {reference("advanceReference")}
          </div>
        </section>
        <section className="workflow-section">
          <h3>{wd.deductions}</h3>
          <div className="form-grid">
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
            {reference("evidence")}
            <label className="field">
              <span>{periodD.deductionEmployer}</span>
              <select
                name="deductionEmployer"
                required
                defaultValue={value("deductionEmployer")}
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
        </section>
        {periodContext.annual_leave && (
          <section className="workflow-section">
            <h3>{ad.title}</h3>
            <p className="time-help">{ad.help}</p>
            {periodContext.annual_leave.requests.map((r, i) => {
              const saved = savedInput?.annualLeave?.requests.find(
                (s) => s.id === r.id,
              );
              return (
                <div className="workflow-section" key={r.id}>
                  <p className="time-help">
                    {ad.days}: {r.dates.length} · {r.dates.join(", ")}
                  </p>
                  <div className="form-grid">
                    <label className="field">
                      <span>{ad.dailyGross}</span>
                      <input
                        name={`annualRate${i}`}
                        type="number"
                        min="0.01"
                        max="1000000"
                        step="0.01"
                        required
                        defaultValue={
                          state.values?.[`annualRate${i}`] ??
                          saved?.dailyGross ??
                          ""
                        }
                      />
                    </label>
                    <label className="field">
                      <span>{ad.rateReference}</span>
                      <input
                        name={`annualReference${i}`}
                        minLength={3}
                        maxLength={120}
                        required
                        defaultValue={
                          state.values?.[`annualReference${i}`] ??
                          saved?.rateReference ??
                          ""
                        }
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <label className="benefit-confirm">
              <input name="annualConfirmed" type="checkbox" required />
              {periodContext.unpaid ? ud.annualConfirm : ad.confirm}
            </label>
          </section>
        )}
        {periodContext.unpaid && (
          <section className="workflow-section">
            <input
              type="hidden"
              name="unpaidFacts"
              value={JSON.stringify(periodContext.unpaid)}
            />
            <h3>{ud.title}</h3>
            <p className="time-help">{ud.help}</p>
            {periodContext.unpaid.requests.map((r) => (
              <p className="time-help" key={r.id}>
                {ud.leave}: {r.dates.join(", ")}
              </p>
            ))}
            {!!periodContext.unpaid.absences.length && (
              <p className="time-help">
                {ud.absences}: {periodContext.unpaid.absences.join(", ")}
              </p>
            )}
            <fieldset className="workflow-section">
              <legend>{ud.suspended}</legend>
              <div className="form-grid">
                {unpaidDates.map((date, i) => (
                  <label className="benefit-confirm" key={date}>
                    <input
                      type="checkbox"
                      name={`unpaidSuspended${i}`}
                      defaultChecked={
                        !!savedInput?.unpaid?.suspendedDates.includes(date)
                      }
                      onChange={() =>
                        setSuspendedCount(
                          form.current?.querySelectorAll(
                            'input[name^="unpaidSuspended"]:checked',
                          ).length ?? 0,
                        )
                      }
                    />
                    {date}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-grid">
              <label className="field">
                <span>{ud.reviewReference}</span>
                <input
                  name="unpaidReference"
                  required
                  minLength={3}
                  maxLength={120}
                  defaultValue={
                    state.values?.unpaidReference ??
                    savedInput?.unpaid?.reviewReference ??
                    ""
                  }
                />
              </label>
              <label className="field">
                <span>{ud.suspensionReference}</span>
                <input
                  name="suspensionReference"
                  disabled={suspendedCount === 0}
                  required={suspendedCount > 0}
                  minLength={3}
                  maxLength={120}
                  defaultValue={
                    state.values?.suspensionReference ??
                    savedInput?.unpaid?.suspensionReference ??
                    ""
                  }
                />
              </label>
            </div>
            <label className="benefit-confirm">
              <input name="unpaidConfirmed" type="checkbox" required />
              {ud.confirm}
            </label>
          </section>
        )}
        {periodContext.settlement_allowed && (
          <section className="workflow-section">
            <h3>{sd.title}</h3>
            <label className="benefit-confirm">
              <input
                type="checkbox"
                name="includeSettlement"
                checked={includeSettlement}
                onChange={(e) => setIncludeSettlement(e.target.checked)}
              />
              {sd.include}
            </label>
            {includeSettlement && (
              <>
                <p className="time-help">{sd.help}</p>
                <div className="form-grid">
                  {(
                    [
                      ["days", "settlementDays"],
                      ["dailyGross", "settlementDailyGross"],
                      ["balanceReference", "settlementBalanceReference"],
                      ["rateReference", "settlementRateReference"],
                      ["otherGross", "settlementOtherGross"],
                      ["otherReference", "settlementOtherReference"],
                    ] as const
                  ).map(([key, name]) => {
                    const numeric =
                      key === "days" ||
                      key === "dailyGross" ||
                      key === "otherGross";
                    return (
                      <label className="field" key={key}>
                        <span>{sd[key]}</span>
                        <input
                          name={name}
                          type={numeric ? "number" : "text"}
                          {...(numeric
                            ? {
                                min: 0,
                                max: key === "days" ? 365 : 1000000,
                                step: "0.01",
                                required: true,
                              }
                            : { maxLength: 120 })}
                          defaultValue={
                            state.values?.[name] ??
                            savedInput?.settlement?.[key] ??
                            (numeric ? 0 : "")
                          }
                        />
                      </label>
                    );
                  })}
                </div>
                <label className="benefit-confirm">
                  <input name="settlementConfirmed" type="checkbox" required />
                  {sd.confirm}
                </label>
              </>
            )}
          </section>
        )}
        <details className="workflow-details">
          <summary>{wd.guidance}</summary>
          <div className="workflow-guidance">
            <p>
              {periodContext.unpaid
                ? ud.help
                : periodContext.annual_leave
                  ? ad.help
                  : periodD.help}
            </p>
            {includeSettlement ? (
              <p>{sd.help}</p>
            ) : (
              !periodContext.annual_leave &&
              !periodContext.unpaid && <p>{periodD.scope}</p>
            )}
            <p>{periodD.deductionHelp}</p>
            <p>{rd.hoursScope}</p>
            <p>{d.floorHelp}</p>
            <p>{d.referencesHelp}</p>
          </div>
        </details>
        <section className="workflow-section">
          <h3>{wd.review}</h3>
          <label className="benefit-confirm">
            <input type="checkbox" name="benefits_reviewed" required />
            {d.benefitsReview}
          </label>
          <label className="benefit-confirm">
            <input
              key={`period-${includeSettlement}`}
              type="checkbox"
              name="period_reviewed"
              required
            />
            {periodContext.unpaid
              ? ud.calendarConfirm
              : periodContext.annual_leave
                ? ad.calendarConfirm
                : includeSettlement
                  ? sd.calendarConfirm
                  : periodD.calendarConfirm}
          </label>
          <label className="benefit-confirm">
            <input
              key={`standard-${includeSettlement}`}
              type="checkbox"
              name="standard"
              required
            />
            {periodContext.unpaid
              ? ud.standard
              : periodContext.annual_leave
                ? ad.standard
                : includeSettlement
                  ? sd.standard
                  : periodD.standard}
          </label>
        </section>
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
                {[
                  ...payrollPeriodLines(previewInput, locale, result),
                  ...payrollSettlementLines(previewInput, result, locale),
                  ...payrollAnnualLines(previewInput, result, locale),
                  ...payrollUnpaidLines(previewInput, result, locale),
                ].map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            )}
            <PayrollFigures result={result} locale={locale} />
            <p className="time-padding time-help">
              {d.rules}: {result.rules}. {d.footer}
            </p>
          </section>
        )}
        <p className="time-help" role="status">
          {result ? wd.afterPreview : wd.beforePreview}
        </p>
        <details className="workflow-details">
          <summary>{rd.savedHelp}</summary>
          <p className="workflow-guidance">{rd.sourceHelp}</p>
        </details>
        <button className="button primary" disabled={!result || pending}>
          {rd.save}
          {pending ? "…" : ""}
        </button>
      </fieldset>
    </form>
  );
}
