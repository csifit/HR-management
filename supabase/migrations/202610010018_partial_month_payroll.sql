-- Partial-month standard payroll. Approved v3 snapshots stay immutable. Only
-- new inputs carrying a checked employment period use the v4 calculator.
create function private.validate_payroll_period(p_month text,p_period jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare k text; v numeric; v_month date; v_end date; v_from date; v_to date; v_weekdays integer; v_employed_weekdays integer;
begin
 if p_month is null or p_month !~ '^2026-(0[1-9]|1[0-2])$' or p_period is null or jsonb_typeof(p_period)<>'object'
  or exists(select 1 from jsonb_object_keys(p_period) as fields(key) where fields.key not in ('start','end','monthWorkingDays','employedWorkingDays','monthCalendarDays','employedCalendarDays')) then
  raise exception 'Invalid payroll period' using errcode='22023'; end if;
 foreach k in array array['start','end'] loop
  if jsonb_typeof(p_period->k) is distinct from 'string' or p_period->>k !~ '^2026-[0-9]{2}-[0-9]{2}$' then
   raise exception 'Invalid payroll period date' using errcode='22023'; end if;
 end loop;
 begin
  v_month:=(p_month||'-01')::date; v_end:=(v_month+interval '1 month - 1 day')::date;
  v_from:=(p_period->>'start')::date; v_to:=(p_period->>'end')::date;
 exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Invalid payroll period date' using errcode='22023';
 end;
 if v_from<v_month or v_to>v_end or v_from>v_to then raise exception 'Payroll period must be inside its month' using errcode='22023'; end if;
 foreach k in array array['monthWorkingDays','employedWorkingDays','monthCalendarDays','employedCalendarDays'] loop
  if jsonb_typeof(p_period->k) is distinct from 'number' then raise exception 'Invalid payroll day count' using errcode='22023'; end if;
  v:=(p_period->>k)::numeric;
  if v<1 or v>31 or v<>trunc(v) then raise exception 'Invalid payroll day count' using errcode='22023'; end if;
 end loop;
 select count(*) into v_weekdays from generate_series(0,v_end-v_month) n where extract(isodow from v_month+n)<=5;
 select count(*) into v_employed_weekdays from generate_series(0,v_to-v_from) n where extract(isodow from v_from+n)<=5;
 if (p_period->>'monthCalendarDays')::integer<>v_end-v_month+1 or (p_period->>'employedCalendarDays')::integer<>v_to-v_from+1
  or (p_period->>'monthWorkingDays')::integer>v_weekdays or (p_period->>'employedWorkingDays')::integer>v_employed_weekdays
  or (p_period->>'employedWorkingDays')::integer>(p_period->>'monthWorkingDays')::integer
  or (v_from=v_month and v_to=v_end and (p_period->>'employedWorkingDays')::integer<>(p_period->>'monthWorkingDays')::integer) then
  raise exception 'Inconsistent payroll day counts' using errcode='22023'; end if;
end $$;

-- Invoked under require_documents_hr's organisation lock by every public caller.
-- That lock also serializes checked calendar, attendance and contract changes.
create function private.payroll_period_context(p_org uuid,p_employee uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employees; c public.employment_contracts; v_month_end date; v_start date; v_end date;
 v_working integer; v_employed integer; v_period jsonb;
begin
 if p_month is null or p_month<'2026-01-01' or p_month>'2026-12-01' or extract(day from p_month)<>1 then
  raise exception 'Invalid payroll month' using errcode='22023'; end if;
 v_month_end:=(p_month+interval '1 month - 1 day')::date;
 select * into e from public.employees where organisation_id=p_org and id=p_employee;
 if not found then raise exception 'Employee unavailable' using errcode='42501'; end if;
 if e.status not in ('active','terminated') or e.start_date>v_month_end then
  raise exception 'Dated active employment required' using errcode='P0010'; end if;
 if (select count(*) from public.employment_contracts where organisation_id=p_org and employee_id=p_employee
  and start_date<=v_month_end and least(coalesce(end_date,v_month_end),coalesce(termination_date,v_month_end))>=greatest(p_month,e.start_date))<>1 then
  raise exception 'Exactly one contract must cover the payroll period' using errcode='P0010'; end if;
 select * into c from public.employment_contracts where organisation_id=p_org and employee_id=p_employee
  and start_date<=v_month_end and least(coalesce(end_date,v_month_end),coalesce(termination_date,v_month_end))>=greatest(p_month,e.start_date);
 if c.status not in ('active','terminated') or (c.status='terminated' and c.termination_date is null)
  or (e.status='terminated' and c.termination_date is null) or c.currency<>'RON' or c.working_hours>8 then
  raise exception 'Contract facts outside supported scope' using errcode='P0010'; end if;
 v_start:=greatest(p_month,e.start_date,c.start_date);
 v_end:=least(v_month_end,coalesce(c.end_date,v_month_end),coalesce(c.termination_date,v_month_end));
 -- The denominator and interval both use the saved organisation calendar. Any
 -- scheduled weekend or explicit working weekend needs a separate calculation.
 if v_start>v_end or not public.payroll_standard_schedule(p_org,p_employee,p_month)
  or exists(select 1 from public.work_calendar_days where organisation_id=p_org and day between p_month and v_month_end and is_working and extract(isodow from day)>5)
  or exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='approved' and start_date<=v_end and end_date>=v_start)
  or exists(select 1 from public.attendance where organisation_id=p_org and employee_id=p_employee and day between v_start and v_end and absence<>'none') then
  raise exception 'Payroll period outside supported scope' using errcode='P0010'; end if;
 if exists(select 1 from public.attendance a where a.organisation_id=p_org and a.employee_id=p_employee and a.day between p_month and v_month_end
  and ((a.day between v_start and v_end and (a.worked_hours<>a.planned_hours
   or a.planned_hours<>case when private.is_working_day(p_org,p_employee,a.day) then c.working_hours else 0 end))
   or (a.day not between v_start and v_end and a.worked_hours>0))) then
  raise exception 'Manual hours require payroll adjustments outside this calculator' using errcode='P0010'; end if;
 select count(*) into v_working from generate_series(0,v_month_end-p_month) n where private.is_working_day(p_org,p_employee,p_month+n);
 select count(*) into v_employed from generate_series(0,v_end-v_start) n where private.is_working_day(p_org,p_employee,v_start+n);
 if v_working=0 or v_employed=0 then raise exception 'Payroll period has no working days' using errcode='P0010'; end if;
 v_period:=jsonb_build_object('start',v_start,'end',v_end,'monthWorkingDays',v_working,'employedWorkingDays',v_employed,
  'monthCalendarDays',v_month_end-p_month+1,'employedCalendarDays',v_end-v_start+1);
 return jsonb_build_object('contract_id',c.id,'contract_number',c.contract_number,'basic',c.gross_salary,'hours',c.working_hours,'period',v_period);
end $$;

create function public.payroll_period_context(p_org uuid,p_employee uuid,p_month date)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_documents_hr(p_org);
 return private.payroll_period_context(p_org,p_employee,p_month);
end $$;

-- v4 uses exact integer bani and the server-derived standard-work period.
create function private.calculate_payroll_v4(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v numeric; v_second boolean; v_primary boolean; v_min numeric;
 v_basic numeric; v_bonus numeric; v_meals numeric; v_advance numeric; v_hours numeric;
 v_cash numeric; v_gross numeric; v_relief numeric; v_base numeric; v_health numeric;
 v_cas numeric; v_cass numeric; v_floor numeric; v_employer_cas numeric; v_employer_cass numeric;
 v_band numeric; v_percent numeric; v_eligible boolean; v_available numeric;
 v_personal numeric; v_young numeric; v_children numeric; v_tax_raw numeric; v_tax_base numeric;
 v_tax numeric; v_net numeric; v_cam numeric; v_earned numeric; v_deductible boolean;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>4096 then raise exception 'Invalid payroll input' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p) x where x not in ('month','basic','bonus','hours','meals','advance','floorException','evidence','mealsReference','advanceReference','primary','dependants','young','children','reduced','standard','period','deductionEmployer','deductionReference')) then
  raise exception 'Unknown payroll input' using errcode='22023'; end if;
 foreach k in array array['month','floorException','evidence','mealsReference','advanceReference','primary','young','reduced','standard','deductionEmployer','deductionReference'] loop
  if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'Invalid text input' using errcode='22023'; end if;
 end loop;
 if p->>'month' !~ '^2026-(0[1-9]|1[0-2])$' or p->>'standard'<>'on'
  or p->>'primary' not in ('yes','no') or p->>'young' not in ('yes','no') or p->>'reduced' not in ('yes','no')
  or p->>'floorException' not in ('none','student','apprentice','reduced_hours','retired','multiple_contracts') then
  raise exception 'Unsupported payroll facts' using errcode='22023'; end if;
 foreach k in array array['evidence','mealsReference','advanceReference','deductionReference'] loop
  if length(p->>k)>120 or (p->>k)<>btrim(p->>k) then raise exception 'Invalid reference' using errcode='22023'; end if;
 end loop;
 foreach k in array array['basic','bonus','hours','meals','advance','dependants','children'] loop
  if jsonb_typeof(p->k) is distinct from 'number' then raise exception 'Normalized numbers required' using errcode='22023'; end if;
  v:=(p->>k)::numeric;
  if v<0 or v>1000000 or v<>round(v,2) then raise exception 'Invalid numeric input' using errcode='22023'; end if;
 end loop;
 if (p->>'basic')::numeric<=0 or (p->>'hours')::numeric<=0 or (p->>'hours')::numeric>8
  or (p->>'dependants')::numeric not between 0 and 4 or (p->>'dependants')::numeric<>trunc((p->>'dependants')::numeric)
  or (p->>'children')::numeric not between 0 and 20 or (p->>'children')::numeric<>trunc((p->>'children')::numeric) then
  raise exception 'Invalid payroll bounds' using errcode='22023'; end if;
 perform private.validate_payroll_period(p->>'month',p->'period');
 if p->>'deductionEmployer' not in ('this','other') or (p->>'primary'='no' and p->>'deductionEmployer'<>'other')
  or (p->>'primary'='yes' and (p->'period'->>'employedCalendarDays')::integer<(p->'period'->>'monthCalendarDays')::integer and length(p->>'deductionReference')<3) then
  raise exception 'Review monthly deduction employer evidence' using errcode='22023'; end if;
 v_deductible:=p->>'primary'='yes' and p->>'deductionEmployer'='this';
 v_second:=(p->>'month')>='2026-07'; v_primary:=p->>'primary'='yes';
 v_min:=case when v_second then 432500 else 405000 end;
 v_basic:=(p->>'basic')::numeric*100; v_bonus:=(p->>'bonus')::numeric*100;
 v_meals:=(p->>'meals')::numeric*100; v_advance:=(p->>'advance')::numeric*100; v_hours:=(p->>'hours')::numeric;
 if v_basic*8<v_min*v_hours or (not v_primary and ((p->>'dependants')::numeric::integer<>0 or p->>'young'<>'no' or (p->>'children')::numeric::integer<>0))
  or (v_meals>0 and (not v_primary or length(p->>'mealsReference')<3))
  or (v_advance>0 and length(p->>'advanceReference')<3)
  or (p->>'floorException'<>'none' and (v_hours>=8 or length(p->>'evidence')<3)) then
  raise exception 'Unsupported payroll facts or missing evidence' using errcode='22023'; end if;
 v_earned:=private.payroll_ratio(v_basic*(p->'period'->>'employedWorkingDays')::integer,(p->'period'->>'monthWorkingDays')::integer,true);
 v_cash:=v_earned+v_bonus; v_gross:=v_cash+v_meals;
 if v_gross>100000000 then raise exception 'Gross limit exceeded' using errcode='22023'; end if;
 v_relief:=case when v_primary and v_hours=8 and p->>'reduced'='no' and v_basic=v_min
  and v_cash<=case when v_second then 460000 else 430000 end then case when v_second then 20000 else 30000 end else 0 end;
 -- No guessed tax-relief rounding: this narrow case remains accountant-only.
 if v_relief>0 and (p->'period'->>'employedCalendarDays')::integer<(p->'period'->>'monthCalendarDays')::integer then
  raise exception 'Partial-month minimum-wage relief requires accountant review' using errcode='P0014'; end if;
 v_base:=v_cash-v_relief; v_health:=v_base+v_meals;
 v_cas:=100*private.payroll_ratio(v_base*25,10000,true); v_cass:=100*private.payroll_ratio(v_health*10,10000,true);
 v_floor:=case when p->>'floorException'='none' then 100*private.payroll_ratio((v_min-case when v_second then 20000 else 30000 end)*(p->'period'->>'employedWorkingDays')::integer,100*(p->'period'->>'monthWorkingDays')::integer,true) else 0 end;
 v_employer_cas:=greatest(0,100*private.payroll_ratio(v_floor*25,10000,true)-v_cas);
 v_employer_cass:=greatest(0,100*private.payroll_ratio(v_floor*10,10000,true)-v_cass);
 v_band:=greatest(0,ceil((v_gross-v_min)/5000));
 v_percent:=(array[2000,2500,3000,3500,4500])[(p->>'dependants')::numeric::integer+1];
 v_eligible:=v_deductible and v_gross<=v_min+200000; v_available:=greatest(0,v_health-v_cas-v_cass);
 v_personal:=least(v_available,case when v_eligible then 100*private.payroll_ratio(v_min*greatest(0,v_percent-v_band*50),1000000) else 0 end);
 v_young:=least(v_available-v_personal,case when v_eligible and p->>'young'='yes' then 100*private.payroll_ratio(v_min*15,10000) else 0 end);
 v_children:=least(v_available-v_personal-v_young,case when v_deductible then (p->>'children')::numeric*10000 else 0 end);
 v_tax_raw:=greatest(0,v_health-v_cas-v_cass-v_personal-v_young-v_children);
 v_tax_base:=100*private.payroll_ratio(v_tax_raw,100); v_tax:=100*private.payroll_ratio(v_tax_base*10,10000);
 v_net:=v_cash-v_cas-v_cass-v_tax; v_cam:=100*private.payroll_ratio(v_base*225,1000000,true);
 if v_net<0 or v_advance>v_net then raise exception 'Insufficient cash pay' using errcode='22023'; end if;
 return jsonb_build_object('rules','RO-2026-monthly-v4','month',p->>'month','gross',v_gross/100,'cashGross',v_cash/100,
  'meals',v_meals/100,'relief',v_relief/100,'contributionBase',v_base/100,'healthBase',v_health/100,'cas',v_cas/100,'cass',v_cass/100,
  'personalDeduction',v_personal/100,'youngDeduction',v_young/100,'childrenDeduction',v_children/100,
  'taxBaseBeforeRounding',v_tax_raw/100,'taxBase',v_tax_base/100,'incomeTax',v_tax/100,'net',v_net/100,'advance',v_advance/100,
  'payable',(v_net-v_advance)/100,'contributionFloor',v_floor/100,'employerCas',v_employer_cas/100,'employerCass',v_employer_cass/100,
  'cam',v_cam/100,'employerCost',(v_gross+v_cam+v_employer_cas+v_employer_cass)/100);
