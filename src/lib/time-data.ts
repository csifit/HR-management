import "server-only";
import { notFound } from "next/navigation";
import { requireOrganisation } from "./auth";
import { searchTerm } from "./data";
import { idSchema } from "./validation";
import type { EmployeeOption } from "./time-types";
export async function timeEmployees(
  selected: string,
  search = "",
  ownOnly = false,
) {
  const { supabase, organisation, user } = await requireOrganisation();
  let query = supabase
    .from("employees")
    .select("id,first_name,last_name,user_id,manager_user_id,start_date")
    .eq("organisation_id", organisation.id);
  if (ownOnly) query = query.eq("user_id", user.id);
  const term = searchTerm(search);
  if (term)
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  const { data, error } = await query
    .order("last_name")
    .order("first_name")
    .order("id")
    .limit(51);
  if (error) throw new Error("Employees could not be loaded.");
  const options: EmployeeOption[] = data.slice(0, 50);
  let employee = options.find((e) => e.id === selected);
  if (selected && !employee) {
    if (!idSchema.safeParse(selected).success) notFound();
    const { data: row, error } = await supabase
      .from("employees")
      .select("id,first_name,last_name,user_id,manager_user_id,start_date")
      .eq("organisation_id", organisation.id)
      .eq("id", selected)
      .maybeSingle();
    if (error) throw new Error("Employee could not be loaded.");
    if (!row || (ownOnly && row.user_id !== user.id)) notFound();
    employee = row;
    options.unshift(row);
  }
  if (ownOnly && !selected) employee = options[0];
  return { options, employee, hasMore: data.length > 50 };
}
