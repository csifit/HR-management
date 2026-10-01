import { z } from "zod";
import {
  payrollSchema,
  calculatePayroll,
  type PayrollInput,
  type PayrollResult,
  type PayrollPeriod,
} from "./payroll.ts";

export const PERIOD_PAYROLL_RULE_VERSION = "RO-2026-monthly-v4";
const date = z
  .string()
  .regex(/^2026-(0[1-9]|1[0-2])-\d{2}$/)
  .refine((v) => {
    const day = new Date(`${v}T12:00:00Z`);
    return (
      Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === v
    );
  });
const days = z.number().int().positive().max(31);
export const payrollPeriodSchema = z
  .object({
    start: date,
    end: date,
    monthWorkingDays: days,
    employedWorkingDays: days,
    monthCalendarDays: days,
    employedCalendarDays: days,
  })
  .strict()
  .superRefine((p, ctx) => {
    const length =
      Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400000) + 1;
    const calendar = new Date(
      Date.UTC(2026, Number(p.start.slice(5, 7)), 0),
    ).getUTCDate();
    const weekdays = (start: string, count: number) => {
      let total = 0;
      for (let i = 0; i < count; i++) {
        const day = new Date(Date.parse(start) + i * 86400000).getUTCDay();
        if (day !== 0 && day !== 6) total++;
      }
      return total;
    };
    if (
      p.start > p.end ||
      p.start.slice(0, 7) !== p.end.slice(0, 7) ||
      p.employedCalendarDays !== length ||
      p.monthCalendarDays !== calendar ||
      p.employedWorkingDays > p.monthWorkingDays ||
      p.employedWorkingDays > p.employedCalendarDays ||
      p.monthWorkingDays > weekdays(`${p.start.slice(0, 7)}-01`, calendar) ||
      p.employedWorkingDays > weekdays(p.start, length) ||
      (p.employedCalendarDays === p.monthCalendarDays &&
        p.employedWorkingDays !== p.monthWorkingDays)
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid saved employment period",
      });
  });
export const payrollRunInputSchema = payrollSchema
  .and(
    z.object({
      period: payrollPeriodSchema.optional(),
      deductionEmployer: z.enum(["this", "other"]).optional(),
      deductionReference: z.string().trim().max(120).optional(),
    }),
  )
  .superRefine((v, ctx) => {
    if (!v.period) {
      if (
        v.deductionEmployer !== undefined ||
        v.deductionReference !== undefined
      )
        ctx.addIssue({ code: "custom", message: "Period required" });
      return;
    }
    if (
      v.period.start.slice(0, 7) !== v.month ||
      !v.deductionEmployer ||
      v.deductionReference === undefined ||
      (v.primary === "yes" &&
        v.period.employedCalendarDays < v.period.monthCalendarDays &&
        v.deductionReference.length < 3) ||
      (v.primary === "no" && v.deductionEmployer !== "other")
    )
      ctx.addIssue({
        code: "custom",
        message: "Review employment and monthly deduction evidence",
      });
  });
export type PayrollPeriodContext = {
  contract_id: string;
  contract_number: string;
  basic: number;
  hours: number;
  period: PayrollPeriod;
};
const bani = (v: number) => Math.round(v * 100);
const lei = (v: number) => v / 100;
const ratio = (n: number, d: number, halfUp = false) =>
  Math.floor(n / d) +
  ((n % d) * 2 > d || (halfUp && (n % d) * 2 === d) ? 1 : 0);

export function earnedBasicPay(input: PayrollInput) {
  return input.period
    ? lei(
        ratio(
          bani(input.basic) * input.period.employedWorkingDays,
          input.period.monthWorkingDays,
          true,
        ),
      )
    : input.basic;
}
export class PartialPayrollReliefReview extends Error {}

