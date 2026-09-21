export type BenefitModel =
  | "fixed_monthly"
  | "per_worked_day"
  | "annual_allowance"
  | "flexible_budget"
  | "non_financial";
export type BenefitAdapterKey = "custom" | "pluxee" | "edenred" | "up_romania";
export type BenefitProvider = {
  id: string;
  organisation_id: string;
  name: string;
  adapter_key: BenefitAdapterKey;
  active: boolean;
  version: number;
};
export type Benefit = {
  id: string;
  organisation_id: string;
  provider_id: string;
  name: string;
  model: BenefitModel;
  amount: number;
  active: boolean;
  version: number;
};
export type EmployeeBenefit = {
  id: string;
  organisation_id: string;
  employee_id: string;
  benefit_id: string;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  version: number;
};
export type BenefitRun = {
  id: string;
  organisation_id: string;
  month: string;
  status: "draft" | "approved";
  source_hash: string;
  worked_days: number;
  prepared_by: string;
  prepared_at: string;
  approved_by: string | null;
  approved_at: string | null;
  version: number;
};
export type BenefitFlag =
  | "employee_status"
  | "contract_status"
  | "partial_month"
  | "disabled"
  | "missing_attendance"
  | "full_absence"
  | "no_worked_days"
  | "manual_allocation"
  | "open_month";
export type BenefitItem = {
  id: string;
  organisation_id: string;
  run_id: string;
  employee_id: string;
  employee_benefit_id: string;
  month: string;
  employee_name: string;
  benefit_name: string;
  provider_name: string;
  model: BenefitModel;
  unit_amount: number;
  worked_days: number;
  missing_days: number;
  annual_used: number;
  suggested_amount: number;
  final_amount: number;
  included: boolean;
  flags: BenefitFlag[];
  reviewed: boolean;
  review_note: string | null;
  reviewed_by: string | null;
  version: number;
};
export type BenefitSummary = {
  employees: number;
  items: number;
  unreviewed: number;
  included: number;
  total: number;
  worked_days: number;
};
