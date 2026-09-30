-- Accountant handovers contain only saved, approved payroll facts. Preparing an
-- export records an attempt, not a successful download or delivery to a recipient.
create table public.payroll_handover_exports (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 run_id uuid not null,
 run_version integer not null check(run_version>0),
 revision integer not null check(revision>0),
 prepared_by uuid not null references auth.users(id),
 prepared_at timestamptz not null default now(),
 locale text not null check(locale in ('ro','en')),
 is_historical boolean not null,
 latest_approved_run_id uuid not null,
 latest_approved_revision integer not null check(latest_approved_revision>0),
 has_open_correction boolean not null,
 employee_count integer not null check(employee_count between 1 and 200),
 format_version text not null default 'HRConnector-accountant-v1' check(format_version='HRConnector-accountant-v1'),
 foreign key(organisation_id,run_id) references public.payroll_runs(organisation_id,id),
 foreign key(organisation_id,latest_approved_run_id) references public.payroll_runs(organisation_id,id),
 check(is_historical=(run_id<>latest_approved_run_id))
);
create index payroll_handover_exports_run on public.payroll_handover_exports(organisation_id,run_id,prepared_at,id);
alter table public.payroll_handover_exports enable row level security;
revoke all on public.payroll_handover_exports from public,anon,authenticated;
grant select on public.payroll_handover_exports to authenticated;
create policy payroll_handover_exports_read on public.payroll_handover_exports for select to authenticated using(private.is_hr(organisation_id));

