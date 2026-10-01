import { z } from "zod";
// Sources and deliberately supported cases: docs/payroll-rules.md.
export const PAYROLL_RULE_VERSION = "RO-2026-monthly-v3";
const hasTwoDecimals = (value: number) =>
  Math.round(value * 100) / 100 === value;
const bani = (value: number) => Math.round(value * 100);
const lei = (value: number) => value / 100;
const amount = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^\d+(?:[.,]\d{1,2})?$/)
      .transform((v) => Number(v.replace(",", "."))),
  ])
  .pipe(
    z
      .number()
      .finite()
      .min(0)
      .max(1000000)
      .refine(hasTwoDecimals, "Use at most two decimal places"),
  );
const yesNo = z.enum(["yes", "no"]);
export const payrollAmount = amount;
export const floorExceptions = [
  "none",
  "student",
  "apprentice",
  "reduced_hours",
  "retired",
  "multiple_contracts",
] as const;
export const payrollSchema = z
  .object({
    month: z.string().regex(/^2026-(0[1-9]|1[0-2])$/),
    basic: amount.refine((v) => v > 0),
    bonus: amount,
    hours: z.coerce
      .number()
      .finite()
      .positive()
      .max(8)
      .refine(hasTwoDecimals)
      .default(8),
    meals: amount.default(0),
    advance: amount.default(0),
    floorException: z.enum(floorExceptions).default("none"),
    evidence: z.string().trim().max(120).default(""),
    mealsReference: z.string().trim().max(120).default(""),
    advanceReference: z.string().trim().max(120).default(""),
    primary: yesNo,
    dependants: z.coerce.number().int().min(0).max(4),
    young: yesNo,
    children: z.coerce.number().int().min(0).max(20),
    reduced: yesNo,
    standard: z.literal("on"),
  })
  .refine(
    (v) =>
      bani(v.basic) * 800 >=
      bani(v.month < "2026-07" ? 4050 : 4325) * bani(v.hours),
    {
      path: ["basic"],
      message: "Below minimum for the contractual hours",
    },
  )
  .refine(
    (v) =>
      v.primary === "yes" ||
      (v.dependants === 0 && v.young === "no" && v.children === 0),
    { path: ["primary"], message: "Deductions require primary employment" },
  )
  .refine(
    (v) =>
      v.meals === 0 || (v.primary === "yes" && v.mealsReference.length >= 3),
    {
      path: ["mealsReference"],
      message:
        "Meal vouchers require primary employment and an issuance reference",
    },
  )
  .refine((v) => v.advance === 0 || v.advanceReference.length >= 3, {
    path: ["advanceReference"],
    message: "Reference required for an advance already paid",
  })
  .refine(
    (v) =>
      v.floorException === "none" || (v.hours < 8 && v.evidence.length >= 3),
    {
      path: ["evidence"],
      message: "A part-time floor exception requires supporting evidence",
    },
  );
