export const DOCUMENT_BUCKET = "hrconnector-employee-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export type EmployeeDocument = {
  id: string; organisation_id: string; employee_id: string; title: string;
  category: "employment" | "identity" | "certificate" | "other";
  visibility: "hr_only" | "employee"; origin: "uploaded" | "generated";
  status: "pending" | "uploaded" | "generated" | "signed" | "archived";
  filename: string; byte_size: number; object_path: string;
  created_by: string | null; created_at: string; ready_at: string | null;
  signed_at: string | null; signed_by: string | null; version: number;
};
export type LifecycleCase = {
  id: string; organisation_id: string; employee_id: string;
  kind: "onboarding" | "offboarding"; status: "active" | "completed" | "cancelled";
  target_date: string; created_by: string | null; created_at: string;
  closed_at: string | null; close_note: string; version: number;
};
export type LifecycleTask = {
  id: string; organisation_id: string; case_id: string; task_key: string;
  title: string; position: number; status: "todo" | "done" | "skipped";
  note: string; completed_by: string | null; completed_at: string | null;
  revoked_user_id: string | null; version: number;
};
