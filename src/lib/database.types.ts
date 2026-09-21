import type {
  Organisation,
  Membership,
  Employee,
  Contract,
  AuditEntry,
  Role,
  DirectoryDetail,
  PlatformOrganisation,
  OrganisationStatus,
} from "./types";
import type {
  LeaveType,
  LeaveBalance,
  CalendarDay,
  LeaveRequest,
  Attendance,
  LeaveCategory,
  LeaveStatus,
  AttendanceAbsence,
  BalanceSummary,
  AttendanceDay,
} from "./time-types";
import type {
  Benefit,
  BenefitProvider,
  EmployeeBenefit,
  BenefitRun,
  BenefitItem,
  BenefitModel,
  BenefitAdapterKey,
  BenefitSummary,
} from "./benefit-types";
import type { EmployeeDocument, LifecycleCase, LifecycleTask } from "./document-types";
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
// Keep aligned with migrations. Regenerate with `supabase gen types typescript` when connected.
export type Database = {
  public: {
    Tables: {
      employee_documents: Table<EmployeeDocument>;
      lifecycle_cases: Table<LifecycleCase>;
      lifecycle_tasks: Table<LifecycleTask>;
      organisations: Table<Organisation>;
      organisation_users: Table<Membership>;
      employees: Table<Employee>;
      employment_contracts: Table<Contract>;
      audit_log: Table<AuditEntry>;
      leave_types: Table<LeaveType>;
      leave_balances: Table<LeaveBalance>;
      work_calendar_days: Table<CalendarDay>;
      leave_requests: Table<LeaveRequest>;
      attendance: Table<Attendance>;
      benefit_providers: Table<BenefitProvider>;
      benefits: Table<Benefit>;
      employee_benefits: Table<EmployeeBenefit>;
      benefit_runs: Table<BenefitRun>;
      benefit_run_items: Table<BenefitItem>;
    };
    Views: Record<string, never>;
    Functions: {
      prepare_employee_document: { Args: { p_org: string; p_employee: string; p_title: string; p_category: string; p_visibility: string; p_origin: string; p_filename: string; p_bytes: number }; Returns: string };
      complete_employee_document: { Args: { p_org: string; p_id: string; p_version: number }; Returns: undefined };
      update_employee_document: { Args: { p_org: string; p_id: string; p_version: number; p_action: string; p_visibility: string }; Returns: undefined };
      create_lifecycle_case: { Args: { p_org: string; p_employee: string; p_kind: string; p_target: string }; Returns: string };
      add_lifecycle_task: { Args: { p_org: string; p_case: string; p_version: number; p_title: string }; Returns: undefined };
      update_lifecycle_task: { Args: { p_org: string; p_id: string; p_version: number; p_status: string; p_note: string }; Returns: undefined };
      revoke_lifecycle_access: { Args: { p_org: string; p_id: string; p_version: number; p_user: string | null; p_note: string }; Returns: undefined };
      close_lifecycle_case: { Args: { p_org: string; p_id: string; p_version: number; p_status: string; p_note: string }; Returns: undefined };
      save_benefit_provider: {
        Args: {
          p_org: string;
          p_id: string | null;
          p_version: number | null;
          p_name: string;
          p_adapter: BenefitAdapterKey;
          p_active: boolean;
        };
        Returns: string;
      };
      save_benefit: {
        Args: {
          p_org: string;
          p_id: string | null;
          p_version: number | null;
          p_provider: string;
          p_name: string;
          p_model: BenefitModel;
          p_amount: number;
          p_active: boolean;
        };
        Returns: string;
      };
      save_employee_benefit: {
        Args: {
          p_org: string;
          p_id: string | null;
          p_version: number | null;
          p_employee: string;
          p_benefit: string;
          p_start: string;
          p_end: string | null;
          p_active: boolean;
        };
        Returns: string;
      };
      prepare_benefit_month: {
        Args: { p_org: string; p_month: string; p_version: number | null };
        Returns: string;
      };
      review_benefit_item: {
        Args: {
          p_org: string;
          p_id: string;
          p_version: number;
          p_included: boolean;
          p_amount: number;
          p_note: string;
        };
        Returns: undefined;
      };
      approve_benefit_month: {
        Args: { p_org: string; p_id: string; p_version: number };
        Returns: undefined;
      };
      benefit_month_summary: {
        Args: { p_org: string; p_run: string };
        Returns: BenefitSummary;
      };
      leave_calendar: {
        Args: { p_org: string; p_month: string; p_employee: string | null };
        Returns: { day: string; pending: number; approved: number }[];
      };
      request_leave: {
        Args: {
          p_org: string;
          p_employee: string;
          p_type: string;
          p_start: string;
          p_end: string;
        };
        Returns: string;
      };
      decide_leave: {
        Args: {
          p_org: string;
          p_id: string;
          p_version: number;
          p_status: LeaveStatus;
          p_note: string;
        };
        Returns: undefined;
      };
      save_leave_type: {
        Args: {
          p_org: string;
          p_id: string | null;
          p_name: string;
          p_category: LeaveCategory;
          p_deducts: boolean;
          p_active: boolean;
        };
        Returns: undefined;
      };
      save_leave_allowance: {
        Args: {
          p_org: string;
          p_employee: string;
          p_type: string;
          p_year: number;
          p_allowance: number;
        };
        Returns: undefined;
      };
      save_calendar_day: {
        Args: {
          p_org: string;
          p_day: string;
          p_working: boolean;
          p_label: string;
        };
        Returns: undefined;
      };
      save_attendance: {
        Args: {
          p_org: string;
          p_employee: string;
          p_day: string;
          p_planned: number;
          p_worked: number;
          p_absence: AttendanceAbsence;
          p_version: number | null;
        };
        Returns: undefined;
      };
      leave_balance_summary: {
        Args: { p_org: string; p_employee: string; p_year: number };
        Returns: BalanceSummary[];
      };
      attendance_month: {
        Args: { p_org: string; p_employee: string; p_month: string };
        Returns: AttendanceDay[];
      };
      platform_organisation_list: {
        Args: { p_search: string; p_status: string; p_page: number };
        Returns: { total: number; organisations: PlatformOrganisation[] };
      };
      platform_save_organisation: {
        Args: {
          p_id: string | null;
          p_version: number | null;
          p_details: Record<string, string | null>;
          p_owner_email?: string | null;
        };
        Returns: string;
      };
      platform_set_organisation_status: {
        Args: {
          p_id: string;
          p_version: number;
          p_status: OrganisationStatus;
          p_reason: string;
        };
        Returns: undefined;
      };
      employee_directory_details: {
        Args: { p_organisation_id: string; p_employee_ids: string[] };
        Returns: DirectoryDetail[];
      };
      dashboard_summary: {
        Args: { p_organisation_id: string };
        Returns: {
          total: number;
          active: number;
          starting: number;
          ending: number;
          drafts: number;
          departments: { department: string; count: number }[];
        };
      };
      employee_departments: {
        Args: { p_organisation_id: string };
        Returns: { department: string }[];
      };
      create_organisation: {
        Args: { p_name: string; p_cui: string };
        Returns: string;
      };
      set_organisation_member: {
        Args: {
          p_organisation_id: string;
          p_email: string;
          p_role: Role;
          p_employee_id?: string | null;
        };
        Returns: undefined;
      };
      is_platform_admin: { Args: Record<string, never>; Returns: boolean };
      platform_organisations: {
        Args: Record<string, never>;
        Returns: Pick<Organisation, "id" | "name" | "cui" | "created_at">[];
      };
    };
    Enums: {
      organisation_role: Role;
      organisation_status: OrganisationStatus;
      leave_category: LeaveCategory;
      leave_status: LeaveStatus;
      attendance_absence: AttendanceAbsence;
      benefit_model: BenefitModel;
    };
    CompositeTypes: Record<string, never>;
  };
};
