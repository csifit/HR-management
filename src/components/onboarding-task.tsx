"use client";
import { useActionState } from "react";
import { updateTask } from "@/app/(workspace)/lifecycle/actions";
import type { LifecycleTask } from "@/lib/document-types";
import type { Locale } from "@/lib/i18n";
export function CompactTask({
  task,
  label,
  locale,
  writable,
}: {
  task: LifecycleTask;
  label: string;
  locale: Locale;
  writable: boolean;
}) {
  const [state, action, pending] = useActionState(updateTask, {}),
    complete = task.status !== "todo";
  return (
    <form action={action}>
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="version" value={task.version} />
      <input type="hidden" name="status" value={complete ? "todo" : "done"} />
      <input type="hidden" name="note" value={task.note} />
      <button
        className="checklist-toggle"
        type="submit"
        aria-pressed={complete}
        disabled={!writable || pending}
      >
        <span aria-hidden="true">{complete ? "✓" : "○"}</span>
        {label}
        {task.status === "skipped"
          ? ` (${locale === "ro" ? "omis" : "skipped"})`
          : ""}
      </button>
      {state.error && <small role="alert">{state.error}</small>}
    </form>
  );
}
