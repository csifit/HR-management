"use client";
import { useActionState, type ReactNode } from "react";
import {
  saveProvider,
  saveBenefit,
  saveEnrolment,
  prepareMonth,
  reviewItem,
  approveMonth,
} from "@/app/(workspace)/benefits/actions";
import type {
  Benefit,
  BenefitProvider,
  EmployeeBenefit,
  BenefitItem,
  BenefitRun,
} from "@/lib/benefit-types";
import type { ActionState } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { benefitDictionary } from "@/lib/benefit-i18n";
type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field time-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Form({
  action,
  children,
  locale,
  label,
}: {
  action: Action;
  children: (state: ActionState) => ReactNode;
  locale: Locale;
  label?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const d = benefitDictionary(locale);
  return (
    <form action={submit} className="form-stack time-form">
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
      <fieldset disabled={pending} className="time-fieldset form-stack">
        {children(state)}
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? d.saving : (label ?? d.save)}
        </button>
      </fieldset>
    </form>
  );
}
function Identity({ record }: { record?: { id: string; version: number } }) {
  return (
    <>
      <input type="hidden" name="id" value={record?.id ?? ""} />
      <input type="hidden" name="version" value={record?.version ?? ""} />
    </>
  );
}
function Active({ value, locale }: { value: string; locale: Locale }) {
  const d = benefitDictionary(locale);
  return (
    <Field label={d.active}>
      <select name="active" defaultValue={value}>
        <option value="true">{d.yes}</option>
        <option value="false">{d.no}</option>
      </select>
    </Field>
  );
}
export function ProviderForm({
  provider,
  locale,
}: {
  provider?: BenefitProvider;
  locale: Locale;
}) {
  const d = benefitDictionary(locale);
  return (
    <Form action={saveProvider} locale={locale}>
      {(s) => (
        <>
          <Identity record={provider} />
          <Field label={d.name}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={s.values?.name ?? provider?.name ?? ""}
            />
          </Field>
          {provider ? (
            <>
              <input
                name="adapter_key"
                type="hidden"
                value={provider.adapter_key}
              />
              <p className="muted">
                {provider.adapter_key === "custom"
                  ? d.custom
                  : provider.adapter_key}
              </p>
            </>
          ) : (
            <Field label={d.adapter}>
              <select
                name="adapter_key"
                defaultValue={s.values?.adapter_key ?? "custom"}
              >
                <option value="custom">{d.custom}</option>
                <option value="pluxee">Pluxee</option>
                <option value="edenred">Edenred</option>
                <option value="up_romania">Up România</option>
              </select>
            </Field>
          )}
          <Active
            locale={locale}
            value={s.values?.active ?? String(provider?.active ?? true)}
          />
        </>
      )}
    </Form>
  );
}
export function BenefitForm({
  benefit,
  providers,
  locale,
}: {
  benefit?: Benefit;
  providers: BenefitProvider[];
  locale: Locale;
}) {
  const d = benefitDictionary(locale);
  return (
    <Form action={saveBenefit} locale={locale}>
      {(s) => (
        <>
          <Identity record={benefit} />
          <Field label={d.name}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={s.values?.name ?? benefit?.name ?? ""}
            />
          </Field>
          <Field label={d.provider}>
            <select
              name="provider_id"
              required
              defaultValue={s.values?.provider_id ?? benefit?.provider_id ?? ""}
            >
              <option value="" disabled>
                {d.choose}
              </option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.active ? "" : ` (${d.disabledLabel})`}
                </option>
              ))}
            </select>
          </Field>
          {benefit ? (
            <>
              <input type="hidden" name="model" value={benefit.model} />
              <p>{d[benefit.model]}</p>
            </>
          ) : (
            <Field label={d.model}>
              <select
                name="model"
                defaultValue={s.values?.model ?? "fixed_monthly"}
              >
                {(
                  [
                    "fixed_monthly",
                    "per_worked_day",
                    "annual_allowance",
                    "flexible_budget",
                    "non_financial",
                  ] as const
                ).map((m) => (
                  <option key={m} value={m}>
                    {d[m]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={d.amount}>
            <input
              name="amount"
              type="number"
              min={0}
              max={1000000}
              step="0.01"
              required
              defaultValue={s.values?.amount ?? benefit?.amount ?? 0}
            />
          </Field>
          <Active
            locale={locale}
            value={s.values?.active ?? String(benefit?.active ?? true)}
          />
        </>
      )}
    </Form>
  );
}
export function EnrolmentForm({
  record,
  employeeId,
  startDate,
  benefits,
  locale,
}: {
  record?: EmployeeBenefit;
  employeeId: string;
  startDate: string;
  benefits: Benefit[];
  locale: Locale;
}) {
  const d = benefitDictionary(locale);
  return (
    <Form action={saveEnrolment} locale={locale}>
      {(s) => (
        <>
          <Identity record={record} />
          <input type="hidden" name="employee_id" value={employeeId} />
          {record ? (
            <input type="hidden" name="benefit_id" value={record.benefit_id} />
          ) : (
            <Field label={d.benefit}>
              <select
                name="benefit_id"
                required
                defaultValue={s.values?.benefit_id ?? ""}
              >
                <option value="" disabled>
                  {d.choose}
                </option>
                {benefits
                  .filter((b) => b.active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <div className="form-grid">
            <Field label={d.start}>
              <input
                type="date"
                name="starts_on"
                min={startDate}
                max="2200-12-31"
                required
                defaultValue={
                  s.values?.starts_on ?? record?.starts_on ?? startDate
                }
              />
            </Field>
            <Field label={d.end}>
              <input
                type="date"
                name="ends_on"
                min={startDate}
                max="2200-12-31"
                defaultValue={s.values?.ends_on ?? record?.ends_on ?? ""}
              />
            </Field>
          </div>
          <Active
            locale={locale}
            value={s.values?.active ?? String(record?.active ?? true)}
          />
        </>
      )}
    </Form>
  );
}
export function PrepareBenefitsForm({
  run,
  month,
  locale,
}: {
  run: BenefitRun | null;
  month: string;
  locale: Locale;
}) {
  const d = benefitDictionary(locale);
  return (
    <Form
      action={prepareMonth}
      locale={locale}
      label={run ? d.reprepare : d.prepare}
    >
      {() => (
        <>
          <input type="hidden" name="month" value={`${month}-01`} />
          <input type="hidden" name="version" value={run?.version ?? ""} />
          <label className="benefit-confirm">
            <input type="checkbox" name="confirm" required />
            {run ? d.replace : d.prepareConfirm}
          </label>
        </>
      )}
    </Form>
  );
}
export function ReviewBenefitForm({
  item,
  locale,
}: {
  item: BenefitItem;
  locale: Locale;
}) {
  const d = benefitDictionary(locale);
  return (
    <Form action={reviewItem} locale={locale}>
      {(s) => (
        <>
          <Identity record={item} />
          <Field label={d.review}>
            <select
              name="included"
              defaultValue={s.values?.included ?? String(item.included)}
            >
              <option value="true">{d.included}</option>
              <option value="false">{d.excluded}</option>
            </select>
          </Field>
          <Field label={d.final}>
            <input
              name="amount"
              type="number"
              required
              min={0}
              max={
                item.model === "non_financial"
                  ? 0
                  : item.model === "flexible_budget"
                    ? item.unit_amount
                    : item.model === "annual_allowance"
                      ? Math.max(0, item.unit_amount - item.annual_used)
                      : 31000000
              }
              step="0.01"
              defaultValue={s.values?.amount ?? item.final_amount}
            />
          </Field>
          <Field label={d.note}>
            <textarea
              name="note"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              defaultValue={s.values?.note ?? item.review_note ?? ""}
            />
          </Field>
          <small className="muted">{d.noteHelp}</small>
          <small className="muted">{d.reviewHelp}</small>
        </>
      )}
    </Form>
  );
}
export function ApproveBenefitsForm({
  run,
  locale,
}: {
  run: BenefitRun;
  locale: Locale;
}) {
  const d = benefitDictionary(locale);
  return (
    <Form action={approveMonth} locale={locale} label={d.approve}>
      {() => (
        <>
          <Identity record={run} />
          <p className="form-help">{d.approveHelp}</p>
          <label className="benefit-confirm">
            <input type="checkbox" name="confirm" required />
            {d.approveConfirm}
          </label>
        </>
      )}
    </Form>
  );
}
