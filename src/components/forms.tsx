"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Save,
  Plus,
} from "lucide-react";
import {
  signIn,
  signUp,
  forgotPassword,
  updatePassword,
  createOrganisation,
  saveOrganisation,
  saveEmployee,
  saveContract,
  saveMember,
} from "@/app/actions";
import { dictionary, roleLabel, type Locale } from "@/lib/i18n";
import { contractDictionary } from "@/lib/contract-i18n";
import type {
  ActionState,
  Employee,
  Membership,
  Organisation,
  Contract,
} from "@/lib/types";
const initial: ActionState = {};
function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          <span>{state.error}</span>
        </div>
      )}
      {state.success && (
        <div className="notice success" role="status">
          <CheckCircle2 size={18} />
          <span>{state.success}</span>
        </div>
      )}
    </>
  );
}
function Field({
  label,
  name,
  state,
  children,
  required = false,
  hint,
}: {
  label: string;
  name: string;
  state: ActionState;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  const error = state.fields?.[name];
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {children}
      {hint && <small id={`${name}-hint`}>{hint}</small>}
      {error && (
        <small className="field-validation" id={`${name}-error`}>
          {state.error}
        </small>
      )}
    </div>
  );
}
function Submit({
  pending,
  label,
  busy,
}: {
  pending: boolean;
  label: string;
  busy: string;
}) {
  return (
    <button className="button primary" disabled={pending} type="submit">
      {pending ? (
        <LoaderCircle className="spin" size={17} />
      ) : (
        <Save size={17} />
      )}
      {pending ? busy : label}
    </button>
  );
}
export function AuthForm({
  mode,
  locale,
  join = false,
}: {
  mode: "login" | "register" | "forgot" | "update";
  locale: Locale;
  join?: boolean;
}) {
  const d = dictionary(locale);
  const action =
    mode === "login"
      ? signIn
      : mode === "register"
        ? signUp
        : mode === "forgot"
          ? forgotPassword
          : updatePassword;
  const [state, formAction, pending] = useActionState(action, initial);
  const label =
    mode === "login"
      ? d.login
      : mode === "register"
        ? d.register
        : mode === "forgot"
          ? d.sendReset
          : d.updatePassword;
  return (
    <form action={formAction} className="form-stack">
      {join && <input type="hidden" name="next" value="/join" />}
      <Feedback state={state} />
      {mode === "register" && (
        <Field label={d.fullName} name="full_name" state={state} required>
          <input
            name="full_name"
            id="full_name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
          />
        </Field>
      )}
      {mode !== "update" && (
        <Field label={d.accountEmail} name="email" state={state} required>
          <input
            name="email"
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nume@companie.ro"
            required
            maxLength={254}
          />
        </Field>
      )}
      {mode !== "forgot" && (
        <Field
          label={mode === "update" ? d.newPassword : d.password}
          name="password"
          state={state}
          required
          hint={mode !== "login" ? d.passwordHint : undefined}
        >
          <input
            name="password"
            id="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={mode === "login" ? 1 : 10}
            maxLength={200}
          />
        </Field>
      )}
      {mode === "login" && (
        <Link href="/forgot-password" className="auth-forgot">
          {d.forgotPassword}
        </Link>
      )}
      <button className="button primary button-wide" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : null}
        {label}
        {!pending && <ArrowRight size={18} />}
      </button>
    </form>
  );
}
export function OrganisationForm({
  locale,
  organisation,
}: {
  locale: Locale;
  organisation?: Organisation;
}) {
  const d = dictionary(locale);
  const [state, action, pending] = useActionState(
    organisation ? saveOrganisation : createOrganisation,
    initial,
  );
  return (
    <form className="form-stack" action={action}>
      <Feedback state={state} />
      <Field label={d.orgName} name="name" state={state} required>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={state.values?.name ?? organisation?.name}
          placeholder="Compania ta SRL"
        />
      </Field>
      <Field label={d.cui} name="cui" state={state} required>
        <input
          id="cui"
          name="cui"
          required
          pattern="(RO)?[0-9]{2,10}"
          maxLength={12}
          defaultValue={state.values?.cui ?? organisation?.cui}
          placeholder="RO12345678"
        />
      </Field>
      <Submit
        pending={pending}
        label={organisation ? d.save : d.createOrg}
        busy={d.saving}
      />
    </form>
  );
}
export function EmployeeForm({
  locale,
  employee,
  managers,
}: {
  locale: Locale;
  employee?: Employee;
  managers: Membership[];
}) {
  const d = dictionary(locale);
  const [state, action, pending] = useActionState(
    saveEmployee.bind(null, employee?.id ?? null),
    initial,
  );
  const value = (key: keyof Employee, fallback = "") =>
    state.values?.[key] ?? String(employee?.[key] ?? fallback);
  const textInput = (
    key: keyof Employee,
    label: string,
    max: number,
    required = true,
    type = "text",
  ) => (
    <Field label={label} name={key} state={state} required={required}>
      <input
        id={key}
        name={key}
        type={type}
        defaultValue={value(key)}
        required={required}
        maxLength={max}
        aria-invalid={!!state.fields?.[key]}
      />
    </Field>
  );
  return (
    <form action={action} className="employee-form">
      <Feedback state={state} />
      {!employee && (
        <p className="notice">
          {locale === "ro"
            ? "La salvare, HRConnector trimite o invitație la adresa de email introdusă, cu acces de angajat, și pornește lista de angajare. Verifică adresa înainte de salvare."
            : "Saving sends an employee-access invitation to the entered email and starts the onboarding checklist. Check the address before saving."}
        </p>
      )}
      <div className="form-section">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2>{d.personal}</h2>
            <p>{d.required}</p>
          </div>
        </div>
        <div className="form-grid">
          {textInput("first_name", d.firstName, 80)}
          {textInput("last_name", d.lastName, 80)}
          {textInput("email", d.email, 254, true, "email")}
          {textInput("phone", d.phone, 30, false, "tel")}
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2>{d.employmentDetails}</h2>
          </div>
        </div>
        <div className="form-grid">
          {textInput("job_title", d.jobTitle, 120)}
          {textInput("department", d.department, 100)}
          {textInput("workplace", d.workplace, 160)}
          <Field label={d.startDate} name="start_date" state={state} required>
            <input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={value("start_date")}
              min="1900-01-01"
              max="2200-12-31"
              required
            />
          </Field>
          <Field label={d.status} name="status" state={state} required>
            <select
              id="status"
              name="status"
              defaultValue={value("status", "onboarding")}
            >
              {(
                ["onboarding", "active", "suspended", "terminated"] as const
              ).map((status) => (
                <option key={status} value={status}>
                  {d[status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={d.manager} name="manager_user_id" state={state}>
            <select
              id="manager_user_id"
              name="manager_user_id"
              defaultValue={value("manager_user_id")}
            >
              <option value="">{d.unassigned}</option>
              {managers
                .filter((m) => m.user_id !== employee?.user_id)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </div>
      <div className="form-footer">
        <Link
          className="button secondary"
          href={employee ? `/employees/${employee.id}` : "/employees"}
        >
          {d.cancel}
        </Link>
        <Submit
          pending={pending}
          label={employee ? d.save : d.addEmployee}
          busy={d.saving}
        />
      </div>
    </form>
  );
}
export function ContractForm({
  locale,
  employee,
  contract,
}: {
  locale: Locale;
  employee: Employee;
  contract?: Contract;
}) {
  const d = dictionary(locale);
  const cd = contractDictionary(locale);
  const [state, action, pending] = useActionState(
    saveContract.bind(null, employee.id, contract?.id ?? null),
    initial,
  );
  const [kind, setKind] = useState(contract?.contract_type ?? "indefinite");
  const value = (key: keyof Contract, fallback = "") =>
    state.values?.[key] ?? String(contract?.[key] ?? fallback);
  const field = (
    key: keyof Contract,
    label: string,
    type = "text",
    fallback = "",
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field name={key} label={label} state={state} required>
      <input
        id={key}
        name={key}
        type={type}
        defaultValue={value(key, fallback)}
        required
        {...props}
      />
    </Field>
  );
  return (
    <form action={action} className="employee-form">
      {contract && (
        <input
          type="hidden"
          name="review_version"
          value={contract.review_version}
        />
      )}
      <Feedback state={state} />
      <div className="form-section">
        <div className="form-grid">
          {field("contract_number", d.contractNumber, "text", "", {
            maxLength: 80,
          })}
          <Field
            name="contract_type"
            label={d.contractType}
            state={state}
            required
          >
            <select
              id="contract_type"
              name="contract_type"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as Contract["contract_type"])
              }
            >
              <option value="indefinite">{d.indefinite}</option>
              <option value="fixed_term">{d.fixed_term}</option>
            </select>
          </Field>
          {field("start_date", d.startDate, "date", employee.start_date, {
            min: "1900-01-01",
            max: "2200-12-31",
          })}
          <Field
            name="end_date"
            label={cd.expiry}
            state={state}
            required={kind === "fixed_term"}
          >
            {kind === "fixed_term" ? (
              <input
                name="end_date"
                id="end_date"
                type="date"
                defaultValue={value("end_date")}
                min="1900-01-01"
                max="2200-12-31"
                required
              />
            ) : (
              <>
                <input type="hidden" name="end_date" value="" />
                <input id="end_date" disabled value="" type="date" />
              </>
            )}
          </Field>
          <Field name="termination_date" label={cd.lastDay} state={state}>
            <input
              name="termination_date"
              id="termination_date"
              type="date"
              defaultValue={value("termination_date")}
              min="1900-01-01"
              max="2200-12-31"
              aria-describedby="termination-date-help"
            />
            <p id="termination-date-help" className="time-help">
              {cd.lastDayHelp}
            </p>
          </Field>
          {field("job_title", d.jobTitle, "text", employee.job_title, {
            maxLength: 120,
          })}
          {field("cor_code", d.corCode, "text", "", {
            pattern: "[0-9]{6}",
            maxLength: 6,
            inputMode: "numeric",
          })}
          {field("working_hours", d.workingHours, "number", "8", {
            min: 0.01,
            max: 24,
            step: "0.01",
          })}
          {field("workplace", d.workplace, "text", employee.workplace, {
            maxLength: 160,
          })}
          {field("gross_salary", d.grossSalary, "number", "", {
            min: 0.01,
            max: 9999999999.99,
            step: "0.01",
          })}
          {field("probation_days", d.probationDays, "number", "0", {
            min: 0,
            max: 365,
          })}
          <Field name="status" label={d.status} state={state} required>
            <select
              name="status"
              id="status"
              defaultValue={value("status", "draft")}
            >
              {(["draft", "active", "suspended", "terminated"] as const).map(
                (status) => (
                  <option key={status} value={status}>
                    {d[status]}
                  </option>
                ),
              )}
            </select>
          </Field>
        </div>
      </div>
      <div className="form-footer">
        <Link
          className="button secondary"
          href={`/employees/${employee.id}?tab=contract`}
        >
          {d.cancel}
        </Link>
        <Submit
          pending={pending}
          label={contract ? d.save : d.addContract}
          busy={d.saving}
        />
      </div>
    </form>
  );
}
export function MemberForm({
  locale,
  employees,
}: {
  locale: Locale;
  employees: Employee[];
}) {
  const d = dictionary(locale);
  const [state, action, pending] = useActionState(saveMember, initial);
  return (
    <form className="form-stack" action={action}>
      <Feedback state={state} />
      <Field name="email" label={d.accountEmail} state={state} required>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={state.values?.email}
          required
        />
      </Field>
      <Field name="role" label={d.role} state={state} required>
        <select
          name="role"
          id="role"
          defaultValue={state.values?.role ?? "employee"}
        >
          {["employee", "manager", "hr_manager", "organisation_owner"].map(
            (role) => (
              <option key={role} value={role}>
                {roleLabel(role, d)}
              </option>
            ),
          )}
        </select>
      </Field>
      <Field name="employee_id" label={d.linkEmployee} state={state}>
        <select
          name="employee_id"
          id="employee_id"
          defaultValue={state.values?.employee_id ?? ""}
        >
          <option value="">{d.noLinkedEmployee}</option>
          {employees
            .filter((e) => !e.user_id)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
              </option>
            ))}
        </select>
      </Field>
      <p className="muted form-help">{d.memberHint}</p>
      <button className="button primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Plus size={17} />
        )}
        {d.addMember}
      </button>
    </form>
  );
}
