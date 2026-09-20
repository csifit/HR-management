export type Role = "organisation_owner" | "hr_manager" | "manager" | "employee";
export type EmployeeStatus =
  "active" | "onboarding" | "suspended" | "terminated";
export type ContractStatus = "draft" | "active" | "suspended" | "terminated";
export type ContractType = "indefinite" | "fixed_term";
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
  metadata: { changed_fields?: string[]; role?: string };
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
