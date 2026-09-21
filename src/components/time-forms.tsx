"use client";
import { useActionState, useState } from "react";
import {
  submitLeave,
  reviewLeave,
  updateLeaveType,
  updateAllowance,
  updateCalendarDay,
  updateAttendance,
} from "@/app/(workspace)/leave/actions";
import type { ActionState } from "@/lib/types";
import type {
  AttendanceDay,
  BalanceSummary,
  CalendarDay,
  EmployeeOption,
  LeaveRequest,
  LeaveType,
} from "@/lib/time-types";
import type { Locale } from "@/lib/i18n";
import { timeDictionary } from "@/lib/time-i18n";

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
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field time-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Save({
  pending,
  locale,
  label,
}: {
  pending: boolean;
  locale: Locale;
  label?: string;
}) {
  const d = timeDictionary(locale);
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? d.saving : (label ?? d.save)}
    </button>
  );
}
export function LeaveRequestForm({
  employees,
  types,
  locale,
  selected,
}: {
  employees: EmployeeOption[];
  types: LeaveType[];
  locale: Locale;
  selected?: string;
}) {
  const d = timeDictionary(locale);
  const [state, action, pending] = useActionState(submitLeave, {});
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <Field label={d.employee}>
          <select
            name="employee_id"
            required
            defaultValue={state.values?.employee_id ?? selected ?? ""}
          >
            <option value="" disabled>
              {d.chooseEmployee}
            </option>
            {employees.map((e) => (
              <option value={e.id} key={e.id}>
                {e.first_name} {e.last_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={d.type}>
          <select
            name="leave_type_id"
            required
            defaultValue={state.values?.leave_type_id ?? ""}
          >
            <option value="" disabled>
              —
            </option>
            {types
              .filter((t) => t.active)
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label={d.start}>
            <input
              type="date"
              name="start_date"
              required
              min="2000-01-01"
              max="2200-12-31"
              defaultValue={state.values?.start_date}
              aria-invalid={!!state.fields?.start_date}
            />
          </Field>
          <Field label={d.end}>
            <input
              type="date"
              name="end_date"
              required
              min="2000-01-01"
              max="2200-12-31"
              defaultValue={state.values?.end_date}
              aria-invalid={!!state.fields?.end_date}
            />
          </Field>
        </div>
        <p className="form-help">{d.requestHelp}</p>
        <Save pending={pending} locale={locale} label={d.request} />
      </fieldset>
    </form>
  );
}
export function LeaveDecisionForm({
  request,
  approve,
  cancel,
  locale,
}: {
  request: LeaveRequest;
  approve: boolean;
  cancel: boolean;
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  const [state, action, pending] = useActionState(reviewLeave, {});
  const [decision, setDecision] = useState(approve ? "approved" : "cancelled");
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <input type="hidden" name="id" value={request.id} />
        <input type="hidden" name="version" value={request.version} />
        <Field label={d.decision}>
          <select
            name="status"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            {approve && (
              <>
                <option value="approved">{d.approve}</option>
                <option value="rejected">{d.reject}</option>
              </>
            )}
            {cancel && <option value="cancelled">{d.cancel}</option>}
          </select>
        </Field>
        <Field label={d.reason}>
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            minLength={decision === "approved" ? 0 : 5}
            required={decision !== "approved"}
            defaultValue={state.values?.note}
          />
        </Field>
        <small className="muted">{d.reasonHelp}</small>
        <Save pending={pending} locale={locale} label={d.confirm} />
      </fieldset>
    </form>
  );
}
export function AllowanceForm({
  employeeId,
  balance,
  year,
  locale,
}: {
  employeeId: string;
  balance: BalanceSummary;
  year: number;
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  const [state, action, pending] = useActionState(updateAllowance, {});
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <input type="hidden" name="employee_id" value={employeeId} />
        <input
          type="hidden"
          name="leave_type_id"
          value={balance.leave_type_id}
        />
        <input type="hidden" name="year" value={year} />
        <Field label={`${d.allowance} · ${balance.name} · ${year}`}>
          <input
            name="allowance"
            type="number"
            required
            min={balance.used + balance.pending}
            max={730}
            step={1}
            defaultValue={state.values?.allowance ?? balance.allowance ?? ""}
          />
        </Field>
        <Save pending={pending} locale={locale} />
      </fieldset>
    </form>
  );
}
export function LeaveTypeForm({
  type,
  locale,
}: {
  type?: LeaveType;
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  const [state, action, pending] = useActionState(updateLeaveType, {});
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <input type="hidden" name="id" value={type?.id ?? ""} />
        <Field label={d.typeName}>
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={state.values?.name ?? type?.name ?? ""}
          />
        </Field>
        {type ? (
          <>
            <input type="hidden" name="category" value={type.category} />
            <input
              type="hidden"
              name="deducts_balance"
              value={String(type.deducts_balance)}
            />
            <p className="form-help">
              {d[type.category]} · {d.balanceType}:{" "}
              {type.deducts_balance ? d.yes : d.no}
            </p>
          </>
        ) : (
          <div className="form-grid">
            <Field label={d.category}>
              <select
                name="category"
                defaultValue={state.values?.category ?? "other"}
              >
                {(["annual", "medical", "unpaid", "other"] as const).map(
                  (c) => (
                    <option key={c} value={c}>
                      {d[c]}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label={d.balanceType}>
              <select
                name="deducts_balance"
                defaultValue={state.values?.deducts_balance ?? "false"}
              >
                <option value="false">{d.no}</option>
                <option value="true">{d.yes}</option>
              </select>
            </Field>
          </div>
        )}
        <Field label={d.active}>
          <select
            name="active"
            defaultValue={state.values?.active ?? String(type?.active ?? true)}
          >
            <option value="true">{d.yes}</option>
            <option value="false">{d.no}</option>
          </select>
        </Field>
        <Save pending={pending} locale={locale} />
      </fieldset>
    </form>
  );
}
export function CalendarDayForm({
  day,
  locale,
}: {
  day?: CalendarDay;
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  const [state, action, pending] = useActionState(updateCalendarDay, {});
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <Field label={d.day}>
          <input
            type="date"
            name="day"
            required
            min="2000-01-01"
            max="2200-12-31"
            defaultValue={state.values?.day ?? day?.day}
            readOnly={!!day}
          />
        </Field>
        <Field label={d.label}>
          <input
            name="label"
            required
            minLength={2}
            maxLength={100}
            defaultValue={state.values?.label ?? day?.label}
          />
        </Field>
        <Field label={d.working}>
          <select
            name="is_working"
            defaultValue={
              state.values?.is_working ?? String(day?.is_working ?? false)
            }
          >
            <option value="false">{d.nonWorking}</option>
            <option value="true">{d.working}</option>
          </select>
        </Field>
        <Save pending={pending} locale={locale} />
      </fieldset>
    </form>
  );
}
export function AttendanceForm({
  employeeId,
  day,
  locale,
}: {
  employeeId: string;
  day: AttendanceDay;
  locale: Locale;
}) {
  const d = timeDictionary(locale);
  const [state, action, pending] = useActionState(updateAttendance, {});
  return (
    <form action={action} className="form-stack time-form">
      <Feedback state={state} />
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <input type="hidden" name="employee_id" value={employeeId} />
        <input type="hidden" name="day" value={day.day} />
        <input type="hidden" name="version" value={day.version ?? ""} />
        <div className="form-grid">
          <Field label={d.planned}>
            <input
              name="planned_hours"
              type="number"
              min={0}
              max={24}
              step="0.01"
              required
              defaultValue={state.values?.planned_hours ?? day.planned_hours}
            />
          </Field>
          <Field label={d.worked}>
            <input
              name="worked_hours"
              type="number"
              min={0}
              max={24}
              step="0.01"
              required
              defaultValue={
                state.values?.worked_hours ?? day.worked_hours ?? ""
              }
            />
          </Field>
        </div>
        <Field label={d.category}>
          <select
            name="absence"
            defaultValue={
              state.values?.absence ??
              (day.category === "unrecorded" ? "none" : day.category)
            }
          >
            {(["none", "medical", "unpaid", "other"] as const).map((c) => (
              <option key={c} value={c}>
                {d[c]}
              </option>
            ))}
          </select>
        </Field>
        <small className="muted">{d.attendanceEditHelp}</small>
        <Save pending={pending} locale={locale} />
      </fieldset>
    </form>
  );
}
