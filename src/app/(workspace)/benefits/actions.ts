"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage, type ActionState } from "@/lib/types";
import { benefitDictionary } from "@/lib/benefit-i18n";
import {
  providerSchema,
  benefitSchema,
  enrolmentSchema,
  prepareBenefitsSchema,
  reviewBenefitSchema,
  approveBenefitsSchema,
} from "@/lib/benefit-validation";
async function parse<T>(schema: z.ZodType<T>, form: FormData) {
  const context = await requireOrganisation();
  const d = benefitDictionary(await getLocale());
  if (!canManage(context.membership.role))
    return { error: { error: d.denied } as ActionState };
  if (context.organisation.status !== "active")
    return { error: { error: d.inactive } as ActionState };
  const values = Object.fromEntries(
    [...form.entries()].filter(
      ([k, v]) => !k.startsWith("$") && typeof v === "string",
    ),
  ) as Record<string, string>;
  const data = schema.safeParse(values);
  if (!data.success)
    return {
      error: {
        error: d.invalid,
        values,
        fields: z.flattenError(data.error).fieldErrors as Record<
          string,
          string[]
        >,
      } as ActionState,
    };
  return { context, values, data: data.data };
}
async function finish(
  error: { code?: string } | null,
  values: Record<string, string>,
): Promise<ActionState> {
  const d = benefitDictionary(await getLocale());
  if (error) {
    const messages: Record<string, string> = {
      "42501": d.denied,
      "23505": d.duplicate,
      "23503": d.invalid,
      "23514": d.invalid,
      "22023": d.invalid,
      P0004: d.inactive,
      P0006: d.stale,
      B0001: d.locked,
      B0002: d.changed,
      B0003: d.unreviewed,
      B0004: d.budget,
      B0005: d.noEnrolments,
    };
    return { error: messages[error.code ?? ""] ?? d.error, values };
  }
  revalidatePath("/benefits", "layout");
  revalidatePath("/dashboard");
  return { success: d.saved };
}
export async function saveProvider(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parse(providerSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("save_benefit_provider", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
    p_name: v.name,
    p_adapter: v.adapter_key,
    p_active: v.active,
  });
  return finish(error, p.values);
}
export async function saveBenefit(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parse(benefitSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("save_benefit", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
    p_provider: v.provider_id,
    p_name: v.name,
    p_model: v.model,
    p_amount: v.amount,
    p_active: v.active,
  });
  return finish(error, p.values);
}
export async function saveEnrolment(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parse(enrolmentSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("save_employee_benefit", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
    p_employee: v.employee_id,
    p_benefit: v.benefit_id,
    p_start: v.starts_on,
    p_end: v.ends_on,
    p_active: v.active,
  });
  return finish(error, p.values);
}
export async function prepareMonth(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parse(prepareBenefitsSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("prepare_benefit_month", {
    p_org: c.organisation.id,
    p_month: v.month,
    p_version: v.version,
  });
  return finish(error, p.values);
}
export async function reviewItem(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parse(reviewBenefitSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("review_benefit_item", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
    p_included: v.included,
    p_amount: v.amount,
    p_note: v.note,
  });
  return finish(error, p.values);
}
export async function approveMonth(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parse(approveBenefitsSchema, form);
  if (p.error) return p.error;
  const { context: c, data: v } = p;
  const { error } = await c.supabase.rpc("approve_benefit_month", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
  });
  return finish(error, p.values);
}
