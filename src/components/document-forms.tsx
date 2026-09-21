"use client";
import { useActionState, useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { prepareUpload, completeUpload, generateDocument, updateDocument, refreshDocuments } from "@/app/(workspace)/documents/actions";
import { createCase, addTask, updateTask, revokeAccess, closeCase } from "@/app/(workspace)/lifecycle/actions";
import { documentDictionary } from "@/lib/document-i18n";
import { DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES, type EmployeeDocument, type LifecycleCase, type LifecycleTask } from "@/lib/document-types";
import { browserSupabase } from "@/lib/supabase/browser";
import type { Locale } from "@/lib/i18n";
import type { ActionState } from "@/lib/types";
type Action = (state:ActionState,form:FormData)=>Promise<ActionState>;
function Field({label,children}:{label:string;children:ReactNode}) { return <label className="field time-field"><span>{label}</span>{children}</label>; }
function Feedback({state}:{state:ActionState}) { return <>{state.error&&<p className="notice error" role="alert">{state.error}</p>}{state.success&&<p className="notice success" role="status">{state.success}</p>}</>; }
function Form({action,children,locale,label}:{action:Action;children:(state:ActionState)=>ReactNode;locale:Locale;label?:string}) {
  const [state,submit,pending]=useActionState(action,{}),d=documentDictionary(locale);
  return <form action={submit} className="form-stack time-form"><Feedback state={state}/><fieldset disabled={pending} className="time-fieldset form-stack">{children(state)}<button className="button primary" type="submit">{pending?d.busy:label??d.save}</button></fieldset></form>;
}
function Identity({record}:{record:{id:string;version:number}}) {return <><input type="hidden" name="id" value={record.id}/><input type="hidden" name="version" value={record.version}/></>;}
function Confirm({locale}:{locale:Locale}) {return <label className="benefit-confirm"><input type="checkbox" name="confirm" required/>{documentDictionary(locale).confirm}</label>;}
function DocumentFields({employeeId,locale,state}:{employeeId:string;locale:Locale;state?:ActionState}) {
  const d=documentDictionary(locale);
  return <><input type="hidden" name="employee_id" value={employeeId}/>
    <Field label={d.titleField}><input name="title" required maxLength={160} defaultValue={state?.values?.title??""}/></Field>
    <div className="form-grid"><Field label={d.category}><select name="category" defaultValue={state?.values?.category??"employment"}>{(["employment","identity","certificate","other"] as const).map(v=><option key={v} value={v}>{d[v]}</option>)}</select></Field>
    <Field label={d.visibility}><select name="visibility" defaultValue={state?.values?.visibility??"hr_only"}><option value="hr_only">{d.hr_only}</option><option value="employee">{d.employeeVisible}</option></select></Field></div></>;
}
export function UploadDocumentForm({employeeId,locale}:{employeeId:string;locale:Locale}) {
  const [state,setState]=useState<ActionState>({}),[pending,setPending]=useState(false),router=useRouter(),d=documentDictionary(locale);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget,data=new FormData(form),file=data.get("file");
    setState({}); setPending(true);
    try {
      if(!(file instanceof File)||file.size<5||file.size>MAX_DOCUMENT_BYTES||!file.name.toLowerCase().endsWith(".pdf")||new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=="%PDF-") {setState({error:d.pdfError});return;}
      data.delete("file");data.set("filename",file.name);data.set("byte_size",String(file.size));
      const prepared=await prepareUpload(data);
      if(!prepared.id||!prepared.path){setState(prepared);return;}
      const {error}=await browserSupabase().storage.from(DOCUMENT_BUCKET).upload(prepared.path,file,{contentType:"application/pdf",cacheControl:"0",upsert:false});
      if(error){await refreshDocuments();setState({error:d.uploadError});return;}
      const finish=new FormData();finish.set("id",prepared.id);finish.set("version","1");
      const result=await completeUpload({},finish);setState(result);
      if(result.success)form.reset();
      router.refresh();
    }catch {setState({error:d.uploadError});router.refresh();}finally{setPending(false);}
  }
  return <form onSubmit={submit} className="form-stack time-form"><Feedback state={state}/><fieldset disabled={pending} className="time-fieldset form-stack"><DocumentFields employeeId={employeeId} locale={locale}/><Field label={d.file}><input type="file" name="file" accept="application/pdf,.pdf" required/></Field><p className="time-help">{d.fileHelp}</p><button className="button primary" type="submit">{pending?d.busy:d.upload}</button></fieldset></form>;
}
export function GenerateDocumentForm({employeeId,locale}:{employeeId:string;locale:Locale}) {
  const d=documentDictionary(locale),[template,setTemplate]=useState("summary");
  return <Form action={generateDocument} locale={locale} label={d.generate}>{s=><><DocumentFields employeeId={employeeId} locale={locale} state={s}/><Field label={d.template}><select name="template" value={template} onChange={e=>setTemplate(e.target.value)}><option value="summary">{d.summary}</option><option value="letter">{d.letter}</option></select></Field><Field label={d.body}><textarea name="body" rows={8} maxLength={12000} minLength={template==="letter"?10:undefined} required={template==="letter"} defaultValue={s.values?.body??""} readOnly={template==="summary"}/></Field><p className="time-help">{d.bodyHelp}</p></>}</Form>;
}
export function DocumentDownload({document,locale}:{document:EmployeeDocument;locale:Locale}) {
  const [pending,setPending]=useState(false),[error,setError]=useState(false),d=documentDictionary(locale);
  async function download() {
    setPending(true);setError(false);
    try {
      const {data,error}=await browserSupabase().storage.from(DOCUMENT_BUCKET).download(document.object_path);
      if(error||!data)throw new Error("Download failed");
      const url=URL.createObjectURL(data),link=window.document.createElement("a");
      link.href=url;link.download=document.filename;window.document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch{setError(true);}finally{setPending(false);}
  }
  return <div><button className="button secondary" type="button" disabled={pending} onClick={download}>{d.download}{pending?"…":""}</button>{error&&<p className="time-help" role="alert">{d.denied}</p>}</div>;
}
export function DocumentManage({document:doc,locale}:{document:EmployeeDocument;locale:Locale}) {
  const d=documentDictionary(locale);
  return <div className="form-stack">{doc.status==="pending"&&<Form action={completeUpload} locale={locale} label={d.finish}>{()=> <Identity record={doc}/>}</Form>}
    <Form action={updateDocument} locale={locale}>{s=><><Identity record={doc}/><Field label={d.actions}><select name="operation" defaultValue={s.values?.operation??"visibility"}><option value="visibility">{d.saveVisibility}</option>{doc.ready_at&&doc.status!=="signed"&&<option value="signed">{d.markSigned}</option>}<option value="archive">{d.archive}</option></select></Field><Field label={d.visibility}><select name="visibility" defaultValue={s.values?.visibility??doc.visibility}><option value="hr_only">{d.hr_only}</option><option value="employee">{d.employeeVisible}</option></select></Field><p className="time-help">{d.signedHelp}</p><Confirm locale={locale}/></>}</Form></div>;
}
export function CreateCaseForm({employeeId,locale}:{employeeId:string;locale:Locale}) {
  const d=documentDictionary(locale);
  return <Form action={createCase} locale={locale} label={d.newCase}>{s=><><input type="hidden" name="employee_id" value={employeeId}/><Field label={d.kind}><select name="kind" defaultValue={s.values?.kind??"onboarding"}><option value="onboarding">{d.onboarding}</option><option value="offboarding">{d.offboarding}</option></select></Field><Field label={d.target}><input type="date" name="target_date" required min="1900-01-01" max="2200-12-31" defaultValue={s.values?.target_date??""}/></Field></>}</Form>;
}
export function TaskForm({task,locale}:{task:LifecycleTask;locale:Locale}) {
  const d=documentDictionary(locale);
  return <Form action={updateTask} locale={locale}>{s=><><Identity record={task}/><Field label={d.state}><select name="status" defaultValue={s.values?.status??task.status}>{(["todo","done","skipped"] as const).map(v=><option key={v} value={v}>{d[v]}</option>)}</select></Field><Field label={d.note}><textarea name="note" rows={2} maxLength={1000} defaultValue={s.values?.note??task.note}/></Field><p className="time-help">{d.noteHelp}</p></>}</Form>;
}
export function RevokeForm({task,userId,locale}:{task:LifecycleTask;userId:string|null;locale:Locale}) {
  const d=documentDictionary(locale);
  return <Form action={revokeAccess} locale={locale} label={userId?d.revoke:d.noAccount}>{s=><><Identity record={task}/><input type="hidden" name="user_id" value={userId??""}/><p className="notice">{d.revokeHelp}</p><Field label={d.note}><textarea name="note" rows={2} minLength={5} maxLength={1000} required defaultValue={s.values?.note??""}/></Field><Confirm locale={locale}/></>}</Form>;
}
export function CaseManagement({record,locale}:{record:LifecycleCase;locale:Locale}) {
  const d=documentDictionary(locale);
  return <div className="time-settings-grid"><section className="card time-form-card"><h2>{d.addTask}</h2><Form action={addTask} locale={locale} label={d.addTask}>{s=><><Identity record={record}/><Field label={d.titleField}><input name="title" required maxLength={160} defaultValue={s.values?.title??""}/></Field></>}</Form></section>
  <section className="card time-form-card"><h2>{d.close}</h2><p className="time-help">{d.closeHelp}</p><Form action={closeCase} locale={locale} label={d.close}>{s=><><Identity record={record}/><Field label={d.state}><select name="status" defaultValue={s.values?.status??"completed"}><option value="completed">{d.completed}</option><option value="cancelled">{d.cancelled}</option></select></Field><Field label={d.note}><textarea name="note" rows={2} maxLength={1000} defaultValue={s.values?.note??""}/></Field><p className="time-help">{d.noteHelp}</p><Confirm locale={locale}/></>}</Form></section></div>;
}
