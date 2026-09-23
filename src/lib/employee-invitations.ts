import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { sendEmployeeInvitation } from "./mail";
export async function deliverEmployeeInvitation(
  supabase: SupabaseClient<Database>,
  organisation: { id: string; name: string },
  employeeId: string,
  renew = false,
) {
  // Validate the configured destination before reserving or sending an email.
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return "failed";
  let origin: URL;
  try {
    origin = new URL(value);
    if (
      origin.username ||
      origin.password ||
      !["http:", "https:"].includes(origin.protocol) ||
      (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    )
      return "failed";
  } catch {
    return "failed";
  }
  const { data, error } = await supabase.rpc("prepare_employee_invitation", {
    p_org: organisation.id,
    p_employee: employeeId,
    p_renew: renew,
  });
  if (error || !data) return "unavailable";
  const url = new URL("/join", origin.origin);
  url.searchParams.set("invitation", data.id);
  const outcome = await sendEmployeeInvitation(
    data.email,
    organisation.name,
    url.toString(),
  );
  const finished = await supabase.rpc("finish_employee_invitation", {
    p_org: organisation.id,
    p_id: data.id,
    p_attempt: data.attempt,
    p_status: outcome,
  });
  return finished.error ? "uncertain" : outcome;
}
