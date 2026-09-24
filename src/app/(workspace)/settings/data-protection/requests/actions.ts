"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { privacyDictionary } from "@/lib/privacy-i18n";
import {
  createPrivacySchema,
  updatePrivacySchema,
} from "@/lib/privacy-validation";
import type { ActionState } from "@/lib/types";
const root = "/settings/data-protection/requests";
const formValues = (form: FormData) =>
  Object.fromEntries(
    [...form.entries()].filter(
      ([key, value]) => !key.startsWith("$") && typeof value === "string",
    ),
  ) as Record<string, string>;

export async function createPrivacyRequest(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    d = privacyDictionary(await getLocale());
  const values = formValues(form);
  const parsed = createPrivacySchema.safeParse(values);
  if (!parsed.success) return { error: d.invalid, values };
  const v = parsed.data;
  const { data, error } = await c.supabase.rpc("create_privacy_request", {
    p_org: c.organisation.id,
    p_employee: v.employee_id,
    p_kind: v.kind,
    p_received: v.received_on,
    p_due: v.due_on,
    p_channel: v.channel,
    p_summary: v.summary,
    p_assignee: v.assigned_to,
  });
  if (error || !data)
    return { error: error?.code === "42501" ? d.error : d.invalid, values };
  revalidatePath(root);
  redirect(`${root}/${data}`);
}
export async function updatePrivacyRequest(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const c = await requireHR(true),
    d = privacyDictionary(await getLocale());
  const values = formValues(form);
  const parsed = updatePrivacySchema.safeParse(values);
  if (!parsed.success) return { error: d.invalid, values };
  const v = parsed.data;
  const { error } = await c.supabase.rpc("update_privacy_request", {
    p_org: c.organisation.id,
    p_id: v.id,
    p_version: v.version,
    p_status: v.status,
    p_assignee: v.assigned_to,
    p_identity: v.identity_reference,
    p_due: v.due_on,
    p_extension_reason: v.extension_reason,
    p_notified: v.extension_notified_on,
    p_response: v.response_reference,
    p_responded: v.responded_on,
    p_resolution: v.resolution,
  });
  if (error)
    return {
      values,
      error:
        error.code === "P0006"
          ? d.stale
          : error.code === "D0001"
            ? d.locked
            : d.invalid,
    };
  revalidatePath(root);
  revalidatePath(`${root}/${v.id}`);
  return { success: d.saved };
}
