-- Approved annual leave pay, with externally approved per-request daily rates.
-- Versioned v6; older approved calculations and no-leave sources are preserved.
create function private.validate_payroll_annual(a jsonb,p_month text,p_period jsonb)
returns integer language plpgsql immutable set search_path='' as $$
declare r jsonb; d jsonb; k text; v_day date; v_id uuid; v_previous_id text:=''; v_previous_date text; v_dates text[]:=array[]::text[]; v_count integer:=0;
begin
 perform private.validate_payroll_period(p_month,p_period);
 if a is null or jsonb_typeof(a)<>'object' or octet_length(a::text)>10000 then raise exception 'Invalid annual leave facts' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(a) f where f not in ('requests','confirmed')) or a->>'confirmed' is distinct from 'on'
  or jsonb_typeof(a->'requests') is distinct from 'array' then raise exception 'Confirm annual leave facts' using errcode='22023'; end if;
 if jsonb_array_length(a->'requests') not between 1 and 31 then raise exception 'Invalid annual leave request count' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(a->'requests') loop
  if jsonb_typeof(r)<>'object' then raise exception 'Invalid annual leave request' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(r) f where f not in ('id','dates','dailyGross','rateReference'))
   or jsonb_typeof(r->'id') is distinct from 'string' or (r->>'id')<=v_previous_id
   or jsonb_typeof(r->'rateReference') is distinct from 'string' or length(r->>'rateReference') not between 3 and 120 or r->>'rateReference'<>btrim(r->>'rateReference')
   or jsonb_typeof(r->'dailyGross') is distinct from 'number' or jsonb_typeof(r->'dates') is distinct from 'array' then
   raise exception 'Invalid annual leave evidence' using errcode='22023'; end if;
  begin v_id:=(r->>'id')::uuid; exception when invalid_text_representation then raise exception 'Invalid request id' using errcode='22023'; end;
  v_previous_id:=r->>'id'; v_previous_date:='';
  if (r->>'dailyGross')::numeric<=0 or (r->>'dailyGross')::numeric>1000000 or (r->>'dailyGross')::numeric<>round((r->>'dailyGross')::numeric,2)
   or jsonb_array_length(r->'dates') not between 1 and 31 then raise exception 'Invalid rate or leave dates' using errcode='22023'; end if;
  for d in select value from jsonb_array_elements(r->'dates') loop
   if jsonb_typeof(d)<>'string' or (d#>>'{}') !~ '^2026-(0[1-9]|1[0-2])-[0-9]{2}$' then raise exception 'Invalid leave date' using errcode='22023'; end if;
   begin v_day:=(d#>>'{}')::date; exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid leave date' using errcode='22023'; end;
   if left(v_day::text,7)<>p_month or v_day::text<p_period->>'start' or v_day::text>p_period->>'end' or extract(isodow from v_day)>5
    or v_day::text<=v_previous_date or v_day::text=any(v_dates) then raise exception 'Leave dates must be unique, ordered and within employment' using errcode='22023'; end if;
   v_previous_date:=v_day::text; v_dates:=array_append(v_dates,v_day::text); v_count:=v_count+1;
  end loop;
 end loop;
 if v_count>(p_period->>'employedWorkingDays')::integer then raise exception 'Too many annual leave days' using errcode='22023'; end if;
 return v_count;
end $$;

create function private.payroll_annual_amounts(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_days integer; v_worked numeric; v_leave numeric:=0; r jsonb; v_gross numeric;
begin
 v_days:=private.validate_payroll_annual(p->'annualLeave',p->>'month',p->'period');
 v_worked:=private.payroll_ratio((p->>'basic')::numeric*100*((p->'period'->>'employedWorkingDays')::integer-v_days),(p->'period'->>'monthWorkingDays')::integer,true)/100;
 for r in select value from jsonb_array_elements(p->'annualLeave'->'requests') loop
  v_gross:=(r->>'dailyGross')::numeric*jsonb_array_length(r->'dates');
  if v_gross*100<private.payroll_ratio((p->>'basic')::numeric*100*jsonb_array_length(r->'dates'),(p->'period'->>'monthWorkingDays')::integer,true) then
   raise exception 'Approved annual leave rate below current basic-pay minimum' using errcode='22023'; end if;
  v_leave:=v_leave+v_gross;
 end loop;
 return jsonb_build_object('workedBasic',v_worked,'leaveGross',v_leave);
end $$;

create function private.payroll_annual_context(p_org uuid,p_employee uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employees; c public.employment_contracts; v_month_end date; v_start date; v_end date;
 v_working integer; v_employed integer; v_period jsonb; v_requests jsonb; v_history jsonb; v_leave_dates date[];
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
  or exists(select 1 from public.leave_requests l join public.leave_types t on t.organisation_id=l.organisation_id and t.id=l.leave_type_id where l.organisation_id=p_org and l.employee_id=p_employee and l.status='approved' and l.start_date<=v_end and l.end_date>=v_start and t.category<>'annual')
  or exists(select 1 from public.attendance where organisation_id=p_org and employee_id=p_employee and day between v_start and v_end and absence<>'none') then
  raise exception 'Payroll period outside supported scope' using errcode='P0010'; end if;
 select coalesce(array_agg(d order by d),array[]::date[]) into v_leave_dates
 from public.leave_requests l join public.leave_types t on t.organisation_id=l.organisation_id and t.id=l.leave_type_id
 cross join lateral unnest(l.work_dates) d
 where l.organisation_id=p_org and l.employee_id=p_employee and l.status='approved' and t.category='annual' and d between p_month and v_month_end;
 if cardinality(v_leave_dates)<>(select count(distinct d) from unnest(v_leave_dates) d)
  or exists(select 1 from unnest(v_leave_dates) d where d<v_start or d>v_end or not private.is_working_day(p_org,p_employee,d))
  or (cardinality(v_leave_dates)>0 and exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='pending' and start_date<=v_end and end_date>=v_start)) then
  raise exception 'Review duplicate, changed, out-of-employment or pending leave' using errcode='P0010'; end if;
 if exists(select 1 from public.attendance a where a.organisation_id=p_org and a.employee_id=p_employee and a.day between p_month and v_month_end
  and ((a.day between v_start and v_end and (a.worked_hours<>case when a.day=any(v_leave_dates) then 0 else a.planned_hours end
   or a.planned_hours<>case when private.is_working_day(p_org,p_employee,a.day) then c.working_hours else 0 end))
   or (a.day not between v_start and v_end and a.worked_hours>0))) then
  raise exception 'Manual hours require payroll adjustments outside this calculator' using errcode='P0010'; end if;
 select count(*) into v_working from generate_series(0,v_month_end-p_month) n where private.is_working_day(p_org,p_employee,p_month+n);
 select count(*) into v_employed from generate_series(0,v_end-v_start) n where private.is_working_day(p_org,p_employee,v_start+n);
 if v_working=0 or v_employed=0 then raise exception 'Payroll period has no working days' using errcode='P0010'; end if;
 v_period:=jsonb_build_object('start',v_start,'end',v_end,'monthWorkingDays',v_working,'employedWorkingDays',v_employed,
  'monthCalendarDays',v_month_end-p_month+1,'employedCalendarDays',v_end-v_start+1);
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'dates',x.dates) order by l.id),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('id',l.id,'type_id',t.id,'category',t.category,'start',l.start_date,'end',l.end_date,'work_dates',l.work_dates,'status',l.status,'version',l.version) order by l.id),'[]'::jsonb)
 into v_requests,v_history from public.leave_requests l join public.leave_types t on t.organisation_id=l.organisation_id and t.id=l.leave_type_id
 cross join lateral (select jsonb_agg(d order by d) as dates from unnest(l.work_dates) d where d between v_start and v_end) x
 where l.organisation_id=p_org and l.employee_id=p_employee and l.status='approved' and t.category='annual' and x.dates is not null;
 return jsonb_build_object('annual_leave',jsonb_build_object('requests',v_requests,'source',v_history),'contract_id',c.id,'contract_number',c.contract_number,'basic',c.gross_salary,'hours',c.working_hours,'period',v_period);