end $$;

create function private.calculate_payroll_saved(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if p ? 'period' then return private.calculate_payroll_v4(p); end if;
 return private.calculate_payroll_v3(p);
end $$;

create or replace function private.payroll_sources(p_org uuid,p_employee uuid,p_month date,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employees; c public.employment_contracts; v_end date:=(p_month+interval '1 month - 1 day')::date; v_source jsonb; v_context jsonb;
begin
 v_context:=private.payroll_period_context(p_org,p_employee,p_month);
 select * into e from public.employees where organisation_id=p_org and id=p_employee;
 select * into c from public.employment_contracts where organisation_id=p_org and id=(v_context->>'contract_id')::uuid;
 if c.gross_salary is distinct from (p_input->>'basic')::numeric or c.working_hours is distinct from (p_input->>'hours')::numeric then
  raise exception 'Payroll contract facts changed' using errcode='P0010'; end if;
 if p_input ? 'period' then
  if p_input->'period' is distinct from v_context->'period' then
   raise exception 'Employment period changed; refresh and save again' using errcode='P0010'; end if;
 elsif e.status<>'active' or c.status<>'active'
  or v_context->'period'->>'start'<>p_month::text or v_context->'period'->>'end'<>v_end::text then
  raise exception 'Full-month active employment required for legacy payroll' using errcode='P0010';
 end if;
 select jsonb_build_object(
  'company',jsonb_build_object('name',o.name,'cui',o.cui,'address',coalesce(o.registered_address,'')),
  'employee',jsonb_build_object('name',e.first_name||' '||e.last_name,'email',e.email,'job',e.job_title,'department',e.department,'workplace',e.workplace,'start',e.start_date,'status',e.status),
  'contract',jsonb_build_object('id',c.id,'number',c.contract_number,'start',c.start_date,'end',c.end_date,'status',c.status,'basic',c.gross_salary,'hours',c.working_hours,'currency',c.currency,'review_version',c.review_version,'termination_date',c.termination_date),
  'period',v_context->'period',
  'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.day) from (select day,planned_hours,worked_hours,absence,version from public.attendance where organisation_id=p_org and employee_id=p_employee and day between p_month and v_end) a),'[]'::jsonb),
  'calendar',coalesce((select jsonb_agg(to_jsonb(a) order by a.day) from (select day,is_working from public.work_calendar_days where organisation_id=p_org and day between p_month and v_end) a),'[]'::jsonb),
  'schedule',(select jsonb_agg(jsonb_build_object('day',p_month+n,'weekdays',private.scheduled_weekdays(p_org,p_employee,p_month+n)) order by n) from generate_series(0,v_end-p_month) n),
  'benefits',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from (select eb.id,eb.starts_on,eb.ends_on,eb.active,eb.version,b.name,b.model,b.amount,b.active as benefit_active,b.version as benefit_version,bp.name as provider,bp.active as provider_active,bp.version as provider_version
   from public.employee_benefits eb join public.benefits b on b.organisation_id=eb.organisation_id and b.id=eb.benefit_id join public.benefit_providers bp on bp.organisation_id=b.organisation_id and bp.id=b.provider_id
   where eb.organisation_id=p_org and eb.employee_id=p_employee and eb.starts_on<=v_end and (eb.ends_on is null or eb.ends_on>=p_month)) a),'[]'::jsonb),
  'benefit_allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from (select i.id,i.employee_benefit_id,i.final_amount,i.included,i.version,r.status
   from public.benefit_run_items i join public.benefit_runs r on r.organisation_id=i.organisation_id and r.id=i.run_id where i.organisation_id=p_org and i.employee_id=p_employee and r.month=p_month) a),'[]'::jsonb)
 ) into v_source from public.organisations o where o.id=p_org;
 if octet_length(v_source::text)>1048576 then raise exception 'Payroll source too large' using errcode='P0012'; end if;
 return v_source;
