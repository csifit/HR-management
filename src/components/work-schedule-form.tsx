"use client";
import { useActionState, useState } from "react";
import { updateWorkSchedule } from "@/app/(workspace)/leave/actions";
import type { WorkSchedule } from "@/lib/time-types";
import type { Locale } from "@/lib/i18n";
import { scheduleDictionary, weekdayLabels } from "@/lib/schedule-i18n";
import { timeDictionary } from "@/lib/time-i18n";

export function WorkScheduleForm({
  employeeId,
  schedule,
  today,
  locale,
}: {
  employeeId: string | null;
  schedule?: WorkSchedule;
  today: string;
  locale: Locale;
}) {
  const d = scheduleDictionary(locale);
  const td = timeDictionary(locale);
  const [state, action, pending] = useActionState(updateWorkSchedule, {});
  const [mode, setMode] = useState(
    employeeId && !schedule?.weekdays ? "inherit" : "custom",
  );
  const selected = state.values?.weekdays?.split(",").map(Number) ??
    schedule?.weekdays ?? [1, 2, 3, 4, 5];
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
        <input type="hidden" name="employee_id" value={employeeId ?? ""} />
        <input type="hidden" name="version" value={schedule?.version ?? ""} />
        <label className="field">
          <span>{d.from}</span>
          <input
            name="effective_from"
            type="date"
            required
            min={today}
            max="2200-12-31"
            readOnly={!!schedule}
            defaultValue={
              state.values?.effective_from ?? schedule?.effective_from ?? today
            }
          />
        </label>
        {employeeId ? (
          <label className="field">
            <span>{d.mode}</span>
            <select
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="inherit">{d.inherit}</option>
              <option value="custom">{d.custom}</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="mode" value="custom" />
        )}
        <fieldset disabled={mode === "inherit"} className="schedule-weekdays">
          <legend>{d.weekdays}</legend>
          {weekdayLabels(locale).map((label, i) => (
            <label key={i}>
              <input
                type="checkbox"
                name="weekdays"
                value={i + 1}
                defaultChecked={selected.includes(i + 1)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <button className="button primary" disabled={pending}>
          {pending ? td.saving : td.save}
        </button>
      </fieldset>
    </form>
  );
}
