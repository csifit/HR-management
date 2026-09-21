"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { timeDictionary } from "@/lib/time-i18n";
import { canManage, type ActionState } from "@/lib/types";
import {
  leaveRequestSchema,
  leaveDecisionSchema,
  leaveTypeSchema,
  allowanceSchema,
  calendarDaySchema,
  attendanceSchema,
} from "@/lib/time-validation";

async function result(error: { code?: string } | null): Promise<ActionState> {
  const d = timeDictionary(await getLocale());
  const errors: Record<string, string> = {
    "42501": d.denied,
    P0004: d.inactive,
    P0006: d.stale,
    "23505": d.duplicate,
    "22023": d.invalid,
    L0001: d.insufficient,
    L0002: d.calendarConflict,
    L0003: d.employeeInactive,
    L0004: d.noWorkDays,
    L0005: d.overlap,
    L0006: d.noAllowance,
    L0007: d.closed,
    L0008: d.attendanceConflict,
  };
  if (error) return { error: errors[error.code ?? ""] ?? d.error };
  revalidatePath("/leave", "layout");
  revalidatePath("/attendance", "layout");
  revalidatePath("/dashboard");
  return { success: d.saved };
}
async function prepare<T>(schema: z.ZodType<T>, form: FormData, hr = false) {
  const context = await requireOrganisation();
  const d = timeDictionary(await getLocale());
  if (context.organisation.status !== "active")
    return { error: { error: d.inactive } as ActionState };
  if (hr && !canManage(context.membership.role))
    return { error: { error: d.denied } as ActionState };
  const values = Object.fromEntries(
    [...form.entries()].filter(
      ([key, value]) => !key.startsWith("$") && typeof value === "string",
    ),
  ) as Record<string, string>;
  const parsed = schema.safeParse(values);
  if (!parsed.success)
    return {
      error: {
        error: d.invalid,
        fields: z.flattenError(parsed.error).fieldErrors as Record<
          string,
          string[]
        >,
        values,
      } as ActionState,
    };
  return { context, data: parsed.data, values };
}
export async function submitLeave(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await prepare(leaveRequestSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  // The database also checks the selected employee's linked account or HR role.
  const { error } = await c.supabase.rpc("request_leave", {
    p_org: c.organisation.id,
    p_employee: v.employee_id,
    p_type: v.leave_type_id,
    p_start: v.start_date,
    p_end: v.end_date,
  });
  if (error) return { ...(await result(error)), values: p.values };
  await result(null);
  redirect(
    `/leave?employee=${v.employee_id}&month=${v.start_date.slice(0, 7)}&saved=1`,
  );
}
export async function reviewLeave(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await prepare(leaveDecisionSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("decide_leave", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
    p_status: v.status,
    p_note: v.note,
  });
  return { ...(await result(error)), ...(error ? { values: p.values } : {}) };
}
export async function updateLeaveType(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await prepare(leaveTypeSchema, form, true);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("save_leave_type", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_name: v.name,
    p_category: v.category,
    p_deducts: v.deducts_balance,
    p_active: v.active,
  });
  return { ...(await result(error)), ...(error ? { values: p.values } : {}) };
}
export async function updateAllowance(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await prepare(allowanceSchema, form, true);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("save_leave_allowance", {
    p_org: c.organisation.id,
    p_employee: v.employee_id,
    p_type: v.leave_type_id,
    p_year: v.year,
    p_allowance: v.allowance,
  });
  return { ...(await result(error)), ...(error ? { values: p.values } : {}) };
}
export async function updateCalendarDay(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await prepare(calendarDaySchema, form, true);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("save_calendar_day", {
    p_org: c.organisation.id,
    p_day: v.day,
    p_working: v.is_working,
    p_label: v.label,
  });
  return { ...(await result(error)), ...(error ? { values: p.values } : {}) };
}
export async function updateAttendance(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await prepare(attendanceSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  if (!canManage(c.membership.role) && c.membership.role !== "manager")
    return result({ code: "42501" });
  const { error } = await c.supabase.rpc("save_attendance", {
    p_org: c.organisation.id,
    p_employee: v.employee_id,
    p_day: v.day,
    p_planned: v.planned_hours,
    p_worked: v.worked_hours,
    p_absence: v.absence,
    p_version: v.version,
  });
  if (error) return { ...(await result(error)), values: p.values };
  await result(null);
  redirect(
    `/attendance?employee=${v.employee_id}&month=${v.day.slice(0, 7)}&saved=1`,
  );
}
