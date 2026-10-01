"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHR } from "@/lib/auth";
import { PartialPayrollReliefReview } from "@/lib/payroll-period";
import { payrollSettlementFromForm } from "@/lib/payroll-settlement";
import {
  payrollWithAnnualSchema,
  calculatePayrollWithLeave,
  payrollAnnualFromForm,
} from "@/lib/payroll-annual-leave";
import { payrollPeriodDictionary } from "@/lib/payroll-period-i18n";
import { payrollRunDictionary } from "@/lib/payroll-run-i18n";
import { getLocale } from "@/lib/locale";
import { generateApprovedPayrollPdf } from "@/lib/payroll-run-pdf";
import { brand } from "@/lib/brand";
import { DOCUMENT_BUCKET } from "@/lib/document-types";
import type { ActionState } from "@/lib/types";

const versioned = z.object({
  run_id: z.uuid(),
  run_version: z.coerce.number().int().positive(),
});
const saveSchema = z.intersection(
  payrollWithAnnualSchema,
  versioned.extend({
    employee_id: z.uuid(),
    benefits_reviewed: z.literal("on"),
    period_reviewed: z.literal("on"),
  }),
);
const createSchema = z
  .object({
    month: z.string().regex(/^2026-(0[1-9]|1[0-2])$/),
    previous: z.union([z.uuid(), z.literal("")]).default(""),
    reason: z.string().trim().max(1000).default(""),
  })
  .refine((v) => !v.previous || v.reason.length >= 5);
const formValues = (form: FormData) =>
  Object.fromEntries(
    [...form.entries()].filter(
      ([key, value]) => !key.startsWith("$") && typeof value === "string",
    ),
  ) as Record<string, string>;

async function outcome(
  error: { code?: string } | null,
  values: Record<string, string>,
  run?: string,
): Promise<ActionState> {
  const d = payrollRunDictionary(await getLocale());
  if (error) {
    const messages: Record<string, string> = {
      P0006: d.stale,
      P0010: d.sourceChanged,
      P0011: d.closedMonthOnly,
      P0012: d.limitReached,
      P0014: payrollPeriodDictionary(await getLocale()).reliefReview,
      D0001: d.locked,
      "23505": d.duplicate,
      "22023": d.invalid,
      "23514": d.invalid,
    };
    return { error: messages[error.code ?? ""] ?? d.error, values };
  }
  revalidatePath("/payroll");
  if (run) revalidatePath(`/payroll/runs/${run}`);
  return { success: d.saved };
}

export async function createPayrollRun(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    values = formValues(form),
    parsed = createSchema.safeParse(values);
  if (!parsed.success) return outcome({ code: "22023" }, values);
  const v = parsed.data;
  const { data, error } = await c.supabase.rpc("create_payroll_run", {
    p_org: c.organisation.id,
    p_month: `${v.month}-01`,
    p_previous: v.previous || null,
    p_reason: v.reason,
  });
  if (error || !data) return outcome(error ?? {}, values);
  revalidatePath("/payroll");
  redirect(`/payroll/runs/${data}`);
}

export async function savePayrollEntry(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    values = formValues(form);
  let period: unknown;
  let annualLeave: unknown;
  try {
    period = JSON.parse(values.period);
    annualLeave = payrollAnnualFromForm(values);
  } catch {
    return outcome({ code: "22023" }, values);
  }
  const parsed = saveSchema.safeParse({
    ...values,
    period,
    settlement: payrollSettlementFromForm(values),
    annualLeave,
  });
  if (!parsed.success) return outcome({ code: "22023" }, values);
  const v = parsed.data,
    input = payrollWithAnnualSchema.parse(v);
  try {
    calculatePayrollWithLeave(input);
  } catch (error) {
    return outcome(
      { code: error instanceof PartialPayrollReliefReview ? "P0014" : "22023" },
      values,
    );
  }
  const { error } = await c.supabase.rpc("save_payroll_item", {
    p_org: c.organisation.id,
    p_run: v.run_id,
    p_version: v.run_version,
    p_employee: v.employee_id,
    p_input: input,
    p_benefits_reviewed: true,
  });
  return outcome(error, values, v.run_id);
}

export async function removePayrollEntry(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    values = formValues(form),
    parsed = versioned.extend({ item_id: z.uuid() }).safeParse(values);
  if (!parsed.success) return outcome({ code: "22023" }, values);
  const v = parsed.data;
  const { error } = await c.supabase.rpc("remove_payroll_item", {
    p_org: c.organisation.id,
    p_run: v.run_id,
    p_version: v.run_version,
    p_item: v.item_id,
  });
  return outcome(error, values, v.run_id);
}

export async function approvePayrollRun(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    values = formValues(form),
    parsed = versioned.extend({ confirm: z.literal("on") }).safeParse(values);
  if (!parsed.success) return outcome({ code: "22023" }, values);
  const v = parsed.data;
  const { error } = await c.supabase.rpc("approve_payroll_run", {
    p_org: c.organisation.id,
    p_run: v.run_id,
    p_version: v.run_version,
    p_confirm: true,
  });
  return outcome(error, values, v.run_id);
}

export async function discardPayrollRun(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    values = formValues(form),
    parsed = versioned
      .extend({ reason: z.string().trim().min(5).max(1000) })
      .safeParse(values);
  if (!parsed.success) return outcome({ code: "22023" }, values);
  const v = parsed.data;
  const { error } = await c.supabase.rpc("discard_payroll_run", {
    p_org: c.organisation.id,
    p_run: v.run_id,
    p_version: v.run_version,
    p_reason: v.reason,
  });
  return outcome(error, values, v.run_id);
}

export async function generateApprovedPayslip(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    values = formValues(form),
    locale = await getLocale(),
    d = payrollRunDictionary(locale);
  const parsed = z
    .object({ run_id: z.uuid(), item_id: z.uuid() })
    .safeParse(values);
  if (!parsed.success) return outcome({ code: "22023" }, values);
  const v = parsed.data;
  const [run, item] = await Promise.all([
    c.supabase
      .from("payroll_runs")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .eq("id", v.run_id)
      .single(),
    c.supabase
      .from("payroll_run_items")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .eq("run_id", v.run_id)
      .eq("id", v.item_id)
      .single(),
  ]);
  if (run.error || item.error || run.data.status !== "approved")
    return outcome({ code: "D0001" }, values);
  let bytes: Uint8Array;
  try {
    bytes = await generateApprovedPayrollPdf(
      run.data,
      item.data,
      locale,
      brand.name,
    );
  } catch {
    return { error: d.pdfFailed, values };
  }
  const prepared = await c.supabase.rpc("prepare_payroll_document", {
    p_org: c.organisation.id,
    p_item: v.item_id,
    p_bytes: bytes.length,
    p_locale: locale,
  });
  if (prepared.error || !prepared.data)
    return outcome(prepared.error ?? {}, values);
  const uploaded = await c.supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(`${c.organisation.id}/${prepared.data}.pdf`, bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "0",
    });
  if (uploaded.error) {
    revalidatePath("/documents");
    revalidatePath(`/payroll/runs/${v.run_id}`);
    return { error: d.pdfFailed, values };
  }
  const completed = await c.supabase.rpc("complete_employee_document", {
    p_org: c.organisation.id,
    p_id: prepared.data,
    p_version: 1,
  });
  revalidatePath("/documents");
  revalidatePath(`/payroll/runs/${v.run_id}`);
  return completed.error
    ? { error: d.pdfFailed, values }
    : { success: d.pdfSaved };
}
