import { z } from "zod";
import { payrollAmount, type PayrollResult } from "./payroll.ts";
import {
  calculatePayrollRun,
  payrollRunInputSchema,
} from "./payroll-period.ts";

export const SETTLEMENT_RULE_VERSION = "RO-2026-monthly-v5";
export const payrollSettlementSchema = z
  .object({
    days: payrollAmount.refine((v) => v <= 365),
    dailyGross: payrollAmount,
    balanceReference: z.string().trim().max(120),
    rateReference: z.string().trim().max(120),
    otherGross: payrollAmount,
    otherReference: z.string().trim().max(120),
    confirmed: z.literal("on"),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.days === 0 && s.otherGross === 0)
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Enter a settlement amount",
      });
    if (
      s.days > 0 &&
      (s.dailyGross === 0 ||
        s.balanceReference.length < 3 ||
        s.rateReference.length < 3)
    )
      ctx.addIssue({
        code: "custom",
        path: ["rateReference"],
        message: "Confirm the balance and accountant-approved daily rate",
      });
    if (
      s.days === 0 &&
      (s.dailyGross !== 0 ||
        s.balanceReference !== "" ||
        s.rateReference !== "")
    )
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: "Unused leave facts require unused days",
      });
    if (
      s.otherGross > 0 ? s.otherReference.length < 3 : s.otherReference !== ""
    )
      ctx.addIssue({
        code: "custom",
        path: ["otherReference"],
        message: "Reference required for other taxable settlement pay",
      });
  });
export const payrollEntrySchema = payrollRunInputSchema
  .and(z.object({ settlement: payrollSettlementSchema.optional() }))
  .refine((v) => !v.settlement || !!v.period, {
    path: ["period"],
    message: "Settlement requires the checked employment period",
  });

// Multiply integer hundredths of a day by integer bani; exact half-ban rounds up.
export function unusedLeaveGross(days: number, dailyGross: number) {
  return (
    Math.floor(
      (Math.round(days * 100) * Math.round(dailyGross * 100) + 50) / 100,
    ) / 100
  );
}
export function calculatePayrollEntry(raw: unknown): PayrollResult {
  const input = payrollEntrySchema.parse(raw);
  if (!input.settlement) return calculatePayrollRun(input);
  const s = input.settlement,
    unused = unusedLeaveGross(s.days, s.dailyGross);
  const bonusBani =
    Math.round(input.bonus * 100) +
    Math.round(unused * 100) +
    Math.round(s.otherGross * 100);
  // All ordinary cash earnings share the same supported tax treatment. Preserve
  // the original bonus in the saved input; expose settlement components separately.
  const result = calculatePayrollRun({ ...input, bonus: bonusBani / 100 });
  return {
    ...result,
    rules: SETTLEMENT_RULE_VERSION,
    settlement: { unusedLeaveGross: unused, otherGross: s.otherGross },
  };
}

export function payrollSettlementFromForm(values: Record<string, unknown>) {
  if (values.includeSettlement !== "on") return undefined;
  return {
    days: values.settlementDays,
    dailyGross: values.settlementDailyGross,
    balanceReference: values.settlementBalanceReference,
    rateReference: values.settlementRateReference,
    otherGross: values.settlementOtherGross,
    otherReference: values.settlementOtherReference,
    confirmed: values.settlementConfirmed,
  };
}
