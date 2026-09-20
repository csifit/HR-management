"use client";
import { AlertCircle } from "lucide-react";
import { dictionary } from "@/lib/i18n";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const d = dictionary(
    typeof document !== "undefined" && document.documentElement.lang === "en"
      ? "en"
      : "ro",
  );
  return (
    <div className="card empty-state">
      <AlertCircle size={32} />
      <h1>{d.errorTitle}</h1>
      <p>{d.errorBody}</p>
      <button className="button primary" onClick={reset}>
        {d.retry}
      </button>
    </div>
  );
}
