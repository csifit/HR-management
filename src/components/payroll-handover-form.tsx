"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { payrollHandoverDictionary } from "@/lib/payroll-handover-i18n";

export function PayrollHandoverForm({
  runId,
  runVersion,
  month,
  revision,
  locale,
  isHistorical,
  latestRevision,
  hasOpenCorrection,
  active,
}: {
  runId: string;
  runVersion: number;
  month: string;
  revision: number;
  locale: Locale;
  isHistorical: boolean;
  latestRevision: number;
  hasOpenCorrection: boolean;
  active: boolean;
}) {
  const d = payrollHandoverDictionary(locale),
    router = useRouter(),
    submitting = useRef(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !active) return;
    const form = new FormData(event.currentTarget),
      confirmed = form.get("confirm") === "on",
      allowHistorical = form.get("historical") === "on";
    setError("");
    setMessage("");
    if (!confirmed || (isHistorical && !allowHistorical)) {
      setError(
        isHistorical && !allowHistorical ? d.historicalRequired : d.invalid,
      );
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch(`/payroll/runs/${runId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          version: runVersion,
          confirm: true,
          allowHistorical,
        }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : d.generationFailed,
        );
        return;
      }
      if (
        response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() !== "application/zip"
      ) {
        setError(d.generationFailed);
        return;
      }
      const blob = await response.blob();
      if (!blob.size) {
        setError(d.generationFailed);
        return;
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement("a"),
        safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : "payroll",
        safeRevision =
          Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
      try {
        link.href = url;
        link.download = `payroll-${safeMonth}-r${safeRevision}-accountant.zip`;
        document.body.appendChild(link);
        link.click();
        setMessage(d.downloaded);
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch {
      setError(d.generationFailed);
    } finally {
      submitting.current = false;
      setPending(false);
      // Preparation may have been recorded even if file transfer failed.
      router.refresh();
    }
  }

  return (
    <form onSubmit={download} className="form-stack">
      <p className="time-help">{d.intro}</p>
      <p className="time-help">{d.contents}</p>
      <p className="time-help">{d.scope}</p>
      <p className="notice">{d.sensitive}</p>
      {isHistorical && (
        <p className="notice">
          {d.historical} {latestRevision}.
        </p>
      )}
      {hasOpenCorrection && <p className="notice">{d.openCorrection}</p>}
      {!active && <p className="notice">{d.inactive}</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <fieldset
        disabled={pending || !active}
        className="time-fieldset form-stack"
      >
        <label className="benefit-confirm">
          <input type="checkbox" name="confirm" required />
          {d.confirm}
        </label>
        {isHistorical && (
          <label className="benefit-confirm">
            <input type="checkbox" name="historical" required />
            {d.historicalConfirm}
          </label>
        )}
        <button className="button primary" type="submit">
          {pending ? d.busy : d.download}
        </button>
      </fieldset>
    </form>
  );
}
