import { z } from "zod";
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2200-12-31"
    );
  });
const optionalId = z
  .union([z.uuid(), z.literal("")])
  .transform((value) => value || null);
export const organisationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  cui: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(RO)?[0-9]{2,10}$/),
});
export const employeeSchema = z.object({
  first_name: requiredText(80),
  last_name: requiredText(80),
  email: z.email().max(254).trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((value) => value || null),
  job_title: z.string().trim().min(2).max(120),
  department: requiredText(100),
  workplace: requiredText(160),
  start_date: date,
  status: z.enum(["active", "onboarding", "suspended", "terminated"]),
  manager_user_id: optionalId,
});
export const contractSchema = z
  .object({
    contract_number: requiredText(80),
    start_date: date,
    end_date: z
      .union([date, z.literal("")])
      .transform((value) => value || null),
    job_title: z.string().trim().min(2).max(120),
    cor_code: z.string().regex(/^\d{6}$/),
    contract_type: z.enum(["indefinite", "fixed_term"]),
    working_hours: z.coerce.number().positive().max(24),
    workplace: requiredText(160),
    gross_salary: z.coerce.number().positive().max(9999999999.99),
    probation_days: z.coerce.number().int().min(0).max(365),
    status: z.enum(["draft", "active", "suspended", "terminated"]),
  })
  .superRefine((value, ctx) => {
    if (value.contract_type === "fixed_term" && !value.end_date)
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "required" });
    if (value.contract_type === "indefinite" && value.end_date)
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "indefinite",
      });
    if (value.end_date && value.end_date < value.start_date)
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "date_order",
      });
  });
export const memberSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(["organisation_owner", "hr_manager", "manager", "employee"]),
  employee_id: optionalId,
});
export const loginSchema = z.object({
  email: z.email().trim(),
  password: z.string().min(1).max(200),
});
export const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.email().trim(),
  password: z.string().min(10).max(200),
});
export const passwordSchema = z.string().min(10).max(200);
export const idSchema = z.uuid();
