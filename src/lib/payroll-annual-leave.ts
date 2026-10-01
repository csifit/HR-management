import { z } from "zod";
import {
  payrollAmount,
  type PayrollInput,
  type PayrollResult,
} from "./payroll.ts";
import {
  payrollEntrySchema,
  calculatePayrollEntry,
  unusedLeaveGross,
} from "./payroll-settlement.ts";
import { PartialPayrollReliefReview } from "./payroll-period.ts";

export const ANNUAL_LEAVE_RULE_VERSION = "RO-2026-monthly-v6";
const leaveDate = z
  .string()
  .regex(/^2026-(0[1-9]|1[0-2])-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return (
      Number.isFinite(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      d.getUTCDay() !== 0 &&
      d.getUTCDay() !== 6
    );
  });
export const payrollAnnualLeaveSchema = z
  .object({
    requests: z
      .array(
        z
          .object({
            id: z.uuid(),
            dates: z.array(leaveDate).min(1).max(31),
            dailyGross: payrollAmount.refine((v) => v > 0),
            rateReference: z.string().trim().min(3).max(120),
          })
          .strict(),
      )
      .min(1)
      .max(31),
    confirmed: z.literal("on"),
  })
  .strict();
export const payrollWithAnnualSchema = payrollEntrySchema
  .and(z.object({ annualLeave: payrollAnnualLeaveSchema.optional() }))
  .superRefine((v, ctx) => {
    if (!v.annualLeave) return;
    const dates = v.annualLeave.requests.flatMap((r) => r.dates),
      ids = v.annualLeave.requests.map((r) => r.id);
    if (
      !v.period ||
      dates.length > v.period.employedWorkingDays ||
      new Set(dates).size !== dates.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id, i) => i > 0 && id <= ids[i - 1]) ||
      dates.some(
        (day) =>
          day.slice(0, 7) !== v.month ||
          day < v.period!.start ||
          day > v.period!.end,
      ) ||
      v.annualLeave.requests.some((r) =>
        r.dates.some((day, i) => i > 0 && day <= r.dates[i - 1]),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["annualLeave"],
        message: "Review unique approved leave dates within employment",
      });
  });
const bani = (v: number) => Math.round(v * 100),
  lei = (v: number) => v / 100;
const ratio = (n: number, d: number, halfUp = false) =>
  Math.floor(n / d) +
  ((n % d) * 2 > d || (halfUp && (n % d) * 2 === d) ? 1 : 0);
export function annualPayrollComponents(input: PayrollInput) {
  const p = input.period!,
    a = input.annualLeave!;
  const leaveDays = a.requests.reduce((n, r) => n + r.dates.length, 0);
  const leaveGross = a.requests.reduce((n, r) => {
    const gross = bani(r.dailyGross) * r.dates.length;
    if (
      gross <
      ratio(bani(input.basic) * r.dates.length, p.monthWorkingDays, true)
    )
      throw new Error(
        "Approved leave rate is below the current basic-pay minimum",
      );
    return n + gross;
  }, 0);
  return {
    workedBasic: lei(
      ratio(
        bani(input.basic) * (p.employedWorkingDays - leaveDays),
        p.monthWorkingDays,
        true,
      ),
    ),
    leaveGross: lei(leaveGross),
  };
}
export function payrollAnnualFromForm(values: Record<string, unknown>) {
  if (values.annualRequests === undefined) return undefined;
  const raw = JSON.parse(String(values.annualRequests));
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 31)
    throw new Error("Invalid annual leave requests");
  return {
    confirmed: values.annualConfirmed,
    requests: raw.map((r, i) => ({
      id: r?.id,
      dates: r?.dates,
      dailyGross: values[`annualRate${i}`],
      rateReference: values[`annualReference${i}`],
    })),
  };
}

// Separate v6 tax calculation; prior v3/v4/v5 dispatch is unchanged.
export function calculatePayrollWithLeave(raw: unknown): PayrollResult {
  const v = payrollWithAnnualSchema.parse(raw);
  if (!v.annualLeave) return calculatePayrollEntry(v);
  const annual = annualPayrollComponents(v),
    settlement = v.settlement
      ? {
          unusedLeaveGross: unusedLeaveGross(
            v.settlement.days,
            v.settlement.dailyGross,
          ),
          otherGross: v.settlement.otherGross,
        }
      : undefined;
  const p = v.period!,
    second = v.month >= "2026-07",
    minimum = bani(second ? 4325 : 4050);
  const primary = v.primary === "yes",
    deductible = primary && v.deductionEmployer === "this";
  const cashGross =
      bani(annual.workedBasic) +
      bani(v.bonus) +
      bani(annual.leaveGross) +
      bani(settlement?.unusedLeaveGross ?? 0) +
      bani(settlement?.otherGross ?? 0),
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
    rules: ANNUAL_LEAVE_RULE_VERSION,
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
    annualLeave: annual,
    ...(settlement ? { settlement } : {}),
  };
}
