"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  parseDocumentAction,
  finishDocumentAction,
} from "@/lib/document-actions";
import { payrollSchema, calculatePayroll } from "@/lib/payroll";
import { payrollDictionary, payslipBody } from "@/lib/payroll-i18n";
import { getLocale } from "@/lib/locale";
import { generateEmployeePdf } from "@/lib/document-pdf";
import { brand } from "@/lib/brand";
import { DOCUMENT_BUCKET } from "@/lib/document-types";
import type { ActionState } from "@/lib/types";
const schema = z.intersection(
  payrollSchema,
  z.object({ employee_id: z.uuid(), benefits_reviewed: z.literal("on") }),
);
export async function generatePayslip(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parseDocumentAction(schema, form);
  if (p.error) return p.error;
  const c = p.context,
    v = p.data,
    locale = await getLocale(),
    d = payrollDictionary(locale),
    monthStart = `${v.month}-01`,
    monthEnd = new Date(Date.UTC(2026, Number(v.month.slice(5)), 0))
      .toISOString()
      .slice(0, 10);
  const [employee, contracts, leave, attendance] = await Promise.all([
    c.supabase
      .from("employees")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .eq("id", v.employee_id)
      .single(),
    c.supabase
      .from("employment_contracts")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .eq("employee_id", v.employee_id)
      .lte("start_date", monthEnd)
      .or(`end_date.is.null,end_date.gte.${monthStart}`),
    c.supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", c.organisation.id)
      .eq("employee_id", v.employee_id)
      .eq("status", "approved")
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
    c.supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", c.organisation.id)
      .eq("employee_id", v.employee_id)
      .gte("day", monthStart)
      .lte("day", monthEnd)
      .neq("absence", "none"),
  ]);
  if (employee.error || contracts.error || leave.error || attendance.error)
    return { error: d.mismatch, values: p.values };
  const e = employee.data,
    contract = contracts.data[0];
  if (
    e.status !== "active" ||
    e.start_date > monthStart ||
    contracts.data.length !== 1 ||
    !contract ||
    contract.status !== "active" ||
    contract.start_date > monthStart ||
    (contract.end_date && contract.end_date < monthEnd) ||
    Number(contract.working_hours) !== v.hours ||
    Number(contract.gross_salary) !== v.basic ||
    contract.currency !== "RON" ||
    (leave.count ?? 0) > 0 ||
    (attendance.count ?? 0) > 0
  )
    return { error: d.mismatch, values: p.values };
  let bytes: Uint8Array;
  try {
    const result = calculatePayroll(v);
    const body = payslipBody(v, result, locale);
    bytes = await generateEmployeePdf({
      locale,
      brandName: brand.name,
      title: `${d.payslip} - ${v.month}`,
      template: "payslip",
      body,
      company: {
        name: c.organisation.name,
        cui: c.organisation.cui,
        address: c.organisation.registered_address ?? "",
      },
      employee: {
        name: `${e.first_name} ${e.last_name}`,
        email: e.email,
        job: e.job_title,
        department: e.department,
        workplace: e.workplace,
        start: e.start_date,
        status: e.status,
      },
      generatedAt: new Date(),
    });
  } catch {
    return { error: d.invalid, values: p.values };
  }
  const prepared = await c.supabase.rpc("prepare_employee_document", {
    p_org: c.organisation.id,
    p_employee: e.id,
    p_title: `${d.payslip} - ${v.month}`,
    p_category: "employment",
    p_visibility: "hr_only",
    p_origin: "generated",
    p_filename: `payslip-${v.month}.pdf`,
    p_bytes: bytes.length,
  });
  if (prepared.error || !prepared.data)
    return finishDocumentAction(prepared.error ?? {}, p.values);
  const uploaded = await c.supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(`${c.organisation.id}/${prepared.data}.pdf`, bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "0",
    });
  if (uploaded.error) {
    revalidatePath("/documents");
    return finishDocumentAction({}, p.values);
  }
  const completed = await c.supabase.rpc("complete_employee_document", {
    p_org: c.organisation.id,
    p_id: prepared.data,
    p_version: 1,
  });
  return finishDocumentAction(completed.error, p.values);
}
