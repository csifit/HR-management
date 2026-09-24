-- HR-controlled request register. Downloads prepare review copies, not responses.
create table public.privacy_requests (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 employee_id uuid not null,
 kind text not null check(kind in ('access','rectification','erasure','restriction','portability','objection')),
 received_on date not null,
 initial_due_on date not null check(initial_due_on>=received_on),
 due_on date not null check(due_on>=initial_due_on),
 channel text not null check(channel in ('email','in_person','post','other')),
 summary text not null check(length(btrim(summary)) between 3 and 1000),
 assigned_to uuid not null references auth.users(id),
 status text not null default 'received' check(status in ('received','in_review','completed','refused','withdrawn')),
 identity_reference text not null default '' check(length(identity_reference)<=200),
 identity_verified_by uuid references auth.users(id),
 identity_verified_at timestamptz,
 extension_reason text not null default '' check(length(extension_reason)<=1000),
 extension_notified_on date,
 response_reference text not null default '' check(length(response_reference)<=200),
 responded_on date,
 resolution text not null default '' check(length(resolution)<=2000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1,
 unique(organisation_id,id),
 foreign key(organisation_id,employee_id) references public.employees(organisation_id,id)
);
create index privacy_requests_list on public.privacy_requests(organisation_id,due_on,id);
create table public.privacy_request_events (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 request_id uuid not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 request_version integer not null,
 snapshot jsonb not null,
 foreign key(organisation_id,request_id) references public.privacy_requests(organisation_id,id)
);
create index privacy_events_request on public.privacy_request_events(organisation_id,request_id,created_at,id);
create table public.privacy_exports (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 request_id uuid not null,
 request_version integer not null,
 prepared_by uuid not null references auth.users(id),
 prepared_at timestamptz not null default now(),
 attendance_from date not null,
 attendance_to date not null,
 documents jsonb not null,
 foreign key(organisation_id,request_id) references public.privacy_requests(organisation_id,id)
);
create index privacy_exports_request on public.privacy_exports(organisation_id,request_id,prepared_at,id);
alter table public.privacy_requests enable row level security;
alter table public.privacy_request_events enable row level security;
alter table public.privacy_exports enable row level security;
revoke all on public.privacy_requests,public.privacy_request_events,public.privacy_exports from public,anon,authenticated;
grant select on public.privacy_requests,public.privacy_request_events,public.privacy_exports to authenticated;
create policy privacy_requests_read on public.privacy_requests for select to authenticated using(private.is_hr(organisation_id));
create policy privacy_events_read on public.privacy_request_events for select to authenticated using(private.is_hr(organisation_id));
create policy privacy_exports_read on public.privacy_exports for select to authenticated using(private.is_hr(organisation_id));

create function private.audit_privacy_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.privacy_request_events(organisation_id,request_id,actor_id,request_version,snapshot)
 values(new.organisation_id,new.id,auth.uid(),new.version,to_jsonb(new)-array['organisation_id','employee_id','id','created_by','created_at']);
 -- The general audit log must not receive request summaries, identity evidence or responses.
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
 values(new.organisation_id,auth.uid(),case when tg_op='INSERT' then 'privacy.created' else 'privacy.updated' end,
   'privacy_requests',new.id,jsonb_build_object('version',new.version,'status',new.status));
 return new;
end $$;
create trigger privacy_request_audit after insert or update on public.privacy_requests for each row execute function private.audit_privacy_request();

create function public.create_privacy_request(p_org uuid,p_employee uuid,p_kind text,p_received date,p_due date,p_channel text,p_summary text,p_assignee uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_today date:=(now() at time zone 'Europe/Bucharest')::date;
begin
 perform private.require_documents_hr(p_org);
 if p_received is null or p_received<'2000-01-01' or p_received>v_today or p_due is null or p_due<p_received or p_due>(p_received+interval '1 month 7 days')::date then
   raise exception 'Check receipt and initial deadline' using errcode='22023'; end if;
 if not exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=p_assignee and role in ('organisation_owner','hr_manager')) then
   raise exception 'Responsible person must be HR in this organisation' using errcode='22023'; end if;
 insert into public.privacy_requests(organisation_id,employee_id,kind,received_on,initial_due_on,due_on,channel,summary,assigned_to,created_by)
 values(p_org,p_employee,p_kind,p_received,p_due,p_due,p_channel,btrim(p_summary),p_assignee,auth.uid()) returning id into v_id;
 return v_id;
end $$;

create function public.update_privacy_request(p_org uuid,p_id uuid,p_version integer,p_status text,p_assignee uuid,
 p_identity text,p_due date,p_extension_reason text,p_notified date,p_response text,p_responded date,p_resolution text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests; v_today date:=(now() at time zone 'Europe/Bucharest')::date;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.privacy_requests where organisation_id=p_org and id=p_id for update;
 if not found then raise exception 'Request not found' using errcode='42501'; end if;
 if r.version is distinct from p_version then raise exception 'Refresh this request' using errcode='P0006'; end if;
 if r.status in ('completed','refused','withdrawn') then raise exception 'Closed request' using errcode='D0001'; end if;
 if not exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=p_assignee and role in ('organisation_owner','hr_manager')) then
   raise exception 'Responsible person must be HR' using errcode='22023'; end if;
 if p_status is null or (r.status='in_review' and p_status='received') then raise exception 'Invalid transition' using errcode='22023'; end if;
 if p_due is null or p_due<r.initial_due_on or p_due>(r.initial_due_on+interval '2 months')::date then
   raise exception 'Invalid revised deadline' using errcode='22023'; end if;
 if p_due>r.initial_due_on and (length(btrim(coalesce(p_extension_reason,'')))<5 or p_notified is null or p_notified<r.received_on or p_notified>v_today) then
   raise exception 'Extension needs reason and actual notice date' using errcode='22023'; end if;
 if p_due=r.initial_due_on and (p_notified is not null or coalesce(p_extension_reason,'')<>'') then raise exception 'No extension selected' using errcode='22023'; end if;
 if p_identity is null or p_response is null or p_resolution is null or p_extension_reason is null then raise exception 'Missing fields' using errcode='22023'; end if;
 if p_identity<>'' and length(btrim(p_identity))<3 then raise exception 'Identity reference required' using errcode='22023'; end if;
 if p_status='completed' and length(btrim(p_identity))<3 then raise exception 'Verify identity before completion' using errcode='22023'; end if;
 if p_status in ('completed','refused','withdrawn') then
   if length(btrim(p_resolution))<5 or length(btrim(p_response))<3 or p_responded is null or p_responded<r.received_on or p_responded>v_today then
     raise exception 'Record actual response or withdrawal evidence and outcome' using errcode='22023'; end if;
 elsif p_responded is not null or p_response<>'' or p_resolution<>'' then raise exception 'Response fields require closure' using errcode='22023'; end if;
 update public.privacy_requests set status=p_status,assigned_to=p_assignee,identity_reference=btrim(p_identity),
   identity_verified_at=case when btrim(p_identity)='' then null when r.identity_reference=btrim(p_identity) then r.identity_verified_at else now() end,
   identity_verified_by=case when btrim(p_identity)='' then null when r.identity_reference=btrim(p_identity) then r.identity_verified_by else auth.uid() end,
   due_on=p_due,extension_reason=btrim(p_extension_reason),extension_notified_on=p_notified,
   response_reference=btrim(p_response),responded_on=p_responded,resolution=btrim(p_resolution),version=version+1,updated_at=now()
 where id=p_id;
end $$;

-- Explicit projections: never export other employees, auth secrets or generic audit metadata.
create function private.privacy_employee_data(p_org uuid,p_employee uuid,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'employee',(select to_jsonb(x) from (select id,first_name,last_name,email,phone,job_title,department,workplace,start_date,status,created_at,updated_at
   from public.employees where organisation_id=p_org and id=p_employee) x),
 'contracts',coalesce((select jsonb_agg(to_jsonb(x) order by x.start_date,x.id) from (select id,contract_number,start_date,end_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,currency,probation_days,status,parent_contract_id,created_at,updated_at
   from public.employment_contracts where organisation_id=p_org and employee_id=p_employee) x),'[]'::jsonb),
 'leave_requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.start_date,x.id) from (select r.id,t.name as leave_type,t.category,r.start_date,r.end_date,r.work_dates,r.days,r.status,r.decision_note,r.decided_at,r.created_at
   from public.leave_requests r join public.leave_types t on t.organisation_id=r.organisation_id and t.id=r.leave_type_id where r.organisation_id=p_org and r.employee_id=p_employee) x),'[]'::jsonb),
 'leave_allowances',coalesce((select jsonb_agg(to_jsonb(x) order by x.year,x.leave_type) from (select b.year,t.name as leave_type,b.allowance
   from public.leave_balances b join public.leave_types t on t.organisation_id=b.organisation_id and t.id=b.leave_type_id where b.organisation_id=p_org and b.employee_id=p_employee) x),'[]'::jsonb),
 'attendance_records',coalesce((select jsonb_agg(to_jsonb(x) order by x.day) from (select day,planned_hours,worked_hours,absence,updated_at
   from public.attendance where organisation_id=p_org and employee_id=p_employee) x),'[]'::jsonb),
 'attendance_calculated',coalesce((select jsonb_agg(to_jsonb(x) order by x.day) from (
   select a.day,a.planned_hours,a.worked_hours,a.category,a.recorded from generate_series(date_trunc('month',p_from),date_trunc('month',p_to),interval '1 month') m
   cross join lateral public.attendance_month(p_org,p_employee,m::date) a where a.day between p_from and p_to) x),'[]'::jsonb),
 'schedules',coalesce((select jsonb_agg(to_jsonb(x) order by x.effective_from,x.scope) from (select case when employee_id is null then 'organisation' else 'employee' end as scope,effective_from,weekdays
   from public.work_schedules where organisation_id=p_org and (employee_id=p_employee or employee_id is null)) x),'[]'::jsonb),
 'calendar_exceptions',coalesce((select jsonb_agg(to_jsonb(x) order by x.day) from (select day,is_working from public.work_calendar_days where organisation_id=p_org) x),'[]'::jsonb),
 'benefit_enrolments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_on,x.id) from (select e.id,b.name,b.model,b.amount as current_unit_amount,p.name as provider,e.starts_on,e.ends_on,e.active
   from public.employee_benefits e join public.benefits b on b.organisation_id=e.organisation_id and b.id=e.benefit_id join public.benefit_providers p on p.organisation_id=b.organisation_id and p.id=b.provider_id
   where e.organisation_id=p_org and e.employee_id=p_employee) x),'[]'::jsonb),
 'benefit_allocations',coalesce((select jsonb_agg(to_jsonb(x) order by x.month,x.id) from (select i.id,i.month,i.benefit_name,i.provider_name,i.model,i.unit_amount,i.worked_days,i.suggested_amount,i.final_amount,i.included,i.review_note,r.status as run_status
   from public.benefit_run_items i join public.benefit_runs r on r.organisation_id=i.organisation_id and r.id=i.run_id where i.organisation_id=p_org and i.employee_id=p_employee) x),'[]'::jsonb),
 'lifecycle',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (select c.id,c.kind,c.status,c.target_date,c.created_at,c.closed_at,c.close_note,
   (select coalesce(jsonb_agg(jsonb_build_object('title',t.title,'status',t.status,'note',t.note,'completed_at',t.completed_at) order by t.position),'[]'::jsonb) from public.lifecycle_tasks t where t.organisation_id=p_org and t.case_id=c.id) as tasks
   from public.lifecycle_cases c where c.organisation_id=p_org and c.employee_id=p_employee) x),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (select id,title,category,visibility,origin,status,filename,byte_size,ready_at,signed_at,created_at,version
   from public.employee_documents where organisation_id=p_org and employee_id=p_employee) x),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select email,status,delivery_status,expires_at,sent_at,created_at
   from public.employee_invitations where organisation_id=p_org and employee_id=p_employee) x),'[]'::jsonb),
 'document_deliveries',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (select v.id,v.document_id,v.recipient,v.status,v.created_at,v.completed_at
   from public.document_deliveries v join public.employee_documents d on d.organisation_id=v.organisation_id and d.id=v.document_id where d.organisation_id=p_org and d.employee_id=p_employee) x),'[]'::jsonb),
 'account_membership',(select to_jsonb(x) from (select u.email,u.display_name,u.role,u.created_at from public.organisation_users u join public.employees e on e.organisation_id=u.organisation_id and e.user_id=u.user_id where e.organisation_id=p_org and e.id=p_employee) x)
 );
