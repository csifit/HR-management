import { z } from "zod";
import { payrollPeriodSchema } from "./payroll-period.ts";
import { payrollPeriodDictionary } from "./payroll-period-i18n.ts";
import { payrollSettlementDictionary } from "./payroll-settlement-i18n.ts";
import { payrollAnnualDictionary } from "./payroll-annual-i18n.ts";
import {
  payrollRows,
  payrollDictionary,
  floorExceptionLabels,
} from "./payroll-i18n.ts";
import type {
  PayrollHandoverPayload,
  PayrollMoneyKey,
} from "./payroll-handover-types";

export const HANDOVER_FORMAT = "HRConnector-accountant-v1";
export const HANDOVER_PERIOD_FORMAT = "HRConnector-accountant-v2";
export const HANDOVER_SETTLEMENT_FORMAT = "HRConnector-accountant-v3";
export const HANDOVER_ANNUAL_FORMAT = "HRConnector-accountant-v4";
const textField = z.string().max(500);
const savedMoney = z
  .number()
  .finite()
  .min(0)
  .max(2000000)
  .refine((n) => Math.round(n * 100) / 100 === n);
// Saved v3/v4/v5/v6 formats, independent of later calculator validation/rules.
// No coercion, defaults or text trimming may change approved facts on export.
const savedInput = z.object({
  month: z.string().regex(/^2026-(0[1-9]|1[0-2])$/),
  basic: savedMoney.positive().max(1000000),
  bonus: savedMoney.max(1000000),
  meals: savedMoney.max(1000000),
  advance: savedMoney.max(1000000),
  hours: savedMoney.positive().max(8),
  primary: z.enum(["yes", "no"]),
  young: z.enum(["yes", "no"]),
  reduced: z.enum(["yes", "no"]),
  dependants: z.number().int().min(0).max(4),
  children: z.number().int().min(0).max(20),
  floorException: z.enum([
    "none",
    "student",
    "apprentice",
    "reduced_hours",
    "retired",
    "multiple_contracts",
  ]),
  evidence: z.string().max(120),
  mealsReference: z.string().max(120),
  advanceReference: z.string().max(120),
  standard: z.literal("on"),
  period: payrollPeriodSchema.optional(),
  deductionEmployer: z.enum(["this", "other"]).optional(),
  deductionReference: z.string().max(120).optional(),
  annualLeave: z
    .object({
      confirmed: z.literal("on"),
      requests: z
        .array(
          z
            .object({
              id: z.uuid(),
              dates: z
                .array(z.string().regex(/^2026-(0[1-9]|1[0-2])-\d{2}$/))
                .min(1)
                .max(31),
              dailyGross: savedMoney.positive().max(1000000),
              rateReference: z.string().min(3).max(120),
            })
            .strict(),
        )
        .min(1)
        .max(31),
    })
    .strict()
    .optional(),
  settlement: z
    .object({
      days: savedMoney.max(365),
      dailyGross: savedMoney.max(1000000),
      balanceReference: z.string().max(120),
      rateReference: z.string().max(120),
      otherGross: savedMoney.max(1000000),
      otherReference: z.string().max(120),
      confirmed: z.literal("on"),
    })
    .strict()
    .optional(),
});
const savedResult = z.object({
  rules: z.enum([
    "RO-2026-monthly-v3",
    "RO-2026-monthly-v4",
    "RO-2026-monthly-v5",
    "RO-2026-monthly-v6",
  ]),
  month: z.string(),
  ...Object.fromEntries(payrollRows.map((key) => [key, savedMoney])),
  annualLeave: z
    .object({
      workedBasic: savedMoney.max(1000000),
      leaveGross: savedMoney.positive().max(1000000),
    })
    .strict()
    .optional(),
  settlement: z
    .object({
      unusedLeaveGross: savedMoney.max(1000000),
      otherGross: savedMoney.max(1000000),
    })
    .strict()
    .optional(),
});
const payloadSchema = z.object({
  export_id: z.uuid(),
  prepared_at: z.iso.datetime({ offset: true }),
  organisation_id: z.uuid(),
  locale: z.enum(["ro", "en"]),
  format_version: z.enum([
    HANDOVER_FORMAT,
    HANDOVER_PERIOD_FORMAT,
    HANDOVER_SETTLEMENT_FORMAT,
    HANDOVER_ANNUAL_FORMAT,
  ]),
  run: z.object({
    id: z.uuid(),
    month: z.string().regex(/^2026-(0[1-9]|1[0-2])-01$/),
    revision: z.number().int().positive(),
    version: z.number().int().positive(),
    approved_at: z.iso.datetime({ offset: true }),
    previous_run_id: z.uuid().nullable(),
  }),
  latest_approved_run_id: z.uuid(),
  latest_approved_revision: z.number().int().positive(),
  is_historical: z.boolean(),
  has_open_correction: z.boolean(),
  company: z.object({
    name: textField,
    cui: textField,
    address: z.string().max(2000),
  }),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        employee_id: z.uuid(),
        employee_name: textField,
        department: textField,
        job_title: textField,
        contract_number: textField,
        input: savedInput,
        result: savedResult,
      }),
    )
    .min(1)
    .max(200),
});

