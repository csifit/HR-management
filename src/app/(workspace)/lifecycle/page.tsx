import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { documentDictionary } from "@/lib/document-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam } from "@/lib/time";
import { pageNumber } from "@/lib/data";
import { dateLabel } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { CreateCaseForm } from "@/components/document-forms";
export default async function LifecyclePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {supabase,organisation}=await requireHR(),locale=await getLocale(),d=documentDictionary(locale),q=await searchParams;
  const page=pageNumber(singleParam(q.page)),rawStatus=singleParam(q.status);
  const status=rawStatus==="active"||rawStatus==="completed"||rawStatus==="cancelled"?rawStatus:"all";
  const {employee,options,hasMore}=await timeEmployees(singleParam(q.employee),singleParam(q.q));
  let query=supabase.from("lifecycle_cases").select("*",{count:"exact"}).eq("organisation_id",organisation.id);
  if(employee)query=query.eq("employee_id",employee.id);
  if(status!=="all")query=query.eq("status",status);
  const {data:cases,error,count}=await query.order("created_at",{ascending:false}).order("id").range((page-1)*25,page*25-1);
  if(error)throw new Error("Checklists could not be loaded.");
  const ids=[...new Set(cases.map(c=>c.employee_id))];
  const employees=ids.length?await supabase.from("employees").select("id,first_name,last_name").eq("organisation_id",organisation.id).in("id",ids):{data:[],error:null};
  if(employees.error)throw new Error("Employees could not be loaded.");
  const names=new Map(employees.data?.map(e=>[e.id,`${e.first_name} ${e.last_name}`]));
  const href=(p:number)=>`/lifecycle?${new URLSearchParams({employee:employee?.id??"",page:String(p),status,q:singleParam(q.q)})}`;
  return <><PageHeader title={d.lifecycle} description={d.lifecycleIntro}/><form action="/lifecycle" className="time-filters"><label className="field time-field"><span>{d.search}</span><input name="q" type="search" defaultValue={singleParam(q.q)}/></label><EmployeeFilter employees={options} selected={employee?.id} locale={locale}/><label className="field time-field"><span>{d.state}</span><select name="status" defaultValue={status}>{(["all","active","completed","cancelled"] as const).map(v=><option key={v} value={v}>{d[v]}</option>)}</select></label><button className="button secondary">{d.filter}</button></form>{hasMore&&<p className="time-help">{d.more}</p>}
    {organisation.status==="active"&&(employee?<details className="card time-form-card"><summary>{d.newCase} · {employee.first_name} {employee.last_name}</summary><CreateCaseForm employeeId={employee.id} locale={locale}/></details>:<p className="notice">{d.choose}</p>)}
    <section className="card table-card document-list"><div className="table-scroll"><table><thead><tr>{[d.employee,d.kind,d.target,d.state].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{cases.map(c=><tr key={c.id}><td><Link href={`/lifecycle/${c.id}`}>{names.get(c.employee_id)??d.employee}</Link></td><td>{d[c.kind]}</td><td>{dateLabel(c.target_date,locale)}</td><td>{d[c.status]}</td></tr>)}</tbody></table></div>{!cases.length&&<p className="time-padding muted">{d.none}</p>}<div className="pagination">{page>1&&<Link href={href(page-1)}>{d.previous}</Link>}{page*25<(count??0)&&<Link href={href(page+1)}>{d.next}</Link>}</div></section><p className="time-help">{d.manualHelp}</p></>;
}
