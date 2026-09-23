"use server";
import { z } from "zod";
import {
  parseDocumentAction,
  finishDocumentAction,
} from "@/lib/document-actions";
import { DOCUMENT_BUCKET } from "@/lib/document-types";
import { mailConfig, sendEmployeeDocument } from "@/lib/mail";
import { getLocale } from "@/lib/locale";
import type { ActionState } from "@/lib/types";
const schema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().positive(),
  recipient: z.email(),
  confirm: z.literal("on"),
});
export async function emailDocument(
  _s: ActionState,
  form: FormData,
): Promise<ActionState> {
  const p = await parseDocumentAction(schema, form);
  if (p.error) return p.error;
  const ro = (await getLocale()) === "ro",
    c = p.context;
  if (!mailConfig().success)
    return {
      error: ro
        ? "Configurează conexiunea SMTP pe server înainte de trimitere."
        : "Configure the server SMTP connection before sending.",
    };
  const { data: doc, error } = await c.supabase
    .from("employee_documents")
    .select("*")
    .eq("organisation_id", c.organisation.id)
    .eq("id", p.data.id)
    .single();
  if (error || !doc) return finishDocumentAction({ code: "42501" });
  const downloaded = await c.supabase.storage
    .from(DOCUMENT_BUCKET)
    .download(doc.object_path);
  if (downloaded.error || !downloaded.data)
    return finishDocumentAction({ code: "D0002" });
  const prepared = await c.supabase.rpc("prepare_document_email", {
    p_org: c.organisation.id,
    p_document: doc.id,
    p_version: p.data.version,
    p_recipient: p.data.recipient,
  });
  if (prepared.error || !prepared.data)
    return {
      error: ro
        ? "Documentul, destinatarul sau starea trimiterii s-a schimbat. Reîncarcă pagina și verifică istoricul."
        : "The document, recipient or delivery state changed. Refresh and check the delivery history.",
    };
  const status = await sendEmployeeDocument({
    recipient: p.data.recipient,
    filename: doc.filename,
    bytes: new Uint8Array(await downloaded.data.arrayBuffer()),
    company: c.organisation.name,
  });
  const completed = await c.supabase.rpc("finish_document_email", {
    p_org: c.organisation.id,
    p_id: prepared.data,
    p_status: status,
  });
  await finishDocumentAction(null);
  if (completed.error || status === "uncertain")
    return {
      error: ro
        ? "Rezultat necunoscut. Nu reîncerca până nu verifici în MXroute dacă mesajul a fost acceptat."
        : "Delivery outcome is uncertain. Check MXroute before attempting another send.",
    };
  return status === "accepted"
    ? {
        success: ro
          ? "MXroute a acceptat mesajul. Livrarea în inbox nu este confirmată."
          : "MXroute accepted the message. Inbox delivery is not confirmed.",
      }
    : {
        error: ro
          ? "Mesajul a fost respins. Verifică setările SMTP și destinatarul."
          : "The message was rejected. Check SMTP settings and the recipient.",
      };
}