// Validate the approved snapshot, but never calculate tax again when exporting it.
export function validatePayrollHandover(raw: unknown): PayrollHandoverPayload {
  const data = payloadSchema.parse(raw) as PayrollHandoverPayload;
  if (
    new TextEncoder().encode(JSON.stringify(data)).length > 2 * 1024 * 1024 ||
    new Set(data.items.map((i) => i.id)).size !== data.items.length ||
    new Set(data.items.map((i) => i.employee_id)).size !== data.items.length ||
    data.items.some(
      (i) =>
        i.input.month !== data.run.month.slice(0, 7) ||
        i.result.month !== i.input.month ||
        (i.result.rules === "RO-2026-monthly-v4" ||
        i.result.rules === "RO-2026-monthly-v5" ||
        i.result.rules === "RO-2026-monthly-v6"
          ? !i.input.period ||
            i.input.period.start.slice(0, 7) !== i.input.month ||
            !i.input.deductionEmployer ||
            i.input.deductionReference === undefined ||
            i.input.deductionReference !== i.input.deductionReference.trim() ||
            (i.input.primary === "no" &&
              i.input.deductionEmployer !== "other") ||
            (i.input.primary === "yes" &&
              i.input.period.employedCalendarDays <
                i.input.period.monthCalendarDays &&
              i.input.deductionReference.length < 3)
          : i.input.period !== undefined ||
            i.input.deductionEmployer !== undefined ||
            i.input.deductionReference !== undefined) ||
        (i.result.rules === "RO-2026-monthly-v5" ||
        (i.result.rules === "RO-2026-monthly-v6" &&
          i.input.settlement !== undefined)
          ? !validSavedSettlement(i)
          : i.input.settlement !== undefined ||
            i.result.settlement !== undefined) ||
        (i.result.rules === "RO-2026-monthly-v6"
          ? !validSavedAnnual(i)
          : i.input.annualLeave !== undefined ||
            i.result.annualLeave !== undefined),
    ) ||
    data.format_version !==
      (data.items.some((i) => i.result.rules === "RO-2026-monthly-v6")
        ? HANDOVER_ANNUAL_FORMAT
        : data.items.some((i) => i.result.rules === "RO-2026-monthly-v5")
          ? HANDOVER_SETTLEMENT_FORMAT
          : data.items.some((i) => i.result.rules === "RO-2026-monthly-v4")
            ? HANDOVER_PERIOD_FORMAT
            : HANDOVER_FORMAT) ||
    data.latest_approved_revision < data.run.revision ||
    data.is_historical !== data.latest_approved_revision > data.run.revision ||
    (data.latest_approved_run_id === data.run.id) !== !data.is_historical
  )
    throw new Error("Invalid accountant handover snapshot");
  return data;
}

function validSavedSettlement(i: PayrollHandoverPayload["items"][number]) {
  const s = i.input.settlement,
    r = i.result.settlement;
  if (
    !s ||
    !r ||
    s.otherGross !== r.otherGross ||
    (s.days === 0 && s.otherGross === 0)
  )
    return false;
  if (
    [s.balanceReference, s.rateReference, s.otherReference].some(
      (v) => v !== v.trim(),
    )
  )
    return false;
  if (
    s.days > 0 &&
    (s.dailyGross <= 0 ||
      s.balanceReference.length < 3 ||
      s.rateReference.length < 3)
  )
    return false;
  if (
    s.days === 0 &&
    (s.dailyGross !== 0 ||
      s.balanceReference !== "" ||
      s.rateReference !== "" ||
      r.unusedLeaveGross !== 0)
  )
    return false;
  return s.otherGross > 0
    ? s.otherReference.length >= 3
    : s.otherReference === "";
}

