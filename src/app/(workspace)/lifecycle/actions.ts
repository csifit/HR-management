"use server";
import { redirect } from "next/navigation";
import { parseDocumentAction,finishDocumentAction } from "@/lib/document-actions";
import { lifecycleSchema,addTaskSchema,taskSchema,revokeSchema,closeCaseSchema } from "@/lib/document-validation";
import type { ActionState } from "@/lib/types";
export async function createCase(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(lifecycleSchema,form); if(p.error) return p.error;
  const {data:id,error}=await p.context.supabase.rpc("create_lifecycle_case",{p_org:p.context.organisation.id,p_employee:p.data.employee_id,p_kind:p.data.kind,p_target:p.data.target_date});
  if(error||!id) return finishDocumentAction(error??{},p.values);
  await finishDocumentAction(null); redirect(`/lifecycle/${id}`);
}
export async function addTask(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(addTaskSchema,form); if(p.error) return p.error;
  const {error}=await p.context.supabase.rpc("add_lifecycle_task",{p_org:p.context.organisation.id,p_case:p.data.id,p_version:p.data.version,p_title:p.data.title});
  return finishDocumentAction(error,p.values);
}
export async function updateTask(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(taskSchema,form); if(p.error) return p.error;
  const {error}=await p.context.supabase.rpc("update_lifecycle_task",{p_org:p.context.organisation.id,p_id:p.data.id,p_version:p.data.version,p_status:p.data.status,p_note:p.data.note});
  return finishDocumentAction(error,p.values);
}
export async function revokeAccess(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(revokeSchema,form); if(p.error) return p.error;
  const {error}=await p.context.supabase.rpc("revoke_lifecycle_access",{p_org:p.context.organisation.id,p_id:p.data.id,p_version:p.data.version,p_user:p.data.user_id,p_note:p.data.note});
  return finishDocumentAction(error,p.values);
}
export async function closeCase(_s:ActionState,form:FormData):Promise<ActionState> {
  const p=await parseDocumentAction(closeCaseSchema,form); if(p.error) return p.error;
  const {error}=await p.context.supabase.rpc("close_lifecycle_case",{p_org:p.context.organisation.id,p_id:p.data.id,p_version:p.data.version,p_status:p.data.status,p_note:p.data.note});
  return finishDocumentAction(error,p.values);
}