end $$;


create function private.calculate_payroll_v6(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v numeric; v_second boolean; v_primary boolean; v_min numeric;
 v_basic numeric; v_bonus numeric; v_meals numeric; v_advance numeric; v_hours numeric;
 v_cash numeric; v_gross numeric; v_relief numeric; v_base numeric; v_health numeric;
 v_cas numeric; v_cass numeric; v_floor numeric; v_employer_cas numeric; v_employer_cass numeric;
 v_band numeric; v_percent numeric; v_eligible boolean; v_available numeric;
 v_personal numeric; v_young numeric; v_children numeric; v_tax_raw numeric; v_tax_base numeric;
 v_tax numeric; v_net numeric; v_cam numeric; v_earned numeric; v_deductible boolean; v_annual jsonb; v_settlement jsonb; v_unused numeric:=0; v_other numeric:=0;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>12288 then raise exception 'Invalid payroll input' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p) x where x not in ('month','basic','bonus','hours','meals','advance','floorException','evidence','mealsReference','advanceReference','primary','dependants','young','children','reduced','standard','period','deductionEmployer','deductionReference','annualLeave','settlement')) then
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
 v_annual:=private.payroll_annual_amounts(p);
 v_earned:=(v_annual->>'workedBasic')::numeric*100;
 v_bonus:=v_bonus+(v_annual->>'leaveGross')::numeric*100;
 if p ? 'settlement' then
  perform private.validate_payroll_settlement(p->'settlement');
  v_unused:=round((p->'settlement'->>'days')::numeric*(p->'settlement'->>'dailyGross')::numeric,2);
  v_other:=(p->'settlement'->>'otherGross')::numeric;
  v_bonus:=v_bonus+(v_unused+v_other)*100;
 end if;
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
 return jsonb_build_object('rules','RO-2026-monthly-v6','month',p->>'month','gross',v_gross/100,'cashGross',v_cash/100,
  'meals',v_meals/100,'relief',v_relief/100,'contributionBase',v_base/100,'healthBase',v_health/100,'cas',v_cas/100,'cass',v_cass/100,
  'personalDeduction',v_personal/100,'youngDeduction',v_young/100,'childrenDeduction',v_children/100,
  'taxBaseBeforeRounding',v_tax_raw/100,'taxBase',v_tax_base/100,'incomeTax',v_tax/100,'net',v_net/100,'advance',v_advance/100,
  'payable',(v_net-v_advance)/100,'contributionFloor',v_floor/100,'employerCas',v_employer_cas/100,'employerCass',v_employer_cass/100,
  'cam',v_cam/100,'employerCost',(v_gross+v_cam+v_employer_cas+v_employer_cass)/100,'annualLeave',v_annual)
  ||case when p ? 'settlement' then jsonb_build_object('settlement',jsonb_build_object('unusedLeaveGross',v_unused,'otherGross',v_other)) else '{}'::jsonb end;