function validSavedAnnual(i: PayrollHandoverPayload["items"][number]) {
  const a = i.input.annualLeave,
    p = i.input.period;
  if (!a || !p || !i.result.annualLeave) return false;
  const dates = a.requests.flatMap((r) => r.dates),
    ids = a.requests.map((r) => r.id);
  if (
    dates.length > p.employedWorkingDays ||
    new Set(dates).size !== dates.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id, n) => n > 0 && id <= ids[n - 1])
  )
    return false;
  return a.requests.every(
    (r) =>
      r.rateReference === r.rateReference.trim() &&
      r.dates.every((v, n) => {
        const d = new Date(`${v}T12:00:00Z`);
        return (
          Number.isFinite(d.getTime()) &&
          d.toISOString().slice(0, 10) === v &&
          d.getUTCDay() !== 0 &&
          d.getUTCDay() !== 6 &&
          v.slice(0, 7) === i.input.month &&
          v >= p.start &&
          v <= p.end &&
          (n === 0 || v > r.dates[n - 1])
        );
      }),
  );
}

export function payrollHandoverTotals(
  payload: PayrollHandoverPayload,
): Record<PayrollMoneyKey, number> {
  return Object.fromEntries(
    payrollRows.map((key) => [
      key,
      payload.items.reduce(
        (sum, item) => sum + Math.round(item.result[key] * 100),
        0,
      ) / 100,
    ]),
  ) as Record<PayrollMoneyKey, number>;
}

// Quoting alone does not prevent spreadsheet formulas. Preserve risky text as text.
export function payrollCsvText(value: string): string {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
  const trimmed = normalized.trimStart();
  const protect =
    /^[=+\-@＝＋－＠]/u.test(trimmed) ||
    /^[\t\n]/.test(normalized) ||
    /^0\d+$/.test(trimmed);
  return `"${(protect ? "'" + normalized : normalized).replaceAll('"', '""')}"`;
}
type Cell = string | number;
const csv = (rows: Cell[][]) =>
  "\uFEFF" +
  rows
    .map((row) =>
      row
        .map((cell) =>
          typeof cell === "number" ? String(cell) : payrollCsvText(cell),
        )
        .join(";"),
    )
    .join("\r\n") +
  "\r\n";

