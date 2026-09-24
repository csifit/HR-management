import "server-only";
import { notFound } from "next/navigation";
import { requireOrganisation } from "./auth";
import { idSchema } from "./validation";
export async function getOwnEmployee() {
  const { supabase, organisation, user } = await requireOrganisation();
  const { data, error } = await supabase
    .from("employees")
    .select("id,department,job_title,workplace")
    .eq("organisation_id", organisation.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Your employee record could not be loaded.");
  return data;
}
export async function getEmployee(id: string) {
  if (!idSchema.safeParse(id).success) notFound();
  const context = await requireOrganisation();
  const { data, error } = await context.supabase
    .from("employees")
    .select("*")
    .eq("organisation_id", context.organisation.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Employee could not be loaded.");
  if (!data) notFound();
  return { ...context, employee: data };
}
export async function getManagers() {
  const { supabase, organisation } = await requireOrganisation();
  const { data, error } = await supabase
    .from("organisation_users")
    .select("*")
    .eq("organisation_id", organisation.id)
    .in("role", ["organisation_owner", "hr_manager", "manager"])
    .order("display_name");
  if (error) throw new Error("Managers could not be loaded.");
  return data;
}
export function pageNumber(value?: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, 100000)
    : 1;
}
export function searchTerm(value?: string) {
  return (value ?? "")
    .replace(/[^\p{L}\p{N}\s@-]/gu, "")
    .trim()
    .slice(0, 80);
}
