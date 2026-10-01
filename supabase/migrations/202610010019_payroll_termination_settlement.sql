-- Ordinary fully taxable termination pay in the actual termination month.
-- The approved balance and rate are supplied by HR/accounting, not inferred.
create function private.validate_payroll_settlement(s jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare k text; v numeric;
begin
 if s is null or jsonb_typeof(s)<>'object' or octet_length(s::text)>2048 then raise exception 'Invalid settlement' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(s) f where f not in ('days','dailyGross','balanceReference','rateReference','otherGross','otherReference','confirmed')) then raise exception 'Unknown settlement fact' using errcode='22023'; end if;
 foreach k in array array['days','dailyGross','otherGross'] loop
  if jsonb_typeof(s->k) is distinct from 'number' then raise exception 'Normalized settlement numbers required' using errcode='22023'; end if;
  v:=(s->>k)::numeric;
  if v<0 or v>1000000 or v<>round(v,2) then raise exception 'Invalid settlement amount' using errcode='22023'; end if;
 end loop;
 foreach k in array array['balanceReference','rateReference','otherReference','confirmed'] loop
  if jsonb_typeof(s->k) is distinct from 'string' or length(s->>k)>120 or s->>k<>btrim(s->>k) then raise exception 'Invalid settlement reference' using errcode='22023'; end if;
 end loop;
 if s->>'confirmed'<>'on' or (s->>'days')::numeric>365
  or ((s->>'days')::numeric=0 and (s->>'otherGross')::numeric=0)
  or ((s->>'days')::numeric>0 and ((s->>'dailyGross')::numeric=0 or length(s->>'balanceReference')<3 or length(s->>'rateReference')<3))
  or ((s->>'days')::numeric=0 and ((s->>'dailyGross')::numeric<>0 or s->>'balanceReference'<>'' or s->>'rateReference'<>''))
  or ((s->>'otherGross')::numeric>0 and length(s->>'otherReference')<3)
  or ((s->>'otherGross')::numeric=0 and s->>'otherReference'<>'') then
  raise exception 'Review final balance, approved rate and taxable payment evidence' using errcode='22023';
 end if;
end $$;

create function private.calculate_payroll_v5(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare s jsonb; v_unused numeric; v_other numeric; v_bonus numeric; r jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>6144 then raise exception 'Invalid payroll input' using errcode='22023'; end if;
 s:=p->'settlement'; perform private.validate_payroll_settlement(s);
 v_unused:=round((s->>'days')::numeric*(s->>'dailyGross')::numeric,2);
 v_other:=(s->>'otherGross')::numeric;
 -- Validate the original input first (including bonus), without changing it.
 -- Running the base calculator here would wrongly reject some relief cases
 -- before the extra taxable cash takes gross above the relief eligibility cap.
 if jsonb_typeof(p->'bonus') is distinct from 'number' or (p->>'bonus')::numeric<0
  or (p->>'bonus')::numeric>1000000 or (p->>'bonus')::numeric<>round((p->>'bonus')::numeric,2) then
  raise exception 'Invalid cash bonus' using errcode='22023'; end if;
 v_bonus:=(p->>'bonus')::numeric+v_unused+v_other;
 r:=private.calculate_payroll_v4(jsonb_set(p-'settlement','{bonus}',to_jsonb(v_bonus)));
 return r||jsonb_build_object('rules','RO-2026-monthly-v5','settlement',jsonb_build_object('unusedLeaveGross',v_unused,'otherGross',v_other));
end $$;

create or replace function private.calculate_payroll_saved(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if p ? 'settlement' then return private.calculate_payroll_v5(p);
 elsif p ? 'period' then return private.calculate_payroll_v4(p);
 else return private.calculate_payroll_v3(p); end if;
end $$;

-- Additive UI eligibility facts. No alteration of older stable source snapshots.
create or replace function public.payroll_period_context(p_org uuid,p_employee uuid,p_month date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; c public.employment_contracts; v_allowed boolean;
begin
 perform private.require_documents_hr(p_org);
 v:=private.payroll_period_context(p_org,p_employee,p_month);
 select * into c from public.employment_contracts where organisation_id=p_org and id=(v->>'contract_id')::uuid;
 v_allowed:=c.status='terminated' and c.termination_date is not null
  and to_char(c.termination_date,'YYYY-MM')=to_char(p_month,'YYYY-MM')
  and c.termination_date::text=v->'period'->>'end'
  and not exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='pending');
 return v||jsonb_build_object('settlement_allowed',v_allowed,'termination_date',c.termination_date);
end $$;

alter function private.payroll_sources(uuid,uuid,date,jsonb) rename to payroll_sources_before_settlement;
create function private.payroll_sources(p_org uuid,p_employee uuid,p_month date,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 v:=private.payroll_sources_before_settlement(p_org,p_employee,p_month,p_input-'settlement');
 if not (p_input ? 'settlement') then return v; end if;
 perform private.validate_payroll_settlement(p_input->'settlement');
 if not (p_input ? 'period') or v->'contract'->>'status'<>'terminated'
  or v->'contract'->>'termination_date' is null
  or left(v->'contract'->>'termination_date',7)<>to_char(p_month,'YYYY-MM')
  or v->'contract'->>'termination_date'<>p_input->'period'->>'end'
  or exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='pending') then
  raise exception 'Review actual termination and resolve pending leave before settlement' using errcode='P0010'; end if;
 v:=v||jsonb_build_object('termination_settlement',jsonb_build_object(
  'termination_date',v->'contract'->'termination_date',
  'balances',coalesce((select jsonb_agg(to_jsonb(b) order by b.year,b.leave_type_id) from
   (select year,leave_type_id,allowance from public.leave_balances where organisation_id=p_org and employee_id=p_employee) b),'[]'::jsonb),
  'leave',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from
   (select id,leave_type_id,start_date,end_date,work_dates,status,version from public.leave_requests where organisation_id=p_org and employee_id=p_employee) l),'[]'::jsonb)
 ));
 if octet_length(v::text)>1048576 then raise exception 'Payroll source too large' using errcode='P0012'; end if;
 return v;