// v3 remains untouched for existing approved snapshots and legacy full-month inputs.
export function calculatePayrollRun(raw: unknown): PayrollResult {
  const v = payrollRunInputSchema.parse(raw);
  if (!v.period) return calculatePayroll(v);
  const p = v.period,
    second = v.month >= "2026-07",
    minimum = bani(second ? 4325 : 4050);
  const primary = v.primary === "yes",
    deductible = primary && v.deductionEmployer === "this";
  const cashGross = bani(earnedBasicPay(v)) + bani(v.bonus),
    gross = cashGross + bani(v.meals);
  if (gross > bani(1000000)) throw new Error("Gross limit exceeded");
  const reliefEligible =
    primary &&
    v.hours === 8 &&
    v.reduced === "no" &&
    bani(v.basic) === minimum &&
    cashGross <= bani(second ? 4600 : 4300);
  // Exact relief rounding for partial months awaits independent confirmation.
  if (reliefEligible && p.employedCalendarDays < p.monthCalendarDays)
    throw new PartialPayrollReliefReview(
      "Partial-month minimum-wage relief requires accountant review",
    );
  const relief = reliefEligible ? bani(second ? 200 : 300) : 0;
  const contributionBase = cashGross - relief,
    healthBase = contributionBase + bani(v.meals);
  const cas = bani(ratio(contributionBase * 25, 10000, true)),
    cass = bani(ratio(healthBase * 10, 10000, true));
  const floor =
    v.floorException === "none"
      ? bani(
          ratio(
            (minimum - bani(second ? 200 : 300)) * p.employedWorkingDays,
            100 * p.monthWorkingDays,
            true,
          ),
        )
      : 0;
  const employerCas = Math.max(0, bani(ratio(floor * 25, 10000, true)) - cas),
    employerCass = Math.max(0, bani(ratio(floor * 10, 10000, true)) - cass);
  const band = Math.max(0, Math.ceil((gross - minimum) / bani(50))),
    percent = [2000, 2500, 3000, 3500, 4500][v.dependants];
  const eligible = deductible && gross <= minimum + bani(2000),
    available = Math.max(0, healthBase - cas - cass);
  const personalDeduction = Math.min(
    available,
    eligible
      ? bani(ratio(minimum * Math.max(0, percent - band * 50), 1000000))
      : 0,
  );
  const youngDeduction = Math.min(
    available - personalDeduction,
    eligible && v.young === "yes" ? bani(ratio(minimum * 15, 10000)) : 0,
  );
  const childrenDeduction = Math.min(
    available - personalDeduction - youngDeduction,
    deductible ? bani(v.children * 100) : 0,
  );
  const taxBaseBeforeRounding = Math.max(
    0,
    healthBase -
      cas -
      cass -
      personalDeduction -
      youngDeduction -
      childrenDeduction,
  );
  const taxBase = bani(ratio(taxBaseBeforeRounding, 100)),
    incomeTax = bani(ratio(taxBase * 10, 10000));
  const net = cashGross - cas - cass - incomeTax,
    cam = bani(ratio(contributionBase * 225, 1000000, true));
  if (net < 0 || bani(v.advance) > net)
    throw new Error("Insufficient cash pay");
  return {
    rules: PERIOD_PAYROLL_RULE_VERSION,
    month: v.month,
    gross: lei(gross),
    cashGross: lei(cashGross),
    meals: v.meals,
    relief: lei(relief),
    contributionBase: lei(contributionBase),
    healthBase: lei(healthBase),
    cas: lei(cas),
    cass: lei(cass),
    personalDeduction: lei(personalDeduction),
    youngDeduction: lei(youngDeduction),
    childrenDeduction: lei(childrenDeduction),
    taxBaseBeforeRounding: lei(taxBaseBeforeRounding),
    taxBase: lei(taxBase),
    incomeTax: lei(incomeTax),
    net: lei(net),
    advance: v.advance,
    payable: lei(net - bani(v.advance)),
    contributionFloor: lei(floor),
    employerCas: lei(employerCas),
    employerCass: lei(employerCass),
    cam: lei(cam),
    employerCost: lei(gross + cam + employerCas + employerCass),
  };
}
