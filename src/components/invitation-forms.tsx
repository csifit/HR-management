"use client";
import { useActionState } from "react";
import { acceptInvitation, manageInvitation } from "@/app/join/actions";
import type { Locale } from "@/lib/i18n";
export function InvitationForm({
  id,
  employeeId,
  operation,
  locale,
}: {
  id?: string;
  employeeId?: string;
  operation: "accept" | "send" | "revoke";
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(
      operation === "accept" ? acceptInvitation : manageInvitation,
      {},
    ),
    ro = locale === "ro";
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="id" value={id ?? ""} />
      <input type="hidden" name="employee_id" value={employeeId ?? ""} />
      <input type="hidden" name="operation" value={operation} />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
      <button className="button secondary" disabled={pending}>
        {operation === "accept"
          ? ro
            ? "Acceptă accesul de angajat"
            : "Accept employee access"
          : operation === "send"
            ? ro
              ? "Trimite o invitație nouă"
              : "Send a new invitation"
            : ro
              ? "Revocă invitația"
              : "Revoke invitation"}
        {pending ? "…" : ""}
      </button>
    </form>
  );
}
