import { generateEmployeePdf } from "./document-pdf.ts";
import { payslipBody, payrollDictionary } from "./payroll-i18n.ts";
import type { PayrollRun, PayrollRunItem } from "./payroll-run-types";
import type { Locale } from "./i18n";

export async function generateApprovedPayrollPdf(
  run: PayrollRun,
  item: PayrollRunItem,
  locale: Locale,
  brandName: string,
): Promise<Uint8Array> {
  if (
    run.status !== "approved" ||
    !run.approved_at ||
    item.run_id !== run.id ||
    item.organisation_id !== run.organisation_id
  )
    throw new Error("An approved matching payroll snapshot is required");
  const d = payrollDictionary(locale),
    month = run.month.slice(0, 7);
  const reference =
    locale === "ro" ? "Stat aprobat / revizie" : "Approved run / revision";
  return generateEmployeePdf({
    locale,
    brandName,
    template: "payslip",
    title: `${d.payslip} - ${month} - r${run.revision}`,
    body: `${reference}: ${run.id} / ${run.revision}\n${payslipBody(item.input, item.result, locale)}`,
    company: item.source.company,
    employee: item.source.employee,
    generatedAt: new Date(),
  });
}
