import type { BenefitAdapterKey } from "./benefit-types";
// Extension point only: these adapters have no credentials, network calls or fake success.
export interface BenefitsProvider {
  key: BenefitAdapterKey;
  status(): { connected: false; reason: "not_implemented" };
  submit(): Promise<never>;
}
function unavailable(key: BenefitAdapterKey): BenefitsProvider {
  return {
    key,
    status: () => ({ connected: false, reason: "not_implemented" }),
    async submit() {
      throw new Error("Provider submission is not implemented.");
    },
  };
}
const adapters: Record<BenefitAdapterKey, BenefitsProvider> = {
  custom: unavailable("custom"),
  pluxee: unavailable("pluxee"),
  edenred: unavailable("edenred"),
  up_romania: unavailable("up_romania"),
};
export function benefitsProvider(key: BenefitAdapterKey): BenefitsProvider {
  return adapters[key];
}
