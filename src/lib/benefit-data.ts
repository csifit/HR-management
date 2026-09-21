import "server-only";
import { requireOrganisation } from "./auth";
import type { Benefit, BenefitProvider } from "./benefit-types";
// Page through the API row limit so enrolment choices are not silently truncated.
export async function benefitCatalogue() {
  const { supabase, organisation } = await requireOrganisation();
  const benefits: Benefit[] = [];
  const providers: BenefitProvider[] = [];
  for (let from = 0; ; from += 500) {
    const r = await supabase
      .from("benefits")
      .select("*")
      .eq("organisation_id", organisation.id)
      .order("id")
      .range(from, from + 499);
    if (r.error) throw new Error("Benefits could not be loaded.");
    benefits.push(...r.data);
    if (r.data.length < 500) break;
  }
  for (let from = 0; ; from += 500) {
    const r = await supabase
      .from("benefit_providers")
      .select("*")
      .eq("organisation_id", organisation.id)
      .order("id")
      .range(from, from + 499);
    if (r.error) throw new Error("Providers could not be loaded.");
    providers.push(...r.data);
    if (r.data.length < 500) break;
  }
  return {
    benefits: benefits.sort((a, b) => a.name.localeCompare(b.name)),
    providers: providers.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
