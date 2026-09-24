export const privacyKinds = [
  "access",
  "rectification",
  "erasure",
  "restriction",
  "portability",
  "objection",
] as const;
export const privacyStatuses = [
  "received",
  "in_review",
  "completed",
  "refused",
  "withdrawn",
] as const;
export const privacyChannels = ["email", "in_person", "post", "other"] as const;
export type PrivacyRequest = {
  id: string;
  organisation_id: string;
  employee_id: string;
  kind: (typeof privacyKinds)[number];
  status: (typeof privacyStatuses)[number];
  channel: (typeof privacyChannels)[number];
  summary: string;
  assigned_to: string;
  received_on: string;
  initial_due_on: string;
  due_on: string;
  identity_reference: string;
  identity_verified_by: string | null;
  identity_verified_at: string | null;
  extension_reason: string;
  extension_notified_on: string | null;
  response_reference: string;
  responded_on: string | null;
  resolution: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
};
export type PrivacyEvent = {
  id: string;
  organisation_id: string;
  request_id: string;
  actor_id: string;
  created_at: string;
  request_version: number;
  snapshot: Partial<PrivacyRequest>;
};
export type PrivacyExport = {
  id: string;
  organisation_id: string;
  request_id: string;
  request_version: number;
  prepared_by: string;
  prepared_at: string;
  attendance_from: string;
  attendance_to: string;
  documents: { id: string; version: number }[];
};
export type PrivacyExportPayload = {
  export_id: string;
  prepared_at: string;
  request_id: string;
  organisation_id: string;
  employee_id: string;
  attendance_from: string;
  attendance_to: string;
  data: Record<string, unknown>;
  files: {
    id: string;
    version: number;
    title: string;
    byte_size: number;
    object_path: string;
  }[];
};
export const privacyClosed = (status: string) =>
  ["completed", "refused", "withdrawn"].includes(status);