end $$;

create or replace function public.save_payroll_item(p_org uuid,p_run uuid,p_version integer,p_employee uuid,p_input jsonb,p_benefits_reviewed boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; v_result jsonb; v_source jsonb; v_item uuid;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.payroll_runs where organisation_id=p_org and id=p_run;
 if not found then raise exception 'Run unavailable' using errcode='42501'; end if;
 if r.status<>'draft' then raise exception 'Run is locked' using errcode='D0001'; end if;
 if r.version is distinct from p_version then raise exception 'Run changed; refresh' using errcode='P0006'; end if;
 if p_benefits_reviewed is distinct from true then raise exception 'Review benefits first' using errcode='22023'; end if;
 v_result:=private.calculate_payroll_saved(p_input);
 if p_input->>'month'<>to_char(r.month,'YYYY-MM') then raise exception 'Run month mismatch' using errcode='22023'; end if;
 v_source:=private.payroll_sources(p_org,p_employee,r.month,p_input);
 select id into v_item from public.payroll_run_items where organisation_id=p_org and run_id=p_run and employee_id=p_employee;
 if v_item is null and (select count(*) from public.payroll_run_items where organisation_id=p_org and run_id=p_run)>=200 then raise exception 'Run limited to 200 employees' using errcode='P0012'; end if;
 insert into public.payroll_run_items(organisation_id,run_id,employee_id,input,result,source,saved_by)
 values(p_org,p_run,p_employee,p_input,v_result,v_source,auth.uid())
 on conflict(run_id,employee_id) do update set input=excluded.input,result=excluded.result,source=excluded.source,saved_by=auth.uid(),updated_at=now()
 returning id into v_item;
 update public.payroll_runs set version=version+1 where id=p_run;
 perform private.payroll_event(p_org,p_run,v_item,'item_saved',jsonb_build_object('employee_id',p_employee,'input',p_input,'result',v_result,'source',v_source,'benefits_reviewed',true));
 return v_item;
end $$;

create or replace function public.approve_payroll_run(p_org uuid,p_run uuid,p_version integer,p_confirm boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; i public.payroll_run_items; v_source jsonb;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.payroll_runs where organisation_id=p_org and id=p_run;
 if not found then raise exception 'Run unavailable' using errcode='42501'; end if;
 if r.status<>'draft' then raise exception 'Run is locked' using errcode='D0001'; end if;
 if r.version is distinct from p_version then raise exception 'Run changed; refresh' using errcode='P0006'; end if;
 if p_confirm is distinct from true or not exists(select 1 from public.payroll_run_items where organisation_id=p_org and run_id=p_run) then raise exception 'Confirm the selected employee scope' using errcode='22023'; end if;
 if (r.month+interval '1 month - 1 day')::date>=(now() at time zone 'Europe/Bucharest')::date then raise exception 'Only closed months may be approved' using errcode='P0011'; end if;
 if r.previous_run_id is distinct from (select id from public.payroll_runs where organisation_id=p_org and month=r.month and status='approved' order by revision desc limit 1) then
  raise exception 'Approved revision changed' using errcode='P0006'; end if;
 for i in select * from public.payroll_run_items where organisation_id=p_org and run_id=p_run order by employee_id loop
  v_source:=private.payroll_sources(p_org,i.employee_id,r.month,i.input);
  if v_source is distinct from i.source or private.calculate_payroll_saved(i.input) is distinct from i.result then raise exception 'Payroll sources changed; save the employee again' using errcode='P0010'; end if;
 end loop;
 update public.payroll_runs set status='approved',approved_by=auth.uid(),approved_at=now(),version=version+1 where id=p_run;
 perform private.payroll_event(p_org,p_run,null,'approved',jsonb_build_object('version',r.version+1,'scope_confirmed',true));
end $$;

-- New exports identify the period-aware projection; all-v3 exports keep v1.
alter table public.payroll_handover_exports drop constraint payroll_handover_exports_format_version_check;
alter table public.payroll_handover_exports add constraint payroll_handover_exports_format_version_check
 check(format_version in ('HRConnector-accountant-v1','HRConnector-accountant-v2'));
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
   or coalesce(i.result->>'rules','') not in ('RO-2026-monthly-v3','RO-2026-monthly-v4') then
   raise exception 'Unsupported saved payroll snapshot' using errcode='P0010'; end if;
  if i.result->>'rules'='RO-2026-monthly-v4' then
   v_format:='HRConnector-accountant-v2';
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
  select jsonb_object_agg(key,value) into v_input from jsonb_each(i.input) where key=any(v_input_text||v_input_numbers||case when i.result->>'rules'='RO-2026-monthly-v4' then array['period','deductionEmployer','deductionReference'] else array[]::text[] end);
  select jsonb_object_agg(key,value) into v_result from jsonb_each(i.result) where key=any(v_result_numbers||array['month','rules']);
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

revoke all on function private.validate_payroll_period(text,jsonb),private.payroll_period_context(uuid,uuid,date),private.calculate_payroll_v4(jsonb),private.calculate_payroll_saved(jsonb) from public,anon,authenticated;
revoke all on function public.payroll_period_context(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.payroll_period_context(uuid,uuid,date) to authenticated;