end $$;

alter table public.payroll_handover_exports drop constraint payroll_handover_exports_format_version_check;
alter table public.payroll_handover_exports add constraint payroll_handover_exports_format_version_check
 check(format_version in ('HRConnector-accountant-v1','HRConnector-accountant-v2','HRConnector-accountant-v3'));

revoke all on function private.validate_payroll_settlement(jsonb),private.calculate_payroll_v5(jsonb),private.calculate_payroll_saved(jsonb),private.payroll_sources(uuid,uuid,date,jsonb),private.payroll_sources_before_settlement(uuid,uuid,date,jsonb) from public,anon,authenticated;
revoke all on function public.payroll_period_context(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.payroll_period_context(uuid,uuid,date) to authenticated;

-- Export immutable approved v5 facts; no tax recalculation or live sources.
create or replace function public.prepare_payroll_handover(p_org uuid,p_run uuid,p_version integer,p_locale text,p_confirm boolean,p_allow_historical boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.payroll_runs; v_latest public.payroll_runs; i public.payroll_run_items;
 v_export uuid:=gen_random_uuid(); v_prepared timestamptz:=now(); v_count integer;
 v_historical boolean; v_open boolean; v_company jsonb; v_item_company jsonb;
 v_format text:='HRConnector-accountant-v1'; v_items jsonb:='[]'::jsonb; v_payload jsonb; v_input jsonb; v_result jsonb; k text;
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
   or coalesce(i.result->>'rules','') not in ('RO-2026-monthly-v3','RO-2026-monthly-v4','RO-2026-monthly-v5') then
   raise exception 'Unsupported saved payroll snapshot' using errcode='P0010'; end if;
  if i.result->>'rules' in ('RO-2026-monthly-v4','RO-2026-monthly-v5') then
   if v_format<>'HRConnector-accountant-v3' then v_format:='HRConnector-accountant-v2'; end if;
   begin
    perform private.validate_payroll_period(i.input->>'month',i.input->'period');
   exception when sqlstate '22023' then raise exception 'Invalid saved payroll period' using errcode='P0010';
   end;
   if i.input->'period' is distinct from i.source->'period'
    or jsonb_typeof(i.input->'deductionEmployer') is distinct from 'string'
    or i.input->>'deductionEmployer' not in ('this','other')
    or jsonb_typeof(i.input->'deductionReference') is distinct from 'string'
    or length(i.input->>'deductionReference')>120 or i.input->>'deductionReference'<>btrim(i.input->>'deductionReference')
    or (i.input->>'primary'='no' and i.input->>'deductionEmployer'<>'other')
    or (i.input->>'primary'='yes' and (i.input->'period'->>'employedCalendarDays')::integer<(i.input->'period'->>'monthCalendarDays')::integer and length(i.input->>'deductionReference')<3) then
    raise exception 'Invalid saved deduction facts' using errcode='P0010'; end if;
  elsif i.input ?| array['period','deductionEmployer','deductionReference'] then
   raise exception 'Unexpected period in legacy payroll' using errcode='P0010';
  end if;
  if i.result->>'rules'='RO-2026-monthly-v5' then
   v_format:='HRConnector-accountant-v3';
   begin
    perform private.validate_payroll_settlement(i.input->'settlement');
   exception when sqlstate '22023' then raise exception 'Invalid saved settlement facts' using errcode='P0010'; end;
   if jsonb_typeof(i.result->'settlement') is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(i.result->'settlement') f where f not in ('unusedLeaveGross','otherGross'))
    or jsonb_typeof(i.result->'settlement'->'unusedLeaveGross') is distinct from 'number'
    or jsonb_typeof(i.result->'settlement'->'otherGross') is distinct from 'number'
    or (i.result->'settlement'->>'unusedLeaveGross')::numeric not between 0 and 1000000
    or (i.result->'settlement'->>'unusedLeaveGross')::numeric<>round((i.result->'settlement'->>'unusedLeaveGross')::numeric,2)
    or i.result->'settlement'->'otherGross' is distinct from i.input->'settlement'->'otherGross'
    or ((i.input->'settlement'->>'days')::numeric=0 and (i.result->'settlement'->>'unusedLeaveGross')::numeric<>0)
    or i.source->'contract'->>'status' is distinct from 'terminated'
    or i.source->'contract'->>'termination_date' is distinct from i.input->'period'->>'end'
    or i.source->'termination_settlement'->'termination_date' is distinct from i.source->'contract'->'termination_date' then
    raise exception 'Invalid saved settlement result or termination' using errcode='P0010'; end if;
  elsif i.input ? 'settlement' or i.result ? 'settlement' then
   raise exception 'Unexpected settlement in older payroll' using errcode='P0010';
  end if;
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
  select jsonb_object_agg(key,value) into v_input from jsonb_each(i.input) where key=any(v_input_text||v_input_numbers||case when i.result->>'rules' in ('RO-2026-monthly-v4','RO-2026-monthly-v5') then array['period','deductionEmployer','deductionReference'] else array[]::text[] end);
  select jsonb_object_agg(key,value) into v_result from jsonb_each(i.result) where key=any(v_result_numbers||array['month','rules']);
  if i.result->>'rules'='RO-2026-monthly-v5' then
   v_input:=v_input||jsonb_build_object('settlement',i.input->'settlement');
   v_result:=v_result||jsonb_build_object('settlement',i.result->'settlement');
  end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('id',i.id,'employee_id',i.employee_id,
   'employee_name',i.source->'employee'->'name','department',i.source->'employee'->'department',
   'job_title',i.source->'employee'->'job','contract_number',i.source->'contract'->'number','input',v_input,'result',v_result));
  if octet_length(v_items::text)>2097152 then raise exception 'Handover is too large' using errcode='P0012'; end if;
 end loop;
 v_payload:=jsonb_build_object('export_id',v_export,'prepared_at',v_prepared,'organisation_id',p_org,'locale',p_locale,'format_version',v_format,
  'run',jsonb_build_object('id',r.id,'month',r.month,'revision',r.revision,'version',r.version,'approved_at',r.approved_at,'previous_run_id',r.previous_run_id),
  'latest_approved_run_id',v_latest.id,'latest_approved_revision',v_latest.revision,'is_historical',v_historical,'has_open_correction',v_open,'company',v_company,'items',v_items);
 if octet_length(v_payload::text)>2097152 then raise exception 'Handover is too large' using errcode='P0012'; end if;
 insert into public.payroll_handover_exports(id,organisation_id,run_id,run_version,revision,prepared_by,prepared_at,locale,is_historical,latest_approved_run_id,latest_approved_revision,has_open_correction,employee_count,format_version)
 values(v_export,p_org,r.id,r.version,r.revision,auth.uid(),v_prepared,p_locale,v_historical,v_latest.id,v_latest.revision,v_open,v_count,v_format);
 insert into public.payroll_run_events(organisation_id,run_id,action,actor_id,snapshot)
 values(p_org,r.id,'handover_prepared',auth.uid(),jsonb_build_object('export_id',v_export,'employee_count',v_count,'is_historical',v_historical));
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
 values(p_org,auth.uid(),'payroll.handover_prepared','payroll_runs',r.id,jsonb_build_object('export_id',v_export,'employee_count',v_count,'is_historical',v_historical));
 return v_payload;
end $$;
