"use client";
import { useActionState } from "react";
import { emailDocument } from "@/app/(workspace)/documents/email-actions";
import type { Locale } from "@/lib/i18n";
export function DocumentEmailForm({
  id,
  version,
  recipient,
  locale,
  configured,
}: {
  id: string;
  version: number;
  recipient: string;
  locale: Locale;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(emailDocument, {}),
    ro = locale === "ro";
  if (!configured)
    return (
      <p className="time-help">
        {ro
          ? "Email indisponibil: configurează SMTP în mediul serverului."
          : "Email unavailable: configure SMTP in the server environment."}
      </p>
    );
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="recipient" value={recipient} />
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
        <p>
          {ro ? "Destinatar" : "Recipient"}: <strong>{recipient}</strong>
        </p>
        <label className="benefit-confirm">
          <input name="confirm" type="checkbox" required />
          {ro
            ? "Am verificat destinatarul și autorizez trimiterea acestui PDF prin email. Atașamentele trimise nu pot fi retrase."
            : "I checked the recipient and authorize emailing this PDF. Sent attachments cannot be recalled."}
        </label>
        <button className="button secondary">
          {pending ? "…" : ro ? "Trimite prin email" : "Send by email"}
        </button>
      </fieldset>
    </form>
  );
}
