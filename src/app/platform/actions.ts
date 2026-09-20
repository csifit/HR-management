"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { platformDictionary } from "@/lib/platform-i18n";
import {
  platformOrganisationSchema,
  organisationStatusSchema,
  idSchema,
} from "@/lib/validation";
import type { ActionState } from "@/lib/types";

async function failure(code?: string): Promise<ActionState> {
  const d = platformDictionary(await getLocale());
  return {
    error:
      code === "23505"
        ? d.duplicate
        : code === "P0001"
          ? d.confirmedRequired
          : code === "P0006"
            ? d.stale
            : code === "42501"
              ? d.denied
              : code === "P0005"
                ? d.missing
                : d.error,
  };
}
export async function savePlatformOrganisation(
  id: string | null,
  version: number | null,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const d = platformDictionary(await getLocale());
  if (
    id !== null &&
    (!idSchema.safeParse(id).success ||
      !z.number().int().positive().safeParse(version).success)
  )
    return failure();
  const values = Object.fromEntries(
    [...form.entries()].filter(
      ([key, value]) => !key.startsWith("$") && typeof value === "string",
    ),
  ) as Record<string, string>;
  const parsed = platformOrganisationSchema.safeParse(values);
  const owner = z.email().max(254).safeParse(values.owner_email?.trim());
  if (!parsed.success)
    return {
      error: d.invalid,
      fields: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  if (!id && !owner.success)
    return {
      error: d.invalid,
      fields: { owner_email: [d.confirmedRequired] },
      values,
    };
  const { data, error } = await supabase.rpc("platform_save_organisation", {
    p_id: id,
    p_version: version,
    p_details: parsed.data,
    p_owner_email: !id && owner.success ? owner.data : null,
  });
  if (error || !data) return { ...(await failure(error?.code)), values };
  revalidatePath("/", "layout");
  if (!id) redirect(`/platform?created=${data}`);
  return { success: d.saved };
}
export async function changeOrganisationStatus(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const d = platformDictionary(await getLocale());
  const parsed = organisationStatusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: d.invalid,
      fields: z.flattenError(parsed.error).fieldErrors,
    };
  const { error } = await supabase.rpc("platform_set_organisation_status", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return failure(error.code);
  revalidatePath("/", "layout");
  return { success: d.statusSaved };
}
