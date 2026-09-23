export type EmployeeInvitation = {
  id: string;
  organisation_id: string;
  employee_id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
  delivery_status: "unsent" | "sending" | "accepted" | "failed" | "uncertain";
  attempt: number;
  requested_by: string | null;
  sent_at: string | null;
  accepted_by: string | null;
  created_at: string;
};
