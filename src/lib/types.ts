export type Role = "organisation_owner" | "hr_manager" | "manager" | "employee";
export type EmployeeStatus =
  "active" | "onboarding" | "suspended" | "terminated";
export type ContractStatus = "draft" | "active" | "suspended" | "terminated";
export type ContractType = "indefinite" | "fixed_term";
export type OrganisationStatus = "active" | "suspended" | "blocked";
export type DirectoryDetail = {
  employee_id: string;
  manager_name: string | null;
  contract_type: ContractType | null;
};
export type Organisation = {
  id: string;
  name: string;
  cui: string;
  created_by: string | null;
  created_at: string;
  status: OrganisationStatus;
  status_reason: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  registration_number: string | null;
  registered_address: string | null;
  city: string | null;
  county: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  version: number;
};
export type PlatformOrganisation = Organisation & {
  employee_count: number;
  member_count: number;
  owners: string[];
  history: Pick<
    AuditEntry,
    "id" | "action" | "user_id" | "metadata" | "created_at"
  >[];
};
export type Membership = {
  organisation_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  email: string;
  created_at: string;
};
export type Employee = {
  id: string;
  organisation_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_title: string;
  department: string;
  workplace: string;
  start_date: string;
  status: EmployeeStatus;
  manager_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type Contract = {
  review_version: number;
  id: string;
  organisation_id: string;
  employee_id: string;
  contract_number: string;
  start_date: string;
  end_date: string | null;
  job_title: string;
  cor_code: string;
  contract_type: ContractType;
  working_hours: number;
  workplace: string;
  gross_salary: number;
  currency: string;
  probation_days: number;
  status: ContractStatus;
  parent_contract_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type AuditEntry = {
  id: string;
  organisation_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  metadata: {
    changed_fields?: string[];
    role?: string;
    from_status?: OrganisationStatus;
    to_status?: OrganisationStatus;
    reason?: string;
  };
  created_at: string;
};
export type ActionState = {
  error?: string;
  success?: string;
  fields?: Record<string, string[]>;
  values?: Record<string, string>;
};
export const canManage = (role: Role) =>
  role === "organisation_owner" || role === "hr_manager";
