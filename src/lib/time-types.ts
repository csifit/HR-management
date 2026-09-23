export type LeaveCategory = "annual" | "medical" | "unpaid" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type AttendanceAbsence = "none" | "medical" | "unpaid" | "other";
export type LeaveType = {
  id: string;
  organisation_id: string;
  name: string;
  category: LeaveCategory;
  deducts_balance: boolean;
  active: boolean;
};
export type LeaveBalance = {
  id: string;
  organisation_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allowance: number;
};
export type CalendarDay = {
  id: string;
  organisation_id: string;
  day: string;
  is_working: boolean;
  label: string;
};
export type LeaveRequest = {
  id: string;
  organisation_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  work_dates: string[];
  days: number;
  status: LeaveStatus;
  submitted_by: string;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  version: number;
};
export type Attendance = {
  id: string;
  organisation_id: string;
  employee_id: string;
  day: string;
  planned_hours: number;
  worked_hours: number;
  absence: AttendanceAbsence;
  updated_by: string;
  updated_at: string;
  version: number;
};
export type BalanceSummary = {
  leave_type_id: string;
  name: string;
  allowance: number | null;
  used: number;
  pending: number;
  remaining: number | null;
  available: number | null;
};
export type AttendanceDay = {
  day: string;
  planned_hours: number;
  worked_hours: number | null;
  category: LeaveCategory | "none" | "unrecorded" | "automatic";
  recorded: boolean;
  version: number | null;
  leave_request_id: string | null;
};
export type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
  user_id: string | null;
  manager_user_id: string | null;
  start_date: string;
};
