import { z } from "zod";
// Pure module shared by form actions and regression tests.
export const privacyDate = z.iso
  .date()
  .refine((v) => v >= "2000-01-01" && v <= "2200-12-31");
export function calendarMonthAfter(value: string) {
  if (!privacyDate.safeParse(value).success) return "";
  const date = new Date(`${value}T12:00:00Z`);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      Math.min(date.getUTCDate(), lastDay),
    ),
  )
    .toISOString()
    .slice(0, 10);
}
export const createPrivacySchema = z
  .object({
    employee_id: z.uuid(),
    kind: z.enum([
      "access",
      "rectification",
      "erasure",
      "restriction",
      "portability",
      "objection",
    ]),
    received_on: privacyDate,
    due_on: privacyDate,
    channel: z.enum(["email", "in_person", "post", "other"]),
    summary: z.string().trim().min(3).max(1000),
    assigned_to: z.uuid(),
  })
  .refine((v) => v.due_on >= v.received_on);
const optionalDate = z
  .union([privacyDate, z.literal("")])
  .transform((v) => v || null);
export const updatePrivacySchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().positive().max(2147483647),
  status: z.enum([
    "received",
    "in_review",
    "completed",
    "refused",
    "withdrawn",
  ]),
  assigned_to: z.uuid(),
  identity_reference: z.string().trim().max(200),
  due_on: privacyDate,
  extension_reason: z.string().trim().max(1000),
  extension_notified_on: optionalDate,
  response_reference: z.string().trim().max(200),
  responded_on: optionalDate,
  resolution: z.string().trim().max(2000),
});