export type PayrollPeriod = {
  start: string;
  end: string;
  monthWorkingDays: number;
  employedWorkingDays: number;
  monthCalendarDays: number;
  employedCalendarDays: number;
};
export type PayrollInput = z.infer<typeof payrollSchema> & {
  period?: PayrollPeriod;
  deductionEmployer?: "this" | "other";
  deductionReference?: string;
  settlement?: PayrollSettlement;
  annualLeave?: PayrollAnnualLeave;
};
export type PayrollAnnualLeave = {
  requests: {
    id: string;
    dates: string[];
    dailyGross: number;
    rateReference: string;
  }[];
  confirmed: "on";
};
export type PayrollSettlement = {
  days: number;
  dailyGross: number;
  balanceReference: string;
  rateReference: string;
  otherGross: number;
  otherReference: string;
  confirmed: "on";
};
export type PayrollResult = {
  rules: string;
  month: string;
  gross: number;
  cashGross: number;
  meals: number;
  relief: number;
  contributionBase: number;
  healthBase: number;
  cas: number;
  cass: number;
  personalDeduction: number;
  youngDeduction: number;
  childrenDeduction: number;
  taxBaseBeforeRounding: number;
  taxBase: number;
  incomeTax: number;
  net: number;
  advance: number;
  payable: number;
  contributionFloor: number;
  employerCas: number;
  employerCass: number;
  cam: number;
  employerCost: number;
  settlement?: { unusedLeaveGross: number; otherGross: number };
  annualLeave?: { workedBasic: number; leaveGross: number };
};
// All operands are bounded safe integers. Round only at the defined fiscal step.
// Title IV: exact half rounds down; social contributions: exact half rounds up.
function roundedRatio(numerator: number, denominator: number, halfUp = false) {
  const remainder = numerator % denominator;
  return (
    Math.floor(numerator / denominator) +
    (remainder * 2 > denominator || (halfUp && remainder * 2 === denominator)
      ? 1
      : 0)
  );
}
export function calculatePayroll(raw: unknown): PayrollResult {
  const v = payrollSchema.parse(raw),
    second = v.month >= "2026-07",
    minimum = bani(second ? 4325 : 4050),
    cashGross = bani(v.basic) + bani(v.bonus),
    gross = cashGross + bani(v.meals);
  if (gross > bani(1000000)) throw new Error("Gross limit exceeded");
  const primary = v.primary === "yes";
  const relief =
    primary &&
    v.hours === 8 &&
    v.reduced === "no" &&
    bani(v.basic) === minimum &&
    cashGross <= bani(second ? 4600 : 4300)
      ? second
        ? bani(200)
        : bani(300)
      : 0;
  // Meal vouchers are non-cash: CASS and income tax apply, CAS/CAM do not.
  const contributionBase = cashGross - relief;
  const healthBase = contributionBase + bani(v.meals);
  const cas = bani(roundedRatio(contributionBase * 25, 10000, true)),
    cass = bani(roundedRatio(healthBase * 10, 10000, true));
  const contributionFloor =
    v.floorException === "none" ? minimum - bani(second ? 200 : 300) : 0;
  // The employer pays the shortfall; it must never reduce employee net pay.
  const employerCas = Math.max(
    0,
    bani(roundedRatio(contributionFloor * 25, 10000, true)) - cas,
  );
  const employerCass = Math.max(
    0,
    bani(roundedRatio(contributionFloor * 10, 10000, true)) - cass,
  );
  const band = Math.max(0, Math.ceil((gross - minimum) / bani(50)));
  const basePercent = [2000, 2500, 3000, 3500, 4500][v.dependants];
  const eligible = primary && gross <= minimum + bani(2000);
  const availableDeduction = Math.max(0, healthBase - cas - cass);
  const personalDeduction = Math.min(
    availableDeduction,
    eligible
      ? bani(
          roundedRatio(minimum * Math.max(0, basePercent - band * 50), 1000000),
        )
      : 0,
  );
  const youngDeduction = Math.min(
    availableDeduction - personalDeduction,
    eligible && v.young === "yes" ? bani(roundedRatio(minimum * 15, 10000)) : 0,
  );
  const childrenDeduction = Math.min(
    availableDeduction - personalDeduction - youngDeduction,
    primary ? bani(v.children * 100) : 0,
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
  // Norm 4 (art.64): round the taxable base to lei before applying income tax.
  const taxBase = bani(roundedRatio(taxBaseBeforeRounding, 100));
  const incomeTax = bani(roundedRatio(taxBase * 10, 10000));
  const net = cashGross - cas - cass - incomeTax,
    cam = bani(roundedRatio(contributionBase * 225, 1000000, true));
  if (net < 0 || bani(v.advance) > net)
    throw new Error("Cash pay cannot cover taxes or the entered advance");
  return {
    rules: PAYROLL_RULE_VERSION,
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
    contributionFloor: lei(contributionFloor),
    employerCas: lei(employerCas),
    employerCass: lei(employerCass),
    cam: lei(cam),
    employerCost: lei(gross + cam + employerCas + employerCass),
  };
}