create function public.prepare_payroll_handover(p_org uuid,p_run uuid,p_version integer,p_locale text,p_confirm boolean,p_allow_historical boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.payroll_runs; v_latest public.payroll_runs; i public.payroll_run_items;
 v_export uuid:=gen_random_uuid(); v_prepared timestamptz:=now(); v_count integer;
 v_historical boolean; v_open boolean; v_company jsonb; v_item_company jsonb;
 v_items jsonb:='[]'::jsonb; v_payload jsonb; v_input jsonb; v_result jsonb; k text;
 v_input_text constant text[]:=array['month','floorException','evidence','mealsReference','advanceReference','primary','young','reduced','standard'];
 v_input_numbers constant text[]:=array['basic','bonus','hours','meals','advance','dependants','children'];
 v_result_numbers constant text[]:=array['gross','cashGross','meals','relief','contributionBase','healthBase','cas','cass','personalDeduction','youngDeduction','childrenDeduction','taxBaseBeforeRounding','taxBase','incomeTax','net','advance','payable','contributionFloor','employerCas','employerCass','cam','employerCost'];
begin
 -- This also serializes approval/correction creation with preparation and checks
 -- active organisation membership and an enrolled user's required MFA level.
 perform private.require_documents_hr(p_org);
 if p_locale is null or p_locale not in ('ro','en') or p_confirm is distinct from true
  or p_allow_historical is null then raise exception 'Confirm the accountant handover scope' using errcode='22023'; end if;
 select * into r from public.payroll_runs where organisation_id=p_org and id=p_run;
 if not found then raise exception 'Run unavailable' using errcode='42501'; end if;
 if r.status<>'approved' then raise exception 'Approve payroll first' using errcode='D0001'; end if;
 if r.version is distinct from p_version then raise exception 'Run changed; refresh' using errcode='P0006'; end if;
 select count(*) into v_count from public.payroll_run_items where organisation_id=p_org and run_id=p_run;
 if v_count not between 1 and 200 then raise exception 'Handover requires 1 to 200 saved employees' using errcode='P0012'; end if;
 select * into v_latest from public.payroll_runs where organisation_id=p_org and month=r.month and status='approved' order by revision desc limit 1;
 v_historical:=v_latest.id<>r.id;
 if v_historical and not p_allow_historical then raise exception 'Confirm historical revision explicitly' using errcode='P0013'; end if;
 select exists(select 1 from public.payroll_runs where organisation_id=p_org and month=r.month and status='draft' and previous_run_id is not null) into v_open;
 for i in select * from public.payroll_run_items where organisation_id=p_org and run_id=p_run order by employee_id loop
  -- Validate the saved format without invoking today's calculator or reading
  -- mutable employee/contract/company records. Unknown fields are not exported.
  if jsonb_typeof(i.input)<>'object' or jsonb_typeof(i.result)<>'object'
   or i.input->>'month' is distinct from to_char(r.month,'YYYY-MM')
   or i.result->>'month' is distinct from to_char(r.month,'YYYY-MM')
   or i.result->>'rules' is distinct from 'RO-2026-monthly-v3' then
   raise exception 'Unsupported saved payroll snapshot' using errcode='P0010'; end if;
  foreach k in array v_input_text loop
   if jsonb_typeof(i.input->k) is distinct from 'string' then raise exception 'Invalid saved payroll input' using errcode='P0010'; end if;
  end loop;
  foreach k in array v_input_numbers loop
   if jsonb_typeof(i.input->k) is distinct from 'number' then raise exception 'Invalid saved payroll input' using errcode='P0010'; end if;
  end loop;
  foreach k in array v_result_numbers loop
   if jsonb_typeof(i.result->k) is distinct from 'number' then raise exception 'Invalid saved payroll result' using errcode='P0010'; end if;
  end loop;
  foreach k in array array['name','cui','address'] loop
   if jsonb_typeof(i.source->'company'->k) is distinct from 'string' then raise exception 'Invalid saved company facts' using errcode='P0010'; end if;
  end loop;
  foreach k in array array['name','department','job'] loop
   if jsonb_typeof(i.source->'employee'->k) is distinct from 'string' then raise exception 'Invalid saved employee facts' using errcode='P0010'; end if;
  end loop;
  if jsonb_typeof(i.source->'contract'->'number') is distinct from 'string' then raise exception 'Invalid saved contract facts' using errcode='P0010'; end if;
  v_item_company:=jsonb_build_object('name',i.source->'company'->'name','cui',i.source->'company'->'cui','address',i.source->'company'->'address');
  if v_company is null then v_company:=v_item_company;
  elsif v_company is distinct from v_item_company then raise exception 'Inconsistent saved company facts' using errcode='P0010'; end if;
  select jsonb_object_agg(key,value) into v_input from jsonb_each(i.input) where key=any(v_input_text||v_input_numbers);
  select jsonb_object_agg(key,value) into v_result from jsonb_each(i.result) where key=any(v_result_numbers||array['month','rules']);
  v_items:=v_items||jsonb_build_array(jsonb_build_object('id',i.id,'employee_id',i.employee_id,
   'employee_name',i.source->'employee'->'name','department',i.source->'employee'->'department',
   'job_title',i.source->'employee'->'job','contract_number',i.source->'contract'->'number','input',v_input,'result',v_result));
  if octet_length(v_items::text)>2097152 then raise exception 'Handover is too large' using errcode='P0012'; end if;
 end loop;
 v_payload:=jsonb_build_object('export_id',v_export,'prepared_at',v_prepared,'organisation_id',p_org,'locale',p_locale,'format_version','HRConnector-accountant-v1',
  'run',jsonb_build_object('id',r.id,'month',r.month,'revision',r.revision,'version',r.version,'approved_at',r.approved_at,'previous_run_id',r.previous_run_id),
  'latest_approved_run_id',v_latest.id,'latest_approved_revision',v_latest.revision,'is_historical',v_historical,'has_open_correction',v_open,'company',v_company,'items',v_items);
 if octet_length(v_payload::text)>2097152 then raise exception 'Handover is too large' using errcode='P0012'; end if;
 insert into public.payroll_handover_exports(id,organisation_id,run_id,run_version,revision,prepared_by,prepared_at,locale,is_historical,latest_approved_run_id,latest_approved_revision,has_open_correction,employee_count)
 values(v_export,p_org,r.id,r.version,r.revision,auth.uid(),v_prepared,p_locale,v_historical,v_latest.id,v_latest.revision,v_open,v_count);
 insert into public.payroll_run_events(organisation_id,run_id,action,actor_id,snapshot)
 values(p_org,r.id,'handover_prepared',auth.uid(),jsonb_build_object('export_id',v_export,'employee_count',v_count,'is_historical',v_historical));
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
 values(p_org,auth.uid(),'payroll.handover_prepared','payroll_runs',r.id,jsonb_build_object('export_id',v_export,'employee_count',v_count,'is_historical',v_historical));
 return v_payload;
end $$;
revoke all on function public.prepare_payroll_handover(uuid,uuid,integer,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.prepare_payroll_handover(uuid,uuid,integer,text,boolean,boolean) to authenticated;
