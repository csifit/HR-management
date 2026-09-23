"use client";
import { useActionState } from "react";
import { saveReges } from "@/app/(workspace)/integrations/reges/actions";
import { documentDictionary } from "@/lib/document-i18n";
import type { Locale } from "@/lib/i18n";
import type { RegesConnection } from "@/lib/reges";
export function RegesForm({
  record,
  locale,
}: {
  record: RegesConnection | null;
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(saveReges, {}),
    d = documentDictionary(locale);
  return (
    <form action={action} className="form-stack">
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
        <input type="hidden" name="version" value={record?.version ?? ""} />
        <label className="field">
          <span>ID angajator / Employer ID</span>
          <input
            name="employer_id"
            defaultValue={
              state.values?.employer_id ?? record?.employer_id ?? ""
            }
            maxLength={36}
          />
        </label>
        <label className="field">
          <span>ID utilizator / Author ID</span>
          <input
            name="author_id"
            defaultValue={state.values?.author_id ?? record?.author_id ?? ""}
            maxLength={36}
          />
        </label>
        <p className="time-help">
          {locale === "ro"
            ? "Salvează ambele ID-uri sau golește ambele câmpuri. Nu introduce tokenuri sau parole."
            : "Save both IDs or clear both fields. Do not enter tokens or passwords."}
        </p>
        <button className="button primary">{pending ? d.busy : d.save}</button>
      </fieldset>
    </form>
  );
}
