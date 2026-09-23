"use client";
import { useActionState } from "react";
import { reviewContract } from "@/app/(workspace)/integrations/reges/actions";
import type { Locale } from "@/lib/i18n";
export function ContractReview({
  id,
  version,
  reviewed,
  locale,
  writable,
}: {
  id: string;
  version: number;
  reviewed: boolean;
  locale: Locale;
  writable: boolean;
}) {
  const [state, action, pending] = useActionState(reviewContract, {}),
    ro = locale === "ro";
  return (
    <div className="form-stack">
      <p className="notice">
        {reviewed
          ? ro
            ? "Contract verificat de HR pentru versiunea curentă."
            : "HR has reviewed the current contract version."
          : ro
            ? "Contractul necesită verificare HR înainte de transmiterea în REGES."
            : "HR review is required before REGES submission."}
      </p>
      <p className="time-help">
        {ro
          ? "Orice modificare necesită o nouă verificare. Conexiunea REGES nu este încă activă; această acțiune nu transmite contractul."
          : "Every change requires another review. REGES is not connected yet; this action does not submit the contract."}
      </p>
      {writable && !reviewed && (
        <form action={action} className="form-stack">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
          <label className="benefit-confirm">
            <input name="confirm" type="checkbox" required />
            {ro
              ? "Am verificat datele contractului afișat."
              : "I have checked the displayed contract details."}
          </label>
          {state.error && <p role="alert">{state.error}</p>}
          <button className="button secondary" disabled={pending}>
            {ro ? "Confirmă verificarea HR" : "Confirm HR review"}
            {pending ? "…" : ""}
          </button>
        </form>
      )}
    </div>
  );
}
