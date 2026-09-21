import { z } from "zod";
export const timeDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "2000-01-01" &&
      value <= "2200-12-31"
    );
  });
const version = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const leaveRequestSchema = z
  .object({
    employee_id: z.uuid(),
    leave_type_id: z.uuid(),
    start_date: timeDate,
    end_date: timeDate,
  })
  .refine(
    (v) =>
      v.end_date >= v.start_date &&
      v.end_date.slice(0, 4) === v.start_date.slice(0, 4),
    { path: ["end_date"] },
  );
export const leaveDecisionSchema = z
  .object({
    id: z.uuid(),
    version,
    status: z.enum(["approved", "rejected", "cancelled"]),
    note: z.string().trim().max(500),
  })
  .refine((v) => v.status === "approved" || v.note.length >= 5, {
    path: ["note"],
  });
export const allowanceSchema = z.object({
  employee_id: z.uuid(),
  leave_type_id: z.uuid(),
  year: z.coerce.number().int().min(2000).max(2200),
  allowance: z.coerce.number().int().min(0).max(730),
});
export const calendarDaySchema = z.object({
  day: timeDate,
  is_working: z.enum(["true", "false"]).transform((v) => v === "true"),
  label: z.string().trim().min(2).max(100),
});
export const leaveTypeSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  name: z.string().trim().min(2).max(80),
  category: z.enum(["annual", "medical", "unpaid", "other"]),
  deducts_balance: z.enum(["true", "false"]).transform((v) => v === "true"),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});
export const attendanceSchema = z
  .object({
    employee_id: z.uuid(),
    day: timeDate,
    planned_hours: z.coerce.number().min(0).max(24),
    worked_hours: z.coerce.number().min(0).max(24),
    absence: z.enum(["none", "medical", "unpaid", "other"]),
    version: z
      .union([z.literal(""), version])
      .transform((v) => (v === "" ? null : v)),
  })
  .refine(
    (v) =>
      v.absence === "none" || (v.worked_hours === 0 && v.planned_hours > 0),
    { path: ["absence"] },
  );
