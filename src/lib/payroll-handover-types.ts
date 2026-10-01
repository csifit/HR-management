import type { PayrollInput, PayrollResult } from "./payroll";
import type { Locale } from "./i18n";

export type PayrollMoneyKey = Exclude<
  keyof PayrollResult,
  "rules" | "month" | "settlement"
>;
export type PayrollHandoverItem = {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  job_title: string;
  contract_number: string;
  input: PayrollInput;
  result: PayrollResult;
};
export type PayrollHandoverPayload = {
  export_id: string;
  prepared_at: string;
  organisation_id: string;
  locale: Locale;
  format_version:
    | "HRConnector-accountant-v1"
    | "HRConnector-accountant-v2"
    | "HRConnector-accountant-v3";
  run: {
    id: string;
    month: string;
    revision: number;
    version: number;
    approved_at: string;
    previous_run_id: string | null;
  };
  latest_approved_run_id: string;
  latest_approved_revision: number;
  is_historical: boolean;
  has_open_correction: boolean;
  company: { name: string; cui: string; address: string };
  items: PayrollHandoverItem[];
};
export type PayrollHandoverExport = {
  id: string;
  organisation_id: string;
  run_id: string;
  run_version: number;
  revision: number;
  prepared_by: string;
  prepared_at: string;
  locale: Locale;
  is_historical: boolean;
  latest_approved_run_id: string;
  latest_approved_revision: number;
  has_open_correction: boolean;
  employee_count: number;
  format_version: string;
};
