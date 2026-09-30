import { z } from "zod";
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
const textField = z.string().max(500);
const savedMoney = z
  .number()
  .finite()
  .min(0)
  .max(2000000)
  .refine((n) => Math.round(n * 100) / 100 === n);
// This is a saved v3 format, independent of later calculator validation/rules.
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
});
const savedResult = z.object({
  rules: z.literal("RO-2026-monthly-v3"),
  month: z.string(),
  ...Object.fromEntries(payrollRows.map((key) => [key, savedMoney])),
});
const payloadSchema = z.object({
  export_id: z.uuid(),
  prepared_at: z.iso.datetime({ offset: true }),
  organisation_id: z.uuid(),
  locale: z.enum(["ro", "en"]),
  format_version: z.literal(HANDOVER_FORMAT),
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
        i.result.month !== i.input.month,
    ) ||
    data.latest_approved_revision < data.run.revision ||
    data.is_historical !== data.latest_approved_revision > data.run.revision ||
    (data.latest_approved_run_id === data.run.id) !== !data.is_historical
  )
    throw new Error("Invalid accountant handover snapshot");
  return data;
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
  const full: Cell[][] = [
    [
      ...commonHeader,
      ...employeeHeader,
      ...inputs.map((k) => d[k]),
      ...payrollRows.map((k) => d[k]),
      d.rules,
    ],
  ];
  const payments: Cell[][] = [
    [
      ...commonHeader,
      ...employeeHeader.slice(0, 4),
      d.net,
      d.advance,
      d.payable,
    ],
  ];
  for (const item of payload.items) {
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
