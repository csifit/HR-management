"use client";

import { useActionState } from "react";
import {
  createPayrollRun,
  removePayrollEntry,
  approvePayrollRun,
  discardPayrollRun,
  generateApprovedPayslip,
} from "@/app/(workspace)/payroll/actions";
import { payrollRunDictionary } from "@/lib/payroll-run-i18n";
import type { PayrollRun } from "@/lib/payroll-run-types";
import type { Locale } from "@/lib/i18n";
import type { ActionState } from "@/lib/types";

function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="notice success" role="status">
          {state.success}
        </p>
      )}
    </>
  );
}

function RunFields({ run }: { run: PayrollRun }) {
  return (
    <>
      <input type="hidden" name="run_id" value={run.id} />
      <input type="hidden" name="run_version" value={run.version} />
    </>
  );
}

export function PayrollRunCreateForm({
  locale,
  month,
  previous,
}: {
  locale: Locale;
  month: string;
  previous?: string;
}) {
  const d = payrollRunDictionary(locale),
    [state, action, pending] = useActionState(createPayrollRun, {});
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        {previous && <input name="previous" type="hidden" value={previous} />}
        <label className="field time-field">
          <span>{d.month}</span>
          <input
            type="month"
            name="month"
            min="2026-01"
            max="2026-12"
            required
            defaultValue={state.values?.month ?? month}
            readOnly={!!previous}
          />
        </label>
        {previous && (
          <>
            <p className="time-help">{d.correctionHelp}</p>
            <label className="field">
              <span>{d.reason}</span>
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={1000}
                rows={3}
                defaultValue={state.values?.reason ?? ""}
              />
            </label>
          </>
        )}
        <button className="button primary">
          {pending ? d.busy : previous ? d.correction : d.newRun}
        </button>
      </fieldset>
    </form>
  );
}

export function PayrollRunApproveForm({
  locale,
  run,
  eligible,
}: {
  locale: Locale;
  run: PayrollRun;
  eligible: boolean;
}) {
  const d = payrollRunDictionary(locale),
    [state, action, pending] = useActionState(approvePayrollRun, {});
  return (
    <form action={action} className="form-stack">
      <RunFields run={run} />
      <Feedback state={state} />
      <fieldset
        disabled={pending || !eligible}
        className="time-fieldset form-stack"
      >
        <label className="benefit-confirm">
          <input type="checkbox" name="confirm" required />
          {d.approveConfirm}
        </label>
        <button className="button primary">
          {pending ? d.busy : d.approve}
        </button>
      </fieldset>
    </form>
  );
}

export function PayrollRunDiscardForm({
  locale,
  run,
}: {
  locale: Locale;
  run: PayrollRun;
}) {
  const d = payrollRunDictionary(locale),
    [state, action, pending] = useActionState(discardPayrollRun, {});
  return (
    <form action={action} className="form-stack time-form">
      <RunFields run={run} />
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <p className="time-help">{d.discardHelp}</p>
        <label className="field">
          <span>{d.reason}</span>
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            rows={3}
            defaultValue={state.values?.reason ?? ""}
          />
        </label>
        <button className="button secondary">
          {pending ? d.busy : d.discard}
        </button>
      </fieldset>
    </form>
  );
}

export function PayrollEntryRemoveForm({
  locale,
  run,
  itemId,
}: {
  locale: Locale;
  run: PayrollRun;
  itemId: string;
}) {
  const d = payrollRunDictionary(locale),
    [state, action, pending] = useActionState(removePayrollEntry, {});
  return (
    <form action={action} className="form-stack">
      <RunFields run={run} />
      <input type="hidden" name="item_id" value={itemId} />
      <Feedback state={state} />
      <button className="button secondary" disabled={pending}>
        {pending ? d.busy : d.remove}
      </button>
    </form>
  );
}

export function PayrollApprovedPdfForm({
  locale,
  runId,
  itemId,
}: {
  locale: Locale;
  runId: string;
  itemId: string;
}) {
  const d = payrollRunDictionary(locale),
    [state, action, pending] = useActionState(generateApprovedPayslip, {});
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="item_id" value={itemId} />
      <Feedback state={state} />
      <button className="button secondary" disabled={pending}>
        {pending ? d.busy : d.document}
      </button>
    </form>
  );
}