end $$;


create function private.payroll_sources_annual(p_org uuid,p_employee uuid,p_month date,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employees; c public.employment_contracts; v_end date:=(p_month+interval '1 month - 1 day')::date; v_source jsonb; v_context jsonb;
begin
 v_context:=private.payroll_annual_context(p_org,p_employee,p_month);
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
 v_source:=v_source||jsonb_build_object('annual_leave',v_context->'annual_leave');
 if octet_length(v_source::text)>1048576 then raise exception 'Payroll source too large' using errcode='P0012'; end if;
 return v_source;
end $$;


-- Retain older dispatch and source snapshots when no annual leave is supplied.
create or replace function private.calculate_payroll_saved(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if p ? 'annualLeave' then return private.calculate_payroll_v6(p);
 elsif p ? 'settlement' then return private.calculate_payroll_v5(p);
 elsif p ? 'period' then return private.calculate_payroll_v4(p);
 else return private.calculate_payroll_v3(p); end if;
end $$;

create or replace function public.payroll_period_context(p_org uuid,p_employee uuid,p_month date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; c public.employment_contracts; v_allowed boolean; a jsonb;
begin
 perform private.require_documents_hr(p_org);
 v:=private.payroll_annual_context(p_org,p_employee,p_month); a:=v->'annual_leave';
 select * into c from public.employment_contracts where organisation_id=p_org and id=(v->>'contract_id')::uuid;
 v_allowed:=c.status='terminated' and c.termination_date is not null and to_char(c.termination_date,'YYYY-MM')=to_char(p_month,'YYYY-MM')
  and c.termination_date::text=v->'period'->>'end'
  and not exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='pending');
 v:=(v-'annual_leave')||jsonb_build_object('settlement_allowed',v_allowed,'termination_date',c.termination_date);
 if jsonb_array_length(a->'requests')>0 then v:=v||jsonb_build_object('annual_leave',jsonb_build_object('requests',a->'requests')); end if;
 return v;
end $$;

alter function private.payroll_sources(uuid,uuid,date,jsonb) rename to payroll_sources_before_annual;
create function private.payroll_sources(p_org uuid,p_employee uuid,p_month date,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb; a jsonb;
begin
 if not (p_input ? 'annualLeave') then return private.payroll_sources_before_annual(p_org,p_employee,p_month,p_input); end if;
 v:=private.payroll_sources_annual(p_org,p_employee,p_month,p_input);
 perform private.validate_payroll_annual(p_input->'annualLeave',p_input->>'month',p_input->'period');
 select jsonb_agg(jsonb_build_object('id',value->'id','dates',value->'dates') order by value->>'id') into a from jsonb_array_elements(p_input->'annualLeave'->'requests');
 if a is distinct from v->'annual_leave'->'requests' then raise exception 'Approved annual leave changed; refresh and save again' using errcode='P0010'; end if;
 if p_input ? 'settlement' then
  perform private.validate_payroll_settlement(p_input->'settlement');
  if v->'contract'->>'status'<>'terminated' or v->'contract'->>'termination_date' is null
   or left(v->'contract'->>'termination_date',7)<>to_char(p_month,'YYYY-MM')
   or v->'contract'->>'termination_date'<>p_input->'period'->>'end'
   or exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='pending') then
   raise exception 'Review termination and pending leave before settlement' using errcode='P0010'; end if;
  v:=v||jsonb_build_object('termination_settlement',jsonb_build_object(
   'termination_date',v->'contract'->'termination_date',
   'balances',coalesce((select jsonb_agg(to_jsonb(b) order by b.year,b.leave_type_id) from
    (select year,leave_type_id,allowance from public.leave_balances where organisation_id=p_org and employee_id=p_employee) b),'[]'::jsonb),
   'leave',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from
    (select id,leave_type_id,start_date,end_date,work_dates,status,version from public.leave_requests where organisation_id=p_org and employee_id=p_employee) l),'[]'::jsonb)
  ));
 end if;
 if octet_length(v::text)>1048576 then raise exception 'Payroll source too large' using errcode='P0012'; end if;
 return v;
