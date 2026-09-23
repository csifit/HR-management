import { z } from "zod";
// Sources and deliberately supported cases: docs/payroll-rules.md.
export const PAYROLL_RULE_VERSION = "RO-2026-monthly-v2";
const amount = z.coerce.number().finite().int().min(0).max(1000000);
const yesNo = z.enum(["yes", "no"]);
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
    basic: amount.positive(),
    bonus: amount,
    hours: z.coerce.number().finite().positive().max(8).default(8),
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
  .refine((v) => v.basic * 8 >= (v.month < "2026-07" ? 4050 : 4325) * v.hours, {
    path: ["basic"],
    message: "Below minimum for the contractual hours",
  })
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
export type PayrollInput = z.infer<typeof payrollSchema>;
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
};
// Title IV fixed sums / income-tax base: exact 50 bani rounds down (art.66 / norm 4).
const fixedLei = (bani: number) => Math.ceil((bani - 50) / 100);
export function calculatePayroll(raw: unknown): PayrollResult {
  const v = payrollSchema.parse(raw),
    second = v.month >= "2026-07",
    minimum = second ? 4325 : 4050,
    cashGross = v.basic + v.bonus,
    gross = cashGross + v.meals;
  if (gross > 1000000) throw new Error("Gross limit exceeded");
  const primary = v.primary === "yes";
  const relief =
    primary &&
    v.hours === 8 &&
    v.reduced === "no" &&
    v.basic === minimum &&
    cashGross <= (second ? 4600 : 4300)
      ? second
        ? 200
        : 300
      : 0;
  // Meal vouchers are non-cash: CASS and income tax apply, CAS/CAM do not.
  const contributionBase = cashGross - relief;
  const healthBase = contributionBase + v.meals;
  const cas = Math.round((contributionBase * 25) / 100),
    cass = Math.round((healthBase * 10) / 100);
  const contributionFloor =
    v.floorException === "none" ? minimum - (second ? 200 : 300) : 0;
  // The employer pays the shortfall; it must never reduce employee net pay.
  const employerCas = Math.max(
    0,
    Math.round((contributionFloor * 25) / 100) - cas,
  );
  const employerCass = Math.max(
    0,
    Math.round((contributionFloor * 10) / 100) - cass,
  );
  const band = Math.max(0, Math.ceil((gross - minimum) / 50));
  const basePercent = [2000, 2500, 3000, 3500, 4500][v.dependants];
  const eligible = primary && gross <= minimum + 2000;
  const availableDeduction = Math.max(0, healthBase - cas - cass);
  const personalDeduction = Math.min(
    availableDeduction,
    eligible
      ? fixedLei((minimum * Math.max(0, basePercent - band * 50)) / 100)
      : 0,
  );
  const youngDeduction = Math.min(
    availableDeduction - personalDeduction,
    eligible && v.young === "yes" ? fixedLei(minimum * 15) : 0,
  );
  const childrenDeduction = Math.min(
    availableDeduction - personalDeduction - youngDeduction,
    primary ? v.children * 100 : 0,
  );
  const taxBase = Math.max(
    0,
    healthBase -
      cas -
      cass -
      personalDeduction -
      youngDeduction -
      childrenDeduction,
  );
  const incomeTax = fixedLei(taxBase * 10);
  const net = cashGross - cas - cass - incomeTax,
    cam = Math.round((contributionBase * 225) / 10000);
  if (net < 0 || v.advance > net)
    throw new Error("Cash pay cannot cover taxes or the entered advance");
  return {
    rules: PAYROLL_RULE_VERSION,
    month: v.month,
    gross,
    cashGross,
    meals: v.meals,
    relief,
    contributionBase,
    healthBase,
    cas,
    cass,
    personalDeduction,
    youngDeduction,
    childrenDeduction,
    taxBase,
    incomeTax,
    net,
    advance: v.advance,
    payable: net - v.advance,
    contributionFloor,
    employerCas,
    employerCass,
    cam,
    employerCost: gross + cam + employerCas + employerCass,
  };
}
