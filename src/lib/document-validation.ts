import { z } from "zod";
// Matches the bucket limit and employee_documents.byte_size constraint.
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const text = (max: number) => z.string().trim().min(1).max(max);
const version = z.coerce.number().int().min(1);
export const documentFields = z.object({
  employee_id: z.uuid(), title: text(160),
  category: z.enum(["employment", "identity", "certificate", "other"]),
  visibility: z.enum(["hr_only", "employee"]),
});
export const uploadDocumentSchema = documentFields.extend({
  filename: text(180).regex(/\.pdf$/i).refine(v => !/[\p{Cc}/\\]/u.test(v)),
  byte_size: z.coerce.number().int().min(5).max(MAX_DOCUMENT_BYTES),
});
export const generateDocumentSchema = documentFields.extend({
  template: z.enum(["summary", "letter"]),
  body: z.string().trim().max(12000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)),
}).refine(v => v.template !== "letter" || v.body.length >= 10);
export const documentIdSchema = z.object({ id: z.uuid(), version });
export const documentUpdateSchema = documentIdSchema.extend({
  operation: z.enum(["archive", "visibility", "signed"]),
  visibility: z.enum(["hr_only", "employee"]),
  confirm: z.literal("on"),
});
export const lifecycleSchema = z.object({
  employee_id: z.uuid(), kind: z.enum(["onboarding", "offboarding"]),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v && v >= "1900-01-01" && v <= "2200-12-31";
  }),
});
export const addTaskSchema = documentIdSchema.extend({title: text(160)});
export const taskSchema = documentIdSchema.extend({
  status: z.enum(["todo", "done", "skipped"]), note: z.string().trim().max(1000),
}).refine(v => v.status !== "skipped" || v.note.length >= 5);
export const revokeSchema = documentIdSchema.extend({
  user_id: z.union([z.uuid(), z.literal("")]).transform(v => v || null),
  note: text(1000).min(5), confirm: z.literal("on"),
});
export const closeCaseSchema = documentIdSchema.extend({
  status: z.enum(["completed", "cancelled"]), note: z.string().trim().max(1000), confirm: z.literal("on"),
}).refine(v => v.status !== "cancelled" || v.note.length >= 5);