export function payrollHandoverCsvs(payload: PayrollHandoverPayload) {
  const d = payrollDictionary(payload.locale),
    ro = payload.locale === "ro";
  const periodD = payrollPeriodDictionary(payload.locale),
    includePeriod = payload.format_version !== HANDOVER_FORMAT;
  const includeSettlement =
      payload.format_version === HANDOVER_SETTLEMENT_FORMAT ||
      payload.format_version === HANDOVER_ANNUAL_FORMAT,
    sd = payrollSettlementDictionary(payload.locale);
  const settlementHeader = includeSettlement
    ? [
        sd.days,
        sd.dailyGross,
        sd.unusedGross,
        sd.balanceReference,
        sd.rateReference,
        sd.otherGross,
        sd.otherReference,
      ]
    : [];
  const includeAnnual = payload.format_version === HANDOVER_ANNUAL_FORMAT,
    ad = payrollAnnualDictionary(payload.locale);
  const annualHeader = includeAnnual
    ? [
        ad.days,
        ad.workedBasic,
        ad.leaveGross,
        ro
          ? "Cereri aprobate / tarife / referințe"
          : "Approved requests / rates / references",
      ]
    : [];
  const money = (n: number) => n.toFixed(2).replace(".", ro ? "," : ".");
  const commonHeader = [
    ro ? "Luna" : "Month",
    ro ? "Revizie" : "Revision",
    "Run ID",
    "Export ID",
    ro ? "Istoric" : "Historical",
    ro ? "Monedă" : "Currency",
  ];
  const common: Cell[] = [
    payload.run.month.slice(0, 7),
    payload.run.revision,
    payload.run.id,
    payload.export_id,
    payload.is_historical ? (ro ? "Da" : "Yes") : ro ? "Nu" : "No",
    "RON",
  ];
  const employeeHeader = [
    "Employee ID",
    "Item ID",
    ro ? "Angajat" : "Employee",
    ro ? "Contract" : "Contract",
    ro ? "Departament" : "Department",
    ro ? "Funcție" : "Job title",
  ];
  const inputs = [
    "basic",
    "bonus",
    "hours",
    "primary",
    "dependants",
    "young",
    "children",
    "reduced",
    "floorException",
    "evidence",
    "mealsReference",
    "advanceReference",
  ] as const;
  const periodHeader = includePeriod
    ? [
        periodD.start,
        periodD.end,
        periodD.monthDays,
        periodD.paidDays,
        periodD.earned,
        periodD.deductionEmployer,
        periodD.deductionReference,
      ]
    : [];
  const full: Cell[][] = [
    [
      ...commonHeader,
      ...employeeHeader,
      ...periodHeader,
      ...settlementHeader,
      ...annualHeader,
      ...inputs.map((k) => d[k]),
      ...payrollRows.map((k) => d[k]),
      d.rules,
    ],
  ];
  const payments: Cell[][] = [
    [
      ...commonHeader,
      ...employeeHeader.slice(0, 4),
      ...periodHeader.slice(0, 4),
      d.net,
      d.advance,
      d.payable,
    ],
  ];
  for (const item of payload.items) {
    const p = item.input.period;
    const periodCells: Cell[] = includePeriod
      ? p
        ? [
            p.start,
            p.end,
            p.monthWorkingDays,
            p.employedWorkingDays,
            money(
              item.result.annualLeave?.workedBasic ??
                (Math.round(item.result.cashGross * 100) -
                  Math.round(item.input.bonus * 100) -
                  Math.round(
                    (item.result.settlement?.unusedLeaveGross ?? 0) * 100,
                  ) -
                  Math.round((item.result.settlement?.otherGross ?? 0) * 100)) /
                  100,
            ),
            item.input.deductionEmployer === "this"
              ? periodD.thisEmployer
              : periodD.otherEmployer,
            item.input.deductionReference ?? "",
          ]
        : ["", "", "", "", "", "", ""]
      : [];
    const employee = [
      item.employee_id,
      item.id,
      item.employee_name,
      item.contract_number,
      item.department,
      item.job_title,
    ];
    full.push([
      ...common,
      ...employee,
      ...periodCells,
      ...(includeSettlement
        ? item.input.settlement && item.result.settlement
          ? [
              money(item.input.settlement.days),
              money(item.input.settlement.dailyGross),
              money(item.result.settlement.unusedLeaveGross),
              item.input.settlement.balanceReference,
              item.input.settlement.rateReference,
              money(item.result.settlement.otherGross),
              item.input.settlement.otherReference,
            ]
          : ["", "", "", "", "", "", ""]
        : []),
      ...(includeAnnual
        ? item.input.annualLeave && item.result.annualLeave
          ? [
              item.input.annualLeave.requests.reduce(
                (n, r) => n + r.dates.length,
                0,
              ),
              money(item.result.annualLeave.workedBasic),
              money(item.result.annualLeave.leaveGross),
              JSON.stringify(item.input.annualLeave.requests),
            ]
          : ["", "", "", ""]
        : []),
      ...inputs.map((k) => {
        const v = item.input[k];
        if (k === "floorException")
          return floorExceptionLabels(payload.locale)[
            item.input.floorException
          ];
        if (k === "primary" || k === "young" || k === "reduced")
          return v === "yes" ? d.yes : d.no;
        return k === "basic" || k === "bonus" || k === "hours"
          ? money(Number(v))
          : typeof v === "number"
            ? v
            : String(v);
      }),
      ...payrollRows.map((k) => money(item.result[k])),
      item.result.rules,
    ]);
    payments.push([
      ...common,
      ...employee.slice(0, 4),
      ...periodCells.slice(0, 4),
      money(item.result.net),
      money(item.result.advance),
      money(item.result.payable),
    ]);
  }
  const totals = payrollHandoverTotals(payload);
  return {
    "payroll.csv": csv(full),
    "remaining-pay.csv": csv(payments),
    "totals.csv": csv([
      [
        ...commonHeader,
        ro ? "Angajați incluși" : "Included employees",
        ...payrollRows.map((k) => d[k]),
      ],
      [
        ...common,
        payload.items.length,
        ...payrollRows.map((k) => money(totals[k])),
      ],
    ]),
  };
}
