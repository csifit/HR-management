"use server";
import { z } from "zod";
import {
  parseDocumentAction,
  finishDocumentAction,
} from "@/lib/document-actions";
import type { ActionState } from "@/lib/types";
import { revalidatePath } from "next/cache";
const uuid = z.union([z.uuid(), z.literal("")]).transform((v) => v || null);
const schema = z
  .object({
    employer_id: uuid,
    author_id: uuid,
    version: z
      .union([z.literal(""), z.coerce.number().int().positive()])
      .transform((v) => (v === "" ? null : v)),
  })
  .refine((v) => Boolean(v.employer_id) === Boolean(v.author_id));
export async function saveReges(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parseDocumentAction(schema, form);
  if (p.error) return p.error;
  const { error } = await p.context.supabase.rpc("save_reges_identifiers", {
    p_org: p.context.organisation.id,
    p_version: p.data.version,
    p_employer: p.data.employer_id,
    p_author: p.data.author_id,
  });
  if (!error) revalidatePath("/integrations/reges");
  return finishDocumentAction(error, p.values);
}
