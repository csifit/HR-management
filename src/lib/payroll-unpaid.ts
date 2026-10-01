import { z } from "zod";
import { type PayrollInput, type PayrollResult } from "./payroll.ts";
import {
  payrollWithAnnualSchema,
  calculatePayrollWithLeave,
  annualPayrollComponents,
} from "./payroll-annual-leave.ts";
import { unusedLeaveGross } from "./payroll-settlement.ts";

export const UNPAID_PAYROLL_RULE_VERSION = "RO-2026-monthly-v7";
export class UnpaidPayrollReview extends Error {}
const date = z
  .string()
  .regex(/^2026-(0[1-9]|1[0-2])-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return (
      Number.isFinite(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      ![0, 6].includes(d.getUTCDay())
    );
  });
const dates = z
  .array(date)
  .max(31)
  .refine((v) => v.every((d, i) => i === 0 || d > v[i - 1]));
export const payrollUnpaidSchema = z
  .object({
    requests: z
      .array(z.object({ id: z.uuid(), dates: dates.nonempty() }).strict())
      .max(31),
    absences: dates,
    suspendedDates: dates,
    reviewReference: z.string().trim().min(3).max(120),
    suspensionReference: z.string().trim().max(120),
    confirmed: z.literal("on"),
  })
  .strict();
export const payrollWithUnpaidSchema = payrollWithAnnualSchema
  .and(z.object({ unpaid: payrollUnpaidSchema.optional() }))
  .superRefine((v, ctx) => {
    if (!v.unpaid) return;
    const u = v.unpaid,
      p = v.period,
      all = [...u.requests.flatMap((r) => r.dates), ...u.absences],
      annual = v.annualLeave?.requests.flatMap((r) => r.dates) ?? [],
      ids = u.requests.map((r) => r.id);
    if (
      !p ||
      !all.length ||
      new Set(all).size !== all.length ||
      all.length + annual.length > p.employedWorkingDays ||
      all.some(
        (d) =>
          d.slice(0, 7) !== v.month ||
          d < p.start ||
          d > p.end ||
          annual.includes(d),
      ) ||
      ids.some((id, i) => i > 0 && id <= ids[i - 1]) ||
      u.suspendedDates.some((d) => !all.includes(d)) ||
      (u.suspendedDates.length
        ? u.suspensionReference.length < 3
        : u.suspensionReference !== "")
    )
      ctx.addIssue({
        code: "custom",
        path: ["unpaid"],
        message:
          "Review unique unpaid dates, employment and suspension evidence",
      });
  });
const bani = (n: number) => Math.round(n * 100),
  lei = (n: number) => n / 100;
const ratio = (n: number, d: number, halfUp = false) =>
  Math.floor(n / d) +
  ((n % d) * 2 > d || (halfUp && (n % d) * 2 === d) ? 1 : 0);
function unpaidComponents(v: PayrollInput) {
  const p = v.period!,
    u = v.unpaid!,
    annualDays =
      v.annualLeave?.requests.reduce((n, r) => n + r.dates.length, 0) ?? 0;
  const count =
    u.requests.reduce((n, r) => n + r.dates.length, 0) + u.absences.length;
  const before = ratio(
    bani(v.basic) * (p.employedWorkingDays - annualDays),
    p.monthWorkingDays,
    true,
  );
  const worked = ratio(
    bani(v.basic) * (p.employedWorkingDays - annualDays - count),
    p.monthWorkingDays,
    true,
  );
  return {
    workedBasic: lei(worked),
    unpaidBasic: lei(before - worked),
    activeWorkingDays: p.employedWorkingDays - u.suspendedDates.length,
  };
}
export function payrollUnpaidFromForm(values: Record<string, unknown>) {
  if (values.unpaidFacts === undefined) return undefined;
  const facts = JSON.parse(String(values.unpaidFacts));
  if (!Array.isArray(facts?.requests) || !Array.isArray(facts?.absences))
    throw new Error("Invalid unpaid facts");
  const all = [
    ...facts.requests.flatMap((r: { dates: string[] }) => r.dates),
    ...facts.absences,
  ].sort();
  return {
    ...facts,
    suspendedDates: all.filter(
      (_: string, i: number) => values[`unpaidSuspended${i}`] === "on",
    ),
    reviewReference: values.unpaidReference,
    suspensionReference: values.suspensionReference ?? "",
    confirmed: values.unpaidConfirmed,
  };
}

// Separate v7 calculation; older rules are retained by dispatch.
export function calculatePayrollAdjusted(raw: unknown): PayrollResult {
  const v = payrollWithUnpaidSchema.parse(raw);
  if (!v.unpaid) return calculatePayrollWithLeave(v);
  const unpaid = unpaidComponents(v),
    annual = v.annualLeave ? annualPayrollComponents(v) : undefined,
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
      bani(unpaid.workedBasic) +
      bani(v.bonus) +
      bani(annual?.leaveGross ?? 0) +
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
  if (reliefEligible || (cashGross === 0 && unpaid.activeWorkingDays > 0))
    throw new UnpaidPayrollReview(
      "Unpaid minimum-wage relief or zero-cash active employment requires accountant review",
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
            (minimum - bani(second ? 200 : 300)) * unpaid.activeWorkingDays,
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
    rules: UNPAID_PAYROLL_RULE_VERSION,
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
    unpaid,
    ...(annual
      ? {
          annualLeave: {
            workedBasic: unpaid.workedBasic,
            leaveGross: annual.leaveGross,
          },
        }
      : {}),
    ...(settlement ? { settlement } : {}),
  };
}
