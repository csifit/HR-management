"use server";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { brand } from "@/lib/brand";
import { dictionary } from "@/lib/i18n";
import { documentDictionary } from "@/lib/document-i18n";
import { DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES } from "@/lib/document-types";
import { uploadDocumentSchema,generateDocumentSchema,documentIdSchema,documentUpdateSchema } from "@/lib/document-validation";
import { parseDocumentAction,finishDocumentAction } from "@/lib/document-actions";
import { generateEmployeePdf,isReadablePdf,UnsupportedPdfText } from "@/lib/document-pdf";
import type { ActionState } from "@/lib/types";

export async function prepareUpload(form:FormData):Promise<ActionState & {id?:string;path?:string}> {
  const p=await parseDocumentAction(uploadDocumentSchema,form);
  if(p.error) return p.error;
  const v=p.data,c=p.context;
  const {data:id,error}=await c.supabase.rpc("prepare_employee_document",{p_org:c.organisation.id,p_employee:v.employee_id,p_title:v.title,p_category:v.category,p_visibility:v.visibility,p_origin:"uploaded",p_filename:v.filename,p_bytes:v.byte_size});
  if(error||!id) return finishDocumentAction(error??{},p.values);
  return {id,path:`${c.organisation.id}/${id}.pdf`};
}
export async function completeUpload(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(documentIdSchema,form);
  if(p.error) return p.error;
  const c=p.context,d=documentDictionary(await getLocale());
  const {data:doc,error}=await c.supabase.from("employee_documents").select("*").eq("organisation_id",c.organisation.id).eq("id",p.data.id).single();
  if(error||!doc) return {error:d.denied};
  if(doc.status!=="pending"||doc.version!==p.data.version) return {error:d.stale};
  const {data:file,error:downloadError}=await c.supabase.storage.from(DOCUMENT_BUCKET).download(doc.object_path);
  if(downloadError||!file) return {error:d.incomplete};
  if(file.size!==doc.byte_size||file.size>MAX_DOCUMENT_BYTES||!(await isReadablePdf(new Uint8Array(await file.arrayBuffer())))) return {error:d.pdfError};
  const result=await c.supabase.rpc("complete_employee_document",{p_org:c.organisation.id,p_id:doc.id,p_version:doc.version});
  return finishDocumentAction(result.error);
}
export async function generateDocument(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(generateDocumentSchema,form);
  if(p.error) return p.error;
  const c=p.context,v=p.data,locale=await getLocale(),d=documentDictionary(locale),labels=dictionary(locale);
  const {data:e,error:employeeError}=await c.supabase.from("employees").select("*").eq("organisation_id",c.organisation.id).eq("id",v.employee_id).single();
  if(employeeError||!e) return {error:d.denied};
  let bytes:Uint8Array;
  try {
    bytes=await generateEmployeePdf({locale,brandName:brand.name,title:v.title,template:v.template,body:v.body,
      company:{name:c.organisation.name,cui:c.organisation.cui,address:[c.organisation.registered_address,c.organisation.city,c.organisation.county].filter(Boolean).join(", ")},
      employee:{name:`${e.first_name} ${e.last_name}`,email:e.email,job:e.job_title,department:e.department,workplace:e.workplace,start:e.start_date,status:labels[e.status]},generatedAt:new Date()});
  } catch(error) { return {error:error instanceof UnsupportedPdfText?d.unsupported:d.error,values:p.values}; }
  const {data:id,error}=await c.supabase.rpc("prepare_employee_document",{p_org:c.organisation.id,p_employee:e.id,p_title:v.title,p_category:v.category,p_visibility:v.visibility,p_origin:"generated",p_filename:`${v.template}.pdf`,p_bytes:bytes.length});
  if(error||!id) return finishDocumentAction(error??{},p.values);
  const uploaded=await c.supabase.storage.from(DOCUMENT_BUCKET).upload(`${c.organisation.id}/${id}.pdf`,bytes,{contentType:"application/pdf",upsert:false,cacheControl:"0"});
  if(uploaded.error) { await finishDocumentAction(null); return {error:d.uploadError,values:p.values}; }
  const result=await c.supabase.rpc("complete_employee_document",{p_org:c.organisation.id,p_id:id,p_version:1});
  return finishDocumentAction(result.error,p.values);
}
export async function updateDocument(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(documentUpdateSchema,form);
  if(p.error) return p.error;
  const v=p.data,c=p.context;
  const result=await c.supabase.rpc("update_employee_document",{p_org:c.organisation.id,p_id:v.id,p_version:v.version,p_action:v.operation,p_visibility:v.visibility});
  return finishDocumentAction(result.error,p.values);
}
// Refresh incomplete rows after a failed browser transfer, without exposing an unauthenticated invalidation action.
export async function refreshDocuments() { await requireHR(); await finishDocumentAction(null); }
