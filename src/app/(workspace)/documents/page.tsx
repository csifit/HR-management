import Link from "next/link";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage } from "@/lib/types";
import { documentDictionary } from "@/lib/document-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam } from "@/lib/time";
import { pageNumber } from "@/lib/data";
import { dateLabel } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { UploadDocumentForm,GenerateDocumentForm,DocumentDownload,DocumentManage } from "@/components/document-forms";
export default async function DocumentsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {supabase,organisation,membership}=await requireOrganisation(),locale=await getLocale(),d=documentDictionary(locale),q=await searchParams;
  const hr=canManage(membership.role),writable=hr&&organisation.status==="active",page=pageNumber(singleParam(q.page)),archived=hr&&singleParam(q.archived)==="on";
  const {employee,options,hasMore}=await timeEmployees(singleParam(q.employee),singleParam(q.q),!hr);
  let query=supabase.from("employee_documents").select("*",{count:"exact"}).eq("organisation_id",organisation.id);
  if(employee)query=query.eq("employee_id",employee.id);
  if(!archived)query=query.neq("status","archived");
  const result=employee?await query.order("created_at",{ascending:false}).order("id").range((page-1)*25,page*25-1):{data:[],error:null,count:0};
  if(result.error)throw new Error("Documents could not be loaded.");
  const href=(p:number)=>`/documents?${new URLSearchParams({employee:employee?.id??"",page:String(p),archived:archived?"on":"",q:singleParam(q.q)})}`;
  return <><PageHeader title={d.title} description={d.intro}>{hr&&<Link className="button secondary" href="/lifecycle">{d.lifecycle}</Link>}</PageHeader>
    <form action="/documents" className="time-filters">{hr&&<><label className="field time-field"><span>{d.search}</span><input name="q" type="search" defaultValue={singleParam(q.q)}/></label><EmployeeFilter employees={options} selected={employee?.id} locale={locale} empty={false}/><label className="benefit-confirm"><input name="archived" type="checkbox" defaultChecked={archived}/>{d.includeArchived}</label><button className="button secondary">{d.filter}</button></>}</form>
    {hasMore&&<p className="time-help">{d.more}</p>}
    {!employee?<p className="notice">{d.choose}</p>:<><h2 className="document-heading">{employee.first_name} {employee.last_name}</h2>
      {writable&&<div className="time-settings-grid"><details className="card time-form-card"><summary>{d.upload}</summary><UploadDocumentForm employeeId={employee.id} locale={locale}/></details><details className="card time-form-card"><summary>{d.generate}</summary><GenerateDocumentForm employeeId={employee.id} locale={locale}/></details></div>}
      <section className="card table-card document-list"><div className="table-scroll"><table><thead><tr>{[d.titleField,d.state,d.visibility,d.created,d.actions].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{result.data?.map(doc=><tr key={doc.id}><td><strong>{doc.title}</strong><small className="document-meta">{d[doc.category]} · {(doc.byte_size/1024).toFixed(0)} KB</small></td><td>{d[doc.status]}{doc.signed_at&&<small className="document-meta">{dateLabel(doc.signed_at,locale)}</small>}</td><td>{doc.visibility==="hr_only"?d.hr_only:d.employeeVisible}</td><td>{dateLabel(doc.created_at,locale)}</td><td>{doc.ready_at&&<DocumentDownload document={doc} locale={locale}/ >}{writable&&doc.status!=="archived"&&<details className="document-manage"><summary>{d.actions}</summary><DocumentManage document={doc} locale={locale}/></details>}</td></tr>)}</tbody></table></div>{!result.data?.length&&<p className="time-padding muted">{d.none}</p>}<div className="pagination">{page>1&&<Link href={href(page-1)}>{d.previous}</Link>}{page*25<(result.count??0)&&<Link href={href(page+1)}>{d.next}</Link>}</div></section><p className="time-help">{d.fileHelp}</p></>}
  </>;
}
