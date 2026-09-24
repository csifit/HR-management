"use client";
import {
  useActionState,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createPrivacyRequest,
  updatePrivacyRequest,
} from "@/app/(workspace)/settings/data-protection/requests/actions";
import { privacyDictionary } from "@/lib/privacy-i18n";
import {
  privacyKinds,
  privacyStatuses,
  privacyChannels,
  type PrivacyRequest,
} from "@/lib/privacy-types";
import { calendarMonthAfter } from "@/lib/privacy-validation";
import { browserSupabase } from "@/lib/supabase/browser";
import { DOCUMENT_BUCKET, type EmployeeDocument } from "@/lib/document-types";
import type { Locale } from "@/lib/i18n";
import type { Membership } from "@/lib/types";
type Person = { id: string; first_name: string; last_name: string };
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field time-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Assignee({
  members,
  value,
  label,
}: {
  members: Membership[];
  value: string;
  label: string;
}) {
  return (
    <Field label={label}>
      <select
        name="assigned_to"
        required
        defaultValue={members.some((m) => m.user_id === value) ? value : ""}
      >
        <option value="">—</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.display_name} · {m.email}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function PrivacyCreateForm({
  locale,
  employees,
  members,
  userId,
  today,
}: {
  locale: Locale;
  employees: Person[];
  members: Membership[];
  userId: string;
  today: string;
}) {
  const d = privacyDictionary(locale),
    [state, action, pending] = useActionState(createPrivacyRequest, {});
  const [received, setReceived] = useState(today),
    [due, setDue] = useState(calendarMonthAfter(today));
  return (
    <form action={action} className="form-stack time-form">
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      <fieldset disabled={pending} className="time-fieldset form-stack">
        <Field label={d.employee}>
          <select
            name="employee_id"
            required
            defaultValue={state.values?.employee_id ?? ""}
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.last_name} {e.first_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={d.kind}>
          <select name="kind" defaultValue={state.values?.kind ?? "access"}>
            {privacyKinds.map((k) => (
              <option key={k} value={k}>
                {d[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={d.channel}>
          <select
            name="channel"
            defaultValue={state.values?.channel ?? "email"}
          >
            {privacyChannels.map((k) => (
              <option key={k} value={k}>
                {d[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={d.receivedOn}>
          <input
            type="date"
            name="received_on"
            min="2000-01-01"
            max={today}
            required
            value={received}
            onChange={(e) => {
              setReceived(e.target.value);
              setDue(calendarMonthAfter(e.target.value));
            }}
          />
        </Field>
        <Field label={d.initialDue}>
          <input
            type="date"
            name="due_on"
            min={received}
            required
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
        <p className="time-help">{d.deadlineHelp}</p>
        <Assignee
          members={members}
          value={state.values?.assigned_to ?? userId}
          label={d.assignee}
        />
        <Field label={d.summary}>
          <textarea
            name="summary"
            defaultValue={state.values?.summary ?? ""}
            required
            minLength={3}
            maxLength={1000}
            rows={3}
          />
        </Field>
        <p className="time-help">{d.notesHelp}</p>
        <button className="button primary" disabled={!employees.length}>
          {pending ? d.busy : d.newRequest}
        </button>
      </fieldset>
    </form>
  );
}
export function PrivacyUpdateForm({
  locale,
  request: r,
  members,
  today,
}: {
  locale: Locale;
  request: PrivacyRequest;
  members: Membership[];
  today: string;
}) {
  const d = privacyDictionary(locale),
    [state, action, pending] = useActionState(updatePrivacyRequest, {});
  const fieldValue = (key: keyof PrivacyRequest) =>
    String(state.values?.[key] ?? r[key] ?? "");
  return (
    <form action={action} className="form-stack time-form">
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
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="version" value={r.version} />
        <Field label={d.state}>
          <select name="status" defaultValue={fieldValue("status")}>
            {privacyStatuses
              .filter((s) => s !== "received" || r.status === "received")
              .map((s) => (
                <option key={s} value={s}>
                  {d[s]}
                </option>
              ))}
          </select>
        </Field>
        <Assignee
          members={members}
          value={fieldValue("assigned_to")}
          label={d.assignee}
        />
        <Field label={d.identity}>
          <input
            name="identity_reference"
            maxLength={200}
            defaultValue={fieldValue("identity_reference")}
          />
        </Field>
        <p className="time-help">{d.identityHelp}</p>
        <Field label={d.due}>
          <input
            type="date"
            name="due_on"
            min={r.initial_due_on}
            required
            defaultValue={fieldValue("due_on")}
          />
        </Field>
        <Field label={d.extension}>
          <textarea
            name="extension_reason"
            maxLength={1000}
            rows={2}
            defaultValue={fieldValue("extension_reason")}
          />
        </Field>
        <Field label={d.notified}>
          <input
            type="date"
            name="extension_notified_on"
            min={r.received_on}
            max={today}
            defaultValue={fieldValue("extension_notified_on")}
          />
        </Field>
        <p className="time-help">{d.deadlineHelp}</p>
        <Field label={d.response}>
          <input
            name="response_reference"
            maxLength={200}
            defaultValue={fieldValue("response_reference")}
          />
        </Field>
        <Field label={d.responded}>
          <input
            type="date"
            name="responded_on"
            min={r.received_on}
            max={today}
            defaultValue={fieldValue("responded_on")}
          />
        </Field>
        <Field label={d.resolution}>
          <textarea
            name="resolution"
            maxLength={2000}
            rows={3}
            defaultValue={fieldValue("resolution")}
          />
        </Field>
        <p className="time-help">{d.closeHelp}</p>
        <p className="time-help">{d.notesHelp}</p>
        <button className="button primary">{pending ? d.busy : d.save}</button>
      </fieldset>
    </form>
  );
}
export function PrivacyExportForm({
  locale,
  request: r,
  documents,
  today,
}: {
  locale: Locale;
  request: PrivacyRequest;
  documents: EmployeeDocument[];
  today: string;
}) {
  const d = privacyDictionary(locale),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const ids = new Set(values.getAll("document").map(String));
      const selected = documents
        .filter((doc) => ids.has(doc.id))
        .map(({ id, version }) => ({ id, version }));
      const supabase = browserSupabase();
      const { data, error } = await supabase.rpc("prepare_privacy_export", {
        p_org: r.organisation_id,
        p_request: r.id,
        p_version: r.version,
        p_documents: selected,
        p_from: String(values.get("from")),
        p_to: String(values.get("to")),
        p_confirm: values.get("confirm") === "on",
      });
      if (error || !data) {
        setFailed(true);
        setMessage(
          error?.code === "R0001"
            ? d.tooLarge
            : error?.code === "P0006"
              ? d.stale
              : error?.code === "D0001"
                ? d.locked
                : d.invalid,
        );
        return;
      }
      const { buildPrivacyArchive } = await import("@/lib/privacy-export");
      const bytes = await buildPrivacyArchive(data, async (path) => {
        const result = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .download(path);
        if (result.error || !result.data) throw new Error("Download failed");
        return new Uint8Array(await result.data.arrayBuffer());
      });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `employee-review-${data.export_id}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(d.downloaded);
    } catch {
      setFailed(true);
      setMessage(d.exportFailed);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit} className="form-stack time-form">
      {message && (
        <p
          className={`notice ${failed ? "error" : "success"}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <p className="time-help">{d.exportHelp}</p>
      <p className="time-help">{d.coverage}</p>
      <Link
        href={`/documents?employee=${r.employee_id}`}
        className="button secondary"
      >
        {d.documentReview}
      </Link>
      <fieldset disabled={busy} className="time-fieldset form-stack">
        <Field label={d.from}>
          <input
            type="date"
            name="from"
            min="2000-01-01"
            max={today}
            defaultValue={`${today.slice(0, 4)}-01-01`}
            required
          />
        </Field>
        <Field label={d.to}>
          <input
            type="date"
            name="to"
            min="2000-01-01"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        <h3>{d.documents}</h3>
        {!documents.length && <p className="time-help">{d.noDocuments}</p>}
        {documents.map((doc) => (
          <label key={doc.id} className="benefit-confirm">
            <input type="checkbox" name="document" value={doc.id} />
            <span>
              {doc.title} ·{" "}
              {doc.status === "archived" ? d.archived : d.readyDocument} ·{" "}
              {(doc.byte_size / 1024 / 1024).toFixed(2)} MB
            </span>
          </label>
        ))}
        <label className="benefit-confirm">
          <input name="confirm" type="checkbox" required />
          {d.confirm}
        </label>
        <button className="button primary">{busy ? d.busy : d.download}</button>
      </fieldset>
    </form>
  );
}