$$;

create function public.prepare_privacy_export(p_org uuid,p_request uuid,p_version integer,p_documents jsonb,p_from date,p_to date,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.privacy_requests; v_data jsonb; v_files jsonb; v_id uuid; v_count integer;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.privacy_requests where organisation_id=p_org and id=p_request for update;
 if not found then raise exception 'Request not found' using errcode='42501'; end if;
 if r.version is distinct from p_version then raise exception 'Refresh this request' using errcode='P0006'; end if;
 if r.status<>'in_review' or r.identity_verified_at is null or r.kind not in ('access','portability') or p_confirm is distinct from true then
   raise exception 'Verify identity and review the scope first' using errcode='D0001'; end if;
 if p_from is null or p_to is null or p_from<'2000-01-01' or p_to>(now() at time zone 'Europe/Bucharest')::date or p_to<p_from or p_to-p_from>365 then
   raise exception 'Select up to 366 days of calculated attendance' using errcode='22023'; end if;
 if p_documents is null or jsonb_typeof(p_documents)<>'array' or jsonb_array_length(p_documents)>50 then raise exception 'Invalid document selection' using errcode='22023'; end if;
 select count(distinct d.id),coalesce(jsonb_agg(jsonb_build_object('id',d.id,'version',d.version,'title',d.title,'byte_size',d.byte_size,'object_path',d.object_path) order by d.id),'[]'::jsonb)
 into v_count,v_files from jsonb_to_recordset(p_documents) s(id uuid,version integer) join public.employee_documents d
 on d.organisation_id=p_org and d.employee_id=r.employee_id and d.id=s.id and d.version=s.version and d.ready_at is not null;
 if v_count<>jsonb_array_length(p_documents) then raise exception 'Selected documents changed or are outside this employee' using errcode='P0006'; end if;
 if (select coalesce(sum((x->>'byte_size')::bigint),0) from jsonb_array_elements(v_files) x)>52428800 then raise exception 'Selected files exceed 50 MB' using errcode='R0001'; end if;
 v_data:=private.privacy_employee_data(p_org,r.employee_id,p_from,p_to);
 if octet_length(v_data::text)>2097152 then raise exception 'Records exceed 2 MB; assisted export needed' using errcode='R0001'; end if;
 insert into public.privacy_exports(organisation_id,request_id,request_version,prepared_by,attendance_from,attendance_to,documents)
 values(p_org,r.id,r.version,auth.uid(),p_from,p_to,p_documents) returning id into v_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
 values(p_org,auth.uid(),'privacy.export_prepared','privacy_requests',r.id,jsonb_build_object('export_id',v_id,'document_count',v_count));
 return jsonb_build_object('export_id',v_id,'prepared_at',now(),'request_id',r.id,'organisation_id',p_org,'employee_id',r.employee_id,
   'attendance_from',p_from,'attendance_to',p_to,'data',v_data,'files',v_files);
end $$;

revoke all on function private.audit_privacy_request(),private.privacy_employee_data(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function public.create_privacy_request(uuid,uuid,text,date,date,text,text,uuid),public.update_privacy_request(uuid,uuid,integer,text,uuid,text,date,text,date,text,date,text),public.prepare_privacy_export(uuid,uuid,integer,jsonb,date,date,boolean) from public,anon,authenticated;
grant execute on function public.create_privacy_request(uuid,uuid,text,date,date,text,text,uuid),public.update_privacy_request(uuid,uuid,integer,text,uuid,text,date,text,date,text,date,text),public.prepare_privacy_export(uuid,uuid,integer,jsonb,date,date,boolean) to authenticated;
