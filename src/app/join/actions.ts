"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { idSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/types";
import { deliverEmployeeInvitation } from "@/lib/employee-invitations";
export async function acceptInvitation(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser(),
    ro = (await getLocale()) === "ro",
    id = idSchema.safeParse(form.get("id"));
  if (!id.success)
    return { error: ro ? "Invitație invalidă." : "Invalid invitation." };
  const { data, error } = await supabase.rpc("accept_employee_invitation", {
    p_id: id.data,
  });
  if (error || !data)
    return {
      error: ro
        ? "Invitația nu mai este disponibilă pentru acest cont. Verifică adresa de email sau contactează HR."
        : "This invitation is unavailable for this account. Check your email address or contact HR.",
    };
  (await cookies()).set("hr-organisation", data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
export async function manageInvitation(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, organisation } = await requireHR(true),
    ro = (await getLocale()) === "ro",
    employee = idSchema.safeParse(form.get("employee_id"));
  if (!employee.success)
    return { error: ro ? "Angajat invalid." : "Invalid employee." };
  let success = false;
  if (form.get("operation") === "revoke") {
    const id = idSchema.safeParse(form.get("id"));
    if (!id.success) return { error: "Invalid invitation." };
    const { error } = await supabase.rpc("revoke_employee_invitation", {
      p_org: organisation.id,
      p_id: id.data,
    });
    success = !error;
  } else if (form.get("operation") === "send") {
    success =
      (await deliverEmployeeInvitation(
        supabase,
        organisation,
        employee.data,
        true,
      )) === "accepted";
  }
  revalidatePath(`/employees/${employee.data}`);
  return success
    ? { success: ro ? "Actualizat." : "Updated." }
    : {
        error: ro
          ? "Invitația nu a fost confirmată ca trimisă. Verifică starea de mai jos și setările SMTP. Așteaptă un minut înainte de reîncercare."
          : "Invitation sending was not confirmed. Check its status and SMTP settings. Wait one minute before retrying.",
      };
}
