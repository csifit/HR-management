import type {
  Organisation,
  Membership,
  Employee,
  Contract,
  AuditEntry,
  Role,
  DirectoryDetail,
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
    Enums: { organisation_role: Role };
    CompositeTypes: Record<string, never>;
  };
};
