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
      organisations: Table<Organisation>;
      organisation_users: Table<Membership>;
      employees: Table<Employee>;
      employment_contracts: Table<Contract>;
      audit_log: Table<AuditEntry>;
    };
    Views: Record<string, never>;
    Functions: {
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
    Enums: { organisation_role: Role; organisation_status: OrganisationStatus };
    CompositeTypes: Record<string, never>;
  };
};
