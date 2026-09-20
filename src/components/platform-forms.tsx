"use client";
import { useActionState, useId } from "react";
import { Save, ShieldCheck, LoaderCircle } from "lucide-react";
import {
  savePlatformOrganisation,
  changeOrganisationStatus,
} from "@/app/platform/actions";
import { platformDictionary } from "@/lib/platform-i18n";
import type { Locale } from "@/lib/i18n";
import type { ActionState, Organisation } from "@/lib/types";

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
export function PlatformOrganisationForm({
  organisation,
  locale,
}: {
  organisation?: Organisation;
  locale: Locale;
}) {
  const d = platformDictionary(locale);
  const prefix = useId();
  const [state, action, pending] = useActionState(
    savePlatformOrganisation.bind(
      null,
      organisation?.id ?? null,
      organisation?.version ?? null,
    ),
    {},
  );
  const input = (
    name:
      | "name"
      | "cui"
      | "registration_number"
      | "registered_address"
      | "city"
      | "county"
      | "contact_name"
      | "contact_email"
      | "contact_phone"
      | "owner_email",
    max: number,
    required = false,
    type = "text",
  ) => {
    const error = state.fields?.[name];
    return (
      <div className={`field ${error ? "field-error" : ""}`} key={name}>
        <label htmlFor={`${prefix}-${name}`}>
          {name === "owner_email" ? d.owner : d[name]}
          {required && <span className="required"> *</span>}
        </label>
        <input
          id={`${prefix}-${name}`}
          name={name}
          type={type}
          required={required}
          maxLength={max}
          minLength={name === "name" ? 2 : undefined}
          pattern={name === "cui" ? "(RO)?[0-9]{2,10}" : undefined}
          defaultValue={
            state.values?.[name] ??
            (name === "owner_email" ? "" : organisation?.[name]) ??
            ""
          }
          aria-invalid={!!error}
          aria-describedby={
            error
              ? `${prefix}-${name}-error`
              : name === "owner_email"
                ? `${prefix}-owner-hint`
                : undefined
          }
        />
        {error && (
          <small id={`${prefix}-${name}-error`} className="field-validation">
            {d.invalid}
          </small>
        )}
        {name === "owner_email" && (
          <small id={`${prefix}-owner-hint`}>{d.ownerHint}</small>
        )}
      </div>
    );
  };
  return (
    <form action={action} className="form-stack">
      <Feedback state={state} />
      <fieldset
        className="platform-fieldset"
        disabled={pending}
        key={organisation?.version ?? "new"}
      >
        <legend className="sr-only">{d.details}</legend>
        <div className="form-grid">
          {input("name", 160, true)}
          {input("cui", 12, true)}
          {input("registration_number", 80)}
          {input("registered_address", 300)}
          {input("city", 100)}
          {input("county", 100)}
          {input("contact_name", 160)}
          {input("contact_email", 254, false, "email")}
          {input("contact_phone", 30, false, "tel")}
          {!organisation && input("owner_email", 254, true, "email")}
        </div>
        <button className="button primary" type="submit">
          {pending ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Save size={17} />
          )}
          {pending ? d.saving : organisation ? d.save : d.create}
        </button>
      </fieldset>
    </form>
  );
}
export function OrganisationAccessForm({
  organisation,
  locale,
}: {
  organisation: Organisation;
  locale: Locale;
}) {
  const d = platformDictionary(locale);
  const prefix = useId();
  const [state, action, pending] = useActionState(changeOrganisationStatus, {});
  return (
    <form action={action} className="form-stack">
      <Feedback state={state} />
      <fieldset
        className="platform-fieldset form-stack"
        disabled={pending}
        key={organisation.version}
      >
        <legend className="sr-only">{d.access}</legend>
        <input type="hidden" name="id" value={organisation.id} />
        <input type="hidden" name="version" value={organisation.version} />
        <div className="field">
          <label htmlFor={`${prefix}-status`}>{d.status}</label>
          <select
            id={`${prefix}-status`}
            name="status"
            defaultValue=""
            required
          >
            <option value="" disabled>
              —
            </option>
            {(["active", "suspended", "blocked"] as const).map((status) => (
              <option
                value={status}
                key={status}
                disabled={status === organisation.status}
              >
                {d[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="access-explanation">
          <p>
            <strong>{d.active}.</strong> {d.activeHelp}
          </p>
          <p>
            <strong>{d.suspended}.</strong> {d.suspendedHelp}
          </p>
          <p>
            <strong>{d.blocked}.</strong> {d.blockedHelp}
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-reason`}>
            {d.reason} <span className="required">*</span>
          </label>
          <textarea
            id={`${prefix}-reason`}
            name="reason"
            required
            minLength={5}
            maxLength={500}
            rows={3}
            aria-describedby={`${prefix}-reason-hint`}
            aria-invalid={!!state.fields?.reason}
          />
          <small id={`${prefix}-reason-hint`}>{d.reasonHint}</small>
        </div>
        <label className="platform-confirm">
          <input type="checkbox" name="confirmed" value="yes" required />{" "}
          <span>
            {d.acknowledge} <strong>{organisation.name}</strong>.
          </span>
        </label>
        <button className="button secondary" type="submit">
          {pending ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <ShieldCheck size={17} />
          )}
          {pending ? d.saving : d.apply}
        </button>
      </fieldset>
    </form>
  );
}
