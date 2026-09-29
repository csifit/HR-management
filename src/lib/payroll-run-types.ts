import type { PayrollInput, PayrollResult } from "./payroll";
import type { PdfInput } from "./document-pdf";

export type PayrollRun = {
  id: string;
  organisation_id: string;
  month: string;
  revision: number;
  status: "draft" | "approved" | "discarded";
  previous_run_id: string | null;
  reason: string;
  version: number;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};
export type PayrollSource = {
  company: PdfInput["company"];
  employee: PdfInput["employee"];
  [key: string]: unknown;
};
export type PayrollRunItem = {
  id: string;
  organisation_id: string;
  run_id: string;
  employee_id: string;
  input: PayrollInput;
  result: PayrollResult;
  source: PayrollSource;
  saved_by: string;
  updated_at: string;
};
export type PayrollRunEvent = {
  id: string;
  organisation_id: string;
  run_id: string;
  item_id: string | null;
  action: string;
  actor_id: string;
  created_at: string;
  snapshot: Record<string, unknown>;
};
export type PayrollRunDocument = {
  organisation_id: string;
  document_id: string;
  run_id: string;
  item_id: string;
  locale: "ro" | "en";
  created_at: string;
};
