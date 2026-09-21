import { z } from "zod";
const date = z.iso.date().refine((v) => v >= "2000-01-01" && v <= "2200-12-31");
const optionalId = z
  .union([z.uuid(), z.literal("")])
  .transform((v) => v || null);
const version = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const optionalVersion = z
  .union([z.literal(""), version])
  .transform((v) => (v === "" ? null : v));
const active = z.enum(["true", "false"]).transform((v) => v === "true");
const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .transform(Number)
  .pipe(z.number().min(0).max(31000000));
export const benefitModelSchema = z.enum([
  "fixed_monthly",
  "per_worked_day",
  "annual_allowance",
  "flexible_budget",
  "non_financial",
]);
export const providerSchema = z.object({
  id: optionalId,
  version: optionalVersion,
  name: z.string().trim().min(2).max(100),
  adapter_key: z.enum(["custom", "pluxee", "edenred", "up_romania"]),
  active,
});
export const benefitSchema = z
  .object({
    id: optionalId,
    version: optionalVersion,
    provider_id: z.uuid(),
    name: z.string().trim().min(2).max(100),
    model: benefitModelSchema,
    amount: amount.refine((v) => v <= 1000000),
    active,
  })
  .refine((v) => v.model !== "non_financial" || v.amount === 0, {
    path: ["amount"],
  });
export const enrolmentSchema = z
  .object({
    id: optionalId,
    version: optionalVersion,
    employee_id: z.uuid(),
    benefit_id: z.uuid(),
    starts_on: date,
    ends_on: z.union([date, z.literal("")]).transform((v) => v || null),
    active,
  })
  .refine((v) => !v.ends_on || v.ends_on >= v.starts_on, { path: ["ends_on"] });
export const prepareBenefitsSchema = z.object({
  month: date.refine((v) => v.endsWith("-01")),
  version: optionalVersion,
  confirm: z.literal("on"),
});
export const reviewBenefitSchema = z.object({
  id: z.uuid(),
  version,
  included: active,
  amount,
  note: z.string().trim().min(5).max(500),
});
export const approveBenefitsSchema = z.object({
  id: z.uuid(),
  version,
  confirm: z.literal("on"),
});