end $$;

alter table public.payroll_handover_exports drop constraint payroll_handover_exports_format_version_check;
alter table public.payroll_handover_exports add constraint payroll_handover_exports_format_version_check
 check(format_version in ('HRConnector-accountant-v1','HRConnector-accountant-v2','HRConnector-accountant-v3','HRConnector-accountant-v4'));

revoke all on function private.validate_payroll_annual(jsonb,text,jsonb),private.payroll_annual_amounts(jsonb),private.payroll_annual_context(uuid,uuid,date),private.calculate_payroll_v6(jsonb),private.payroll_sources_annual(uuid,uuid,date,jsonb),private.payroll_sources(uuid,uuid,date,jsonb),private.payroll_sources_before_annual(uuid,uuid,date,jsonb),private.calculate_payroll_saved(jsonb) from public,anon,authenticated;
revoke all on function public.payroll_period_context(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.payroll_period_context(uuid,uuid,date) to authenticated;

-- Immutable period/settlement/annual-leave export, independent of today's rules.
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
   or coalesce(i.result->>'rules','') not in ('RO-2026-monthly-v3','RO-2026-monthly-v4','RO-2026-monthly-v5','RO-2026-monthly-v6') then
   raise exception 'Unsupported saved payroll snapshot' using errcode='P0010'; end if;
  if i.result->>'rules' in ('RO-2026-monthly-v4','RO-2026-monthly-v5','RO-2026-monthly-v6') then
   if v_format not in ('HRConnector-accountant-v3','HRConnector-accountant-v4') then v_format:='HRConnector-accountant-v2'; end if;
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
  if i.result->>'rules'='RO-2026-monthly-v5' or (i.result->>'rules'='RO-2026-monthly-v6' and i.input ? 'settlement') then
   if v_format<>'HRConnector-accountant-v4' then v_format:='HRConnector-accountant-v3'; end if;
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
  if i.result->>'rules'='RO-2026-monthly-v6' then
   v_format:='HRConnector-accountant-v4';
   begin perform private.validate_payroll_annual(i.input->'annualLeave',i.input->>'month',i.input->'period');
   exception when sqlstate '22023' then raise exception 'Invalid saved annual leave facts' using errcode='P0010'; end;
   if jsonb_typeof(i.result->'annualLeave') is distinct from 'object'
    or jsonb_typeof(i.result->'annualLeave'->'workedBasic') is distinct from 'number'
    or jsonb_typeof(i.result->'annualLeave'->'leaveGross') is distinct from 'number'
    or exists(select 1 from jsonb_object_keys(i.result->'annualLeave') f where f not in ('workedBasic','leaveGross'))
    or (i.result->'annualLeave'->>'workedBasic')::numeric not between 0 and 1000000
    or (i.result->'annualLeave'->>'leaveGross')::numeric<=0 or (i.result->'annualLeave'->>'leaveGross')::numeric>1000000
    or (i.result->'annualLeave'->>'workedBasic')::numeric<>round((i.result->'annualLeave'->>'workedBasic')::numeric,2)
    or (i.result->'annualLeave'->>'leaveGross')::numeric<>round((i.result->'annualLeave'->>'leaveGross')::numeric,2)
    or (select jsonb_agg(jsonb_build_object('id',value->'id','dates',value->'dates') order by value->>'id') from jsonb_array_elements(i.input->'annualLeave'->'requests')) is distinct from i.source->'annual_leave'->'requests' then
    raise exception 'Invalid saved annual leave components or dates' using errcode='P0010'; end if;
  elsif i.input ? 'annualLeave' or i.result ? 'annualLeave' then raise exception 'Unexpected annual leave in older payroll' using errcode='P0010';
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
  select jsonb_object_agg(key,value) into v_input from jsonb_each(i.input) where key=any(v_input_text||v_input_numbers||case when i.result->>'rules' in ('RO-2026-monthly-v4','RO-2026-monthly-v5','RO-2026-monthly-v6') then array['period','deductionEmployer','deductionReference'] else array[]::text[] end);
  select jsonb_object_agg(key,value) into v_result from jsonb_each(i.result) where key=any(v_result_numbers||array['month','rules']);
  if i.result->>'rules'='RO-2026-monthly-v5' or (i.result->>'rules'='RO-2026-monthly-v6' and i.input ? 'settlement') then
   v_input:=v_input||jsonb_build_object('settlement',i.input->'settlement');
   v_result:=v_result||jsonb_build_object('settlement',i.result->'settlement');
  end if;
  if i.result->>'rules'='RO-2026-monthly-v6' then
   v_input:=v_input||jsonb_build_object('annualLeave',i.input->'annualLeave');
   v_result:=v_result||jsonb_build_object('annualLeave',i.result->'annualLeave');
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
