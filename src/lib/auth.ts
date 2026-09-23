import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "./supabase/server";
import { isConfigured } from "./supabase/config";
import { canManage } from "./types";
// Only account security/enrollment may use the password-only authenticated session.
export const requireSession = cache(async () => {
  if (!isConfigured()) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return { supabase, user };
});
export const requireUser = cache(async () => {
  const context = await requireSession();
  if (context.user.factors?.some((f) => f.status === "verified")) {
    const { data, error } =
      await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data)
      throw new Error("Account security could not be checked.");
    if (data.currentLevel !== "aal2") redirect("/account/security");
  }
  return context;
});
export const getMemberships = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("organisation_users")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at");
  if (error)
    throw new Error(
      "Memberships could not be loaded. Check database migrations.",
    );
  return data;
});
export const getOrganisationContext = cache(async () => {
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships();
  if (!memberships.length) {
    const invites = await supabase.rpc("my_employee_invitations");
    if (invites.error) throw new Error("Invitations could not be loaded.");
    if (invites.data.length) redirect("/join");
    const admin = await supabase.rpc("is_platform_admin");
    if (admin.error) throw new Error("Platform access could not be checked.");
    redirect(admin.data ? "/platform" : "/onboarding");
  }
  const selected = (await cookies()).get("hr-organisation")?.value;
  const membership =
    memberships.find((m) => m.organisation_id === selected) ?? memberships[0];
  const { data: organisation, error } = await supabase
    .from("organisations")
    .select("*")
    .eq("id", membership.organisation_id)
    .single();
  if (error || !organisation)
    throw new Error("Organisation could not be loaded.");
  return { supabase, user, organisation, membership, memberships };
});
export const requireOrganisation = cache(async () => {
  const context = await getOrganisationContext();
  if (context.organisation.status === "blocked")
    redirect("/organisation-access");
  return context;
});
export const requirePlatformAdmin = cache(async () => {
  const context = await requireUser();
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error) throw new Error("Platform access could not be checked.");
  if (!data) notFound();
  return context;
});
export async function requireHR(writable = false) {
  const context = await requireOrganisation();
  if (!canManage(context.membership.role)) redirect("/dashboard");
  if (writable && context.organisation.status !== "active")
    redirect("/dashboard");
  return context;
}
