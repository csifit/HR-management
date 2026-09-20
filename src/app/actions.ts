"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/supabase/config";
import { requireUser, requireOrganisation, getMemberships } from "@/lib/auth";
import { getDictionary } from "@/lib/locale";
import { canManage, type ActionState } from "@/lib/types";
import {
  organisationSchema,
  employeeSchema,
  contractSchema,
  memberSchema,
  loginSchema,
  registerSchema,
  passwordSchema,
  idSchema,
} from "@/lib/validation";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
function values(form: FormData) {
  return Object.fromEntries(
    [...form.entries()].filter(
      ([key, value]) => !key.startsWith("$") && typeof value === "string",
    ),
  ) as Record<string, string>;
}
async function invalid(
  error: z.ZodError,
  form?: FormData,
): Promise<ActionState> {
  return {
    error: (await getDictionary()).invalidForm,
    fields: z.flattenError(error).fieldErrors as Record<string, string[]>,
    values: form ? values(form) : undefined,
  };
}
async function failure(code?: string): Promise<ActionState> {
  const d = await getDictionary();
  return {
    error:
      code === "23505"
        ? d.duplicateError
        : code === "42501"
          ? d.accessDenied
          : code === "P0001"
            ? d.confirmedRequired
            : code === "P0002"
              ? d.lastOwner
              : code === "P0003" || code === "23503"
                ? d.employeeLinkError
                : d.saveError,
  };
}
function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return new URL(value).origin;
}
export async function changeLocale(form: FormData) {
  (await cookies()).set(
    "hr-locale",
    form.get("locale") === "en" ? "en" : "ro",
    cookieOptions,
  );
  revalidatePath("/", "layout");
}
export async function signIn(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isConfigured()) redirect("/setup");
  const parsed = loginSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: (await getDictionary()).invalidCredentials };
  redirect("/dashboard");
}
export async function signUp(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isConfigured()) redirect("/setup");
  const parsed = registerSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error, data } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
    },
  });
  if (error) return { error: (await getDictionary()).authError };
  if (data.session) redirect("/onboarding");
  return { success: (await getDictionary()).checkEmail };
}
export async function forgotPassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isConfigured()) redirect("/setup");
  const parsed = z.email().safeParse(form.get("email"));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/update-password`,
  });
  return error
    ? { error: (await getDictionary()).authError }
    : { success: (await getDictionary()).resetSent };
}
export async function updatePassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(form.get("password"));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: (await getDictionary()).authError };
  redirect("/dashboard");
}
export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error("Sign-out failed. Please retry.");
  (await cookies()).delete("hr-organisation");
  redirect("/login");
}
export async function createOrganisation(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = organisationSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { data, error } = await supabase.rpc("create_organisation", {
    p_name: parsed.data.name,
    p_cui: parsed.data.cui,
  });
  if (error || !data) return failure(error?.code);
  (await cookies()).set("hr-organisation", data, cookieOptions);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
export async function switchOrganisation(form: FormData) {
  const parsed = idSchema.safeParse(form.get("organisation_id"));
  const memberships = await getMemberships();
  if (
    !parsed.success ||
    !memberships.some((m) => m.organisation_id === parsed.data)
  )
    redirect("/dashboard");
  (await cookies()).set("hr-organisation", parsed.data, cookieOptions);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
export async function saveOrganisation(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, organisation, membership } = await requireOrganisation();
  if (membership.role !== "organisation_owner") return failure("42501");
  const parsed = organisationSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { error } = await supabase
    .from("organisations")
    .update(parsed.data)
    .eq("id", organisation.id);
  if (error) return failure(error.code);
  revalidatePath("/", "layout");
  return { success: (await getDictionary()).orgSaved };
}
export async function saveEmployee(
  id: string | null,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, organisation, membership } = await requireOrganisation();
  if (!canManage(membership.role)) return failure("42501");
  if (id && !idSchema.safeParse(id).success) return failure();
  const parsed = employeeSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const query = id
    ? supabase
        .from("employees")
        .update(parsed.data)
        .eq("id", id)
        .eq("organisation_id", organisation.id)
    : supabase
        .from("employees")
        .insert({ ...parsed.data, organisation_id: organisation.id });
  const { data, error } = await query.select("id").single();
  if (error || !data)
    return { ...(await failure(error?.code)), values: values(form) };
  revalidatePath("/dashboard");
  revalidatePath("/employees");
  revalidatePath(`/employees/${data.id}`);
  redirect(`/employees/${data.id}`);
}
export async function saveContract(
  employeeId: string,
  contractId: string | null,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, organisation, membership } = await requireOrganisation();
  if (!canManage(membership.role)) return failure("42501");
  if (
    !idSchema.safeParse(employeeId).success ||
    (contractId && !idSchema.safeParse(contractId).success)
  )
    return failure();
  const parsed = contractSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const query = contractId
    ? supabase
        .from("employment_contracts")
        .update(parsed.data)
        .eq("id", contractId)
        .eq("employee_id", employeeId)
        .eq("organisation_id", organisation.id)
    : supabase
        .from("employment_contracts")
        .insert({
          ...parsed.data,
          organisation_id: organisation.id,
          employee_id: employeeId,
        });
  const { error } = await query.select("id").single();
  if (error) return { ...(await failure(error.code)), values: values(form) };
  revalidatePath("/dashboard");
  revalidatePath("/contracts");
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/employees/${employeeId}?tab=contract`);
}
export async function saveMember(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, organisation, membership } = await requireOrganisation();
  if (membership.role !== "organisation_owner") return failure("42501");
  const parsed = memberSchema.safeParse(values(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { error } = await supabase.rpc("set_organisation_member", {
    p_organisation_id: organisation.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_employee_id: parsed.data.employee_id,
  });
  if (error) return { ...(await failure(error.code)), values: values(form) };
  revalidatePath("/", "layout");
  return { success: (await getDictionary()).memberSaved };
}
