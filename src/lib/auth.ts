import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { isConfigured } from "./supabase/config";
import { canManage } from "./types";
export const requireUser = cache(async () => {
  if (!isConfigured()) redirect("/setup");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return { supabase, user };
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
export const requireOrganisation = cache(async () => {
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships();
  if (!memberships.length) redirect("/onboarding");
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
export async function requireHR() {
  const context = await requireOrganisation();
  if (!canManage(context.membership.role)) redirect("/dashboard");
  return context;
}
