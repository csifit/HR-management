import { z } from "zod";
// Sources and deliberately supported cases: docs/payroll-rules.md.
export const PAYROLL_RULE_VERSION = "RO-2026-standard-v1";
const amount = z.coerce.number().finite().int().min(0).max(1000000);
const yesNo = z.enum(["yes", "no"]);
export const payrollSchema = z
  .object({
    month: z.string().regex(/^2026-(0[1-9]|1[0-2])$/),
    basic: amount.positive(),
    bonus: amount,
    primary: yesNo,
    dependants: z.coerce.number().int().min(0).max(4),
    young: yesNo,
    children: z.coerce.number().int().min(0).max(20),
    reduced: yesNo,
    standard: z.literal("on"),
  })
  .refine((v) => v.basic >= (v.month < "2026-07" ? 4050 : 4325), {
    path: ["basic"],
    message: "Below full-time minimum",
  })
  .refine(
    (v) =>
      v.primary === "yes" ||
      (v.dependants === 0 && v.young === "no" && v.children === 0),
    { path: ["primary"], message: "Deductions require primary employment" },
  );
export type PayrollInput = z.infer<typeof payrollSchema>;
export type PayrollResult = {
  rules: string;
  month: string;
  gross: number;
  relief: number;
  contributionBase: number;
  cas: number;
  cass: number;
  personalDeduction: number;
  youngDeduction: number;
  childrenDeduction: number;
  taxBase: number;
  incomeTax: number;
  net: number;
  cam: number;
  employerCost: number;
};
// Title IV fixed sums / income-tax base: exact 50 bani rounds down (art.66 / norm 4).
const fixedLei = (bani: number) => Math.ceil((bani - 50) / 100);
export function calculatePayroll(raw: unknown): PayrollResult {
  const v = payrollSchema.parse(raw),
    second = v.month >= "2026-07",
    minimum = second ? 4325 : 4050,
    gross = v.basic + v.bonus;
  if (gross > 1000000) throw new Error("Gross limit exceeded");
  const primary = v.primary === "yes";
  const relief =
    primary &&
    v.reduced === "no" &&
    v.basic === minimum &&
    gross <= (second ? 4600 : 4300)
      ? second
        ? 200
        : 300
      : 0;
  const contributionBase = gross - relief;
  const cas = Math.round((contributionBase * 25) / 100),
    cass = Math.round((contributionBase * 10) / 100);
  const band = Math.max(0, Math.ceil((gross - minimum) / 50));
  const basePercent = [2000, 2500, 3000, 3500, 4500][v.dependants];
  const eligible = primary && gross <= minimum + 2000;
  const availableDeduction = Math.max(0, contributionBase - cas - cass);
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
    contributionBase -
      cas -
      cass -
      personalDeduction -
      youngDeduction -
      childrenDeduction,
  );
  const incomeTax = fixedLei(taxBase * 10);
  const net = gross - cas - cass - incomeTax,
    cam = Math.round((contributionBase * 225) / 10000);
  return {
    rules: PAYROLL_RULE_VERSION,
    month: v.month,
    gross,
    relief,
    contributionBase,
    cas,
    cass,
    personalDeduction,
    youngDeduction,
    childrenDeduction,
    taxBase,
    incomeTax,
    net,
    cam,
    employerCost: gross + cam,
  };
}
