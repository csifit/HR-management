-- Selected-employee payroll runs. All amounts are calculated in the database;
-- approved revisions are immutable and corrections create another revision.
create table public.payroll_runs (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 month date not null check(month between '2026-01-01' and '2026-12-01' and extract(day from month)=1),
 revision integer not null check(revision>0),
 status text not null default 'draft' check(status in ('draft','approved','discarded')),
 previous_run_id uuid,
 reason text not null default '' check(length(reason)<=1000),
 version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 unique(organisation_id,id), unique(organisation_id,month,revision),
 foreign key(organisation_id,previous_run_id) references public.payroll_runs(organisation_id,id),
 check((status='approved')=(approved_by is not null and approved_at is not null))
);
create unique index payroll_one_draft on public.payroll_runs(organisation_id,month) where status='draft';
create table public.payroll_run_items (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 run_id uuid not null,
 employee_id uuid not null,
 input jsonb not null check(jsonb_typeof(input)='object'),
 result jsonb not null check(jsonb_typeof(result)='object'),
 source jsonb not null check(jsonb_typeof(source)='object'),
 saved_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 unique(organisation_id,id), unique(organisation_id,run_id,id), unique(run_id,employee_id),
 foreign key(organisation_id,run_id) references public.payroll_runs(organisation_id,id),
 foreign key(organisation_id,employee_id) references public.employees(organisation_id,id)
);
create index payroll_items_employee on public.payroll_run_items(organisation_id,employee_id,run_id);
create table public.payroll_run_events (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 run_id uuid not null,
 -- A removed draft item remains identifiable in history after its row is removed.
 item_id uuid,
 action text not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 snapshot jsonb not null,
 foreign key(organisation_id,run_id) references public.payroll_runs(organisation_id,id)
);
create index payroll_events_run on public.payroll_run_events(organisation_id,run_id,created_at,id);
create table public.payroll_run_documents (
 document_id uuid primary key references public.employee_documents(id),
 organisation_id uuid not null,
 run_id uuid not null,
 item_id uuid not null,
 locale text not null check(locale in ('ro','en')),
 created_at timestamptz not null default now(),
 foreign key(organisation_id,run_id,item_id) references public.payroll_run_items(organisation_id,run_id,id)
);
create index payroll_documents_item on public.payroll_run_documents(organisation_id,item_id,created_at);
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_items enable row level security;
alter table public.payroll_run_events enable row level security;
alter table public.payroll_run_documents enable row level security;
revoke all on public.payroll_runs,public.payroll_run_items,public.payroll_run_events,public.payroll_run_documents from public,anon,authenticated;
grant select on public.payroll_runs,public.payroll_run_items,public.payroll_run_events,public.payroll_run_documents to authenticated;
create policy payroll_runs_read on public.payroll_runs for select to authenticated using(private.is_hr(organisation_id));
create policy payroll_items_read on public.payroll_run_items for select to authenticated using(private.is_hr(organisation_id));
create policy payroll_events_read on public.payroll_run_events for select to authenticated using(private.is_hr(organisation_id));
create policy payroll_documents_read on public.payroll_run_documents for select to authenticated using(private.is_hr(organisation_id));

create function private.payroll_ratio(p_n numeric,p_d numeric,p_half_up boolean default false)
returns numeric language sql immutable strict set search_path='' as $$
 select floor(p_n/p_d)+case when mod(p_n,p_d)*2>p_d or (p_half_up and mod(p_n,p_d)*2=p_d) then 1 else 0 end;
$$;

-- Mirror of src/lib/payroll.ts RO-2026-monthly-v3, using exact integer bani.
-- Inputs are normalized JSON from payrollSchema.parse, never result JSON.
create function private.calculate_payroll_v3(p jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v numeric; v_second boolean; v_primary boolean; v_min numeric;
 v_basic numeric; v_bonus numeric; v_meals numeric; v_advance numeric; v_hours numeric;
 v_cash numeric; v_gross numeric; v_relief numeric; v_base numeric; v_health numeric;
 v_cas numeric; v_cass numeric; v_floor numeric; v_employer_cas numeric; v_employer_cass numeric;
 v_band numeric; v_percent numeric; v_eligible boolean; v_available numeric;
 v_personal numeric; v_young numeric; v_children numeric; v_tax_raw numeric; v_tax_base numeric;
 v_tax numeric; v_net numeric; v_cam numeric;
begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>4096 then raise exception 'Invalid payroll input' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p) x where x not in ('month','basic','bonus','hours','meals','advance','floorException','evidence','mealsReference','advanceReference','primary','dependants','young','children','reduced','standard')) then
  raise exception 'Unknown payroll input' using errcode='22023'; end if;
 foreach k in array array['month','floorException','evidence','mealsReference','advanceReference','primary','young','reduced','standard'] loop
  if jsonb_typeof(p->k) is distinct from 'string' then raise exception 'Invalid text input' using errcode='22023'; end if;
 end loop;
 if p->>'month' !~ '^2026-(0[1-9]|1[0-2])$' or p->>'standard'<>'on'
  or p->>'primary' not in ('yes','no') or p->>'young' not in ('yes','no') or p->>'reduced' not in ('yes','no')
  or p->>'floorException' not in ('none','student','apprentice','reduced_hours','retired','multiple_contracts') then
  raise exception 'Unsupported payroll facts' using errcode='22023'; end if;
 foreach k in array array['evidence','mealsReference','advanceReference'] loop
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
 v_second:=(p->>'month')>='2026-07'; v_primary:=p->>'primary'='yes';
 v_min:=case when v_second then 432500 else 405000 end;
 v_basic:=(p->>'basic')::numeric*100; v_bonus:=(p->>'bonus')::numeric*100;
 v_meals:=(p->>'meals')::numeric*100; v_advance:=(p->>'advance')::numeric*100; v_hours:=(p->>'hours')::numeric;
 if v_basic*8<v_min*v_hours or (not v_primary and ((p->>'dependants')::numeric::integer<>0 or p->>'young'<>'no' or (p->>'children')::numeric::integer<>0))
  or (v_meals>0 and (not v_primary or length(p->>'mealsReference')<3))
  or (v_advance>0 and length(p->>'advanceReference')<3)
  or (p->>'floorException'<>'none' and (v_hours>=8 or length(p->>'evidence')<3)) then
  raise exception 'Unsupported payroll facts or missing evidence' using errcode='22023'; end if;
 v_cash:=v_basic+v_bonus; v_gross:=v_cash+v_meals;
 if v_gross>100000000 then raise exception 'Gross limit exceeded' using errcode='22023'; end if;
 v_relief:=case when v_primary and v_hours=8 and p->>'reduced'='no' and v_basic=v_min
  and v_cash<=case when v_second then 460000 else 430000 end then case when v_second then 20000 else 30000 end else 0 end;
 v_base:=v_cash-v_relief; v_health:=v_base+v_meals;
 v_cas:=100*private.payroll_ratio(v_base*25,10000,true); v_cass:=100*private.payroll_ratio(v_health*10,10000,true);
 v_floor:=case when p->>'floorException'='none' then v_min-case when v_second then 20000 else 30000 end else 0 end;
 v_employer_cas:=greatest(0,100*private.payroll_ratio(v_floor*25,10000,true)-v_cas);
 v_employer_cass:=greatest(0,100*private.payroll_ratio(v_floor*10,10000,true)-v_cass);
 v_band:=greatest(0,ceil((v_gross-v_min)/5000));
 v_percent:=(array[2000,2500,3000,3500,4500])[(p->>'dependants')::numeric::integer+1];
 v_eligible:=v_primary and v_gross<=v_min+200000; v_available:=greatest(0,v_health-v_cas-v_cass);
 v_personal:=least(v_available,case when v_eligible then 100*private.payroll_ratio(v_min*greatest(0,v_percent-v_band*50),1000000) else 0 end);
 v_young:=least(v_available-v_personal,case when v_eligible and p->>'young'='yes' then 100*private.payroll_ratio(v_min*15,10000) else 0 end);
 v_children:=least(v_available-v_personal-v_young,case when v_primary then (p->>'children')::numeric*10000 else 0 end);
 v_tax_raw:=greatest(0,v_health-v_cas-v_cass-v_personal-v_young-v_children);
 v_tax_base:=100*private.payroll_ratio(v_tax_raw,100); v_tax:=100*private.payroll_ratio(v_tax_base*10,10000);
 v_net:=v_cash-v_cas-v_cass-v_tax; v_cam:=100*private.payroll_ratio(v_base*225,1000000,true);
 if v_net<0 or v_advance>v_net then raise exception 'Insufficient cash pay' using errcode='22023'; end if;
 return jsonb_build_object('rules','RO-2026-monthly-v3','month',p->>'month','gross',v_gross/100,'cashGross',v_cash/100,
  'meals',v_meals/100,'relief',v_relief/100,'contributionBase',v_base/100,'healthBase',v_health/100,'cas',v_cas/100,'cass',v_cass/100,
  'personalDeduction',v_personal/100,'youngDeduction',v_young/100,'childrenDeduction',v_children/100,
  'taxBaseBeforeRounding',v_tax_raw/100,'taxBase',v_tax_base/100,'incomeTax',v_tax/100,'net',v_net/100,'advance',v_advance/100,
  'payable',(v_net-v_advance)/100,'contributionFloor',v_floor/100,'employerCas',v_employer_cas/100,'employerCass',v_employer_cass/100,
  'cam',v_cam/100,'employerCost',(v_gross+v_cam+v_employer_cas+v_employer_cass)/100);
end $$;

-- Stable facts only: automatic attendance advancing at midnight is not a source.
create function private.payroll_sources(p_org uuid,p_employee uuid,p_month date,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employees; c public.employment_contracts; v_end date:=(p_month+interval '1 month - 1 day')::date; v_source jsonb;
begin
 select * into e from public.employees where organisation_id=p_org and id=p_employee;
 if not found then raise exception 'Employee unavailable' using errcode='42501'; end if;
 if e.status<>'active' or e.start_date>p_month or
  (select count(*) from public.employment_contracts where organisation_id=p_org and employee_id=p_employee and start_date<=v_end and (end_date is null or end_date>=p_month))<>1 then
  raise exception 'Full-month active employment required' using errcode='P0010'; end if;
 select * into c from public.employment_contracts where organisation_id=p_org and employee_id=p_employee and start_date<=v_end and (end_date is null or end_date>=p_month);
 if c.status<>'active' or c.start_date>p_month or (c.end_date is not null and c.end_date<v_end) or c.currency<>'RON'
  or c.gross_salary<>(p_input->>'basic')::numeric or c.working_hours<>(p_input->>'hours')::numeric
  or not public.payroll_standard_schedule(p_org,p_employee,p_month)
  or exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='approved' and start_date<=v_end and end_date>=p_month)
  or exists(select 1 from public.attendance where organisation_id=p_org and employee_id=p_employee and day between p_month and v_end and absence<>'none') then
  raise exception 'Payroll facts outside supported scope' using errcode='P0010'; end if;
 -- Full-month pay is unsupported when HR recorded reduced hours or extra work.
 -- Do not turn an unannounced no-show (absence=none, worked_hours=0) into full salary.
 if exists(select 1 from public.attendance a where a.organisation_id=p_org and a.employee_id=p_employee
  and a.day between p_month and v_end and (a.worked_hours<>a.planned_hours
   or a.planned_hours<>case when private.is_working_day(p_org,p_employee,a.day) then c.working_hours else 0 end)) then
  raise exception 'Manual hours require payroll adjustments outside this calculator' using errcode='P0010'; end if;
 select jsonb_build_object(
  'company',jsonb_build_object('name',o.name,'cui',o.cui,'address',coalesce(o.registered_address,'')),
  'employee',jsonb_build_object('name',e.first_name||' '||e.last_name,'email',e.email,'job',e.job_title,'department',e.department,'workplace',e.workplace,'start',e.start_date,'status',e.status),
  'contract',jsonb_build_object('id',c.id,'number',c.contract_number,'start',c.start_date,'end',c.end_date,'status',c.status,'basic',c.gross_salary,'hours',c.working_hours,'currency',c.currency,'review_version',c.review_version),
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

create function private.payroll_event(p_org uuid,p_run uuid,p_item uuid,p_action text,p_snapshot jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.payroll_run_events(organisation_id,run_id,item_id,action,actor_id,snapshot) values(p_org,p_run,p_item,p_action,auth.uid(),p_snapshot);
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
 values(p_org,auth.uid(),'payroll.'||p_action,'payroll_runs',p_run,jsonb_build_object('item_id',p_item));
end $$;

create function public.create_payroll_run(p_org uuid,p_month date,p_previous uuid default null,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_latest public.payroll_runs; v_id uuid; v_revision integer; i public.payroll_run_items;
begin
 perform private.require_documents_hr(p_org);
 if p_month is null or p_month<'2026-01-01' or p_month>'2026-12-01' or extract(day from p_month)<>1
  or p_reason is null or length(btrim(p_reason))>1000 then raise exception 'Invalid payroll month or reason' using errcode='22023'; end if;
 if exists(select 1 from public.payroll_runs where organisation_id=p_org and month=p_month and status='draft') then raise exception 'Draft already exists' using errcode='23505'; end if;
 select * into v_latest from public.payroll_runs where organisation_id=p_org and month=p_month and status='approved' order by revision desc limit 1;
 if v_latest.id is distinct from p_previous then raise exception 'Choose latest approved revision' using errcode='P0006'; end if;
 if p_previous is not null and length(btrim(p_reason))<5 then raise exception 'Correction reason required' using errcode='22023'; end if;
 select coalesce(max(revision),0)+1 into v_revision from public.payroll_runs where organisation_id=p_org and month=p_month;
 insert into public.payroll_runs(organisation_id,month,revision,previous_run_id,reason,created_by) values(p_org,p_month,v_revision,p_previous,btrim(p_reason),auth.uid()) returning id into v_id;
 perform private.payroll_event(p_org,v_id,null,'created',jsonb_build_object('month',p_month,'revision',v_revision,'previous_run_id',p_previous,'reason',btrim(p_reason)));
 if p_previous is not null then
  for i in select * from public.payroll_run_items where organisation_id=p_org and run_id=p_previous loop
   insert into public.payroll_run_items(organisation_id,run_id,employee_id,input,result,source,saved_by)
    values(p_org,v_id,i.employee_id,i.input,i.result,i.source,auth.uid()) returning * into i;
   perform private.payroll_event(p_org,v_id,i.id,'item_copied',jsonb_build_object('employee_id',i.employee_id,'input',i.input,'result',i.result,'source',i.source));
  end loop;
 end if;
 return v_id;
end $$;

create function public.save_payroll_item(p_org uuid,p_run uuid,p_version integer,p_employee uuid,p_input jsonb,p_benefits_reviewed boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; v_result jsonb; v_source jsonb; v_item uuid;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.payroll_runs where organisation_id=p_org and id=p_run;
 if not found then raise exception 'Run unavailable' using errcode='42501'; end if;
 if r.status<>'draft' then raise exception 'Run is locked' using errcode='D0001'; end if;
 if r.version is distinct from p_version then raise exception 'Run changed; refresh' using errcode='P0006'; end if;
 if p_benefits_reviewed is distinct from true then raise exception 'Review benefits first' using errcode='22023'; end if;
 v_result:=private.calculate_payroll_v3(p_input);
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

create function public.remove_payroll_item(p_org uuid,p_run uuid,p_version integer,p_item uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; i public.payroll_run_items;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.payroll_runs where organisation_id=p_org and id=p_run;
 if not found then raise exception 'Run unavailable' using errcode='42501'; end if;
 if r.status<>'draft' then raise exception 'Run is locked' using errcode='D0001'; end if;
 if r.version is distinct from p_version then raise exception 'Run changed; refresh' using errcode='P0006'; end if;
 delete from public.payroll_run_items where organisation_id=p_org and run_id=p_run and id=p_item returning * into i;
 if not found then raise exception 'Item unavailable' using errcode='42501'; end if;
 update public.payroll_runs set version=version+1 where id=p_run;
 perform private.payroll_event(p_org,p_run,p_item,'item_removed',jsonb_build_object('employee_id',i.employee_id,'input',i.input,'result',i.result,'source',i.source));
end $$;

create function public.approve_payroll_run(p_org uuid,p_run uuid,p_version integer,p_confirm boolean)
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
  if v_source is distinct from i.source or private.calculate_payroll_v3(i.input) is distinct from i.result then raise exception 'Payroll sources changed; save the employee again' using errcode='P0010'; end if;
 end loop;
 update public.payroll_runs set status='approved',approved_by=auth.uid(),approved_at=now(),version=version+1 where id=p_run;
 perform private.payroll_event(p_org,p_run,null,'approved',jsonb_build_object('version',r.version+1,'scope_confirmed',true));
end $$;

create function public.discard_payroll_run(p_org uuid,p_run uuid,p_version integer,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs;
begin
 perform private.require_documents_hr(p_org);
 select * into r from public.payroll_runs where organisation_id=p_org and id=p_run;
 if not found then raise exception 'Run unavailable' using errcode='42501'; end if;
 if r.status<>'draft' then raise exception 'Run is locked' using errcode='D0001'; end if;
 if r.version is distinct from p_version then raise exception 'Run changed; refresh' using errcode='P0006'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'Discard reason required' using errcode='22023'; end if;
 update public.payroll_runs set status='discarded',version=version+1 where id=p_run;
 perform private.payroll_event(p_org,p_run,null,'discarded',jsonb_build_object('version',r.version+1,'reason',btrim(p_reason)));
end $$;

create function public.prepare_payroll_document(p_org uuid,p_item uuid,p_bytes integer,p_locale text)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.payroll_run_items; r public.payroll_runs; v_doc uuid; v_title text;
begin
 perform private.require_documents_hr(p_org);
 if p_locale is null or p_locale not in ('ro','en') or p_bytes is null or p_bytes not between 5 and 10485760 then raise exception 'Invalid document' using errcode='22023'; end if;
 select * into i from public.payroll_run_items where organisation_id=p_org and id=p_item;
 if not found then raise exception 'Item unavailable' using errcode='42501'; end if;
 select * into r from public.payroll_runs where organisation_id=p_org and id=i.run_id;
 if r.status<>'approved' then raise exception 'Approve payroll first' using errcode='D0001'; end if;
 v_title:=case when p_locale='ro' then 'Fluturaș de salariu' else 'Payslip' end||' - '||to_char(r.month,'YYYY-MM')||' - r'||r.revision;
 v_doc:=public.prepare_employee_document(p_org,i.employee_id,v_title,'employment','hr_only','generated','payslip-'||to_char(r.month,'YYYY-MM')||'-r'||r.revision||'.pdf',p_bytes);
 insert into public.payroll_run_documents(document_id,organisation_id,run_id,item_id,locale) values(v_doc,p_org,r.id,i.id,p_locale);
 perform private.payroll_event(p_org,r.id,i.id,'document_prepared',jsonb_build_object('employee_id',i.employee_id,'document_id',v_doc,'locale',p_locale));
 return v_doc;
end $$;

-- Retain the established explicit projections and add this employee's payroll only.
alter function private.privacy_employee_data(uuid,uuid,date,date) rename to privacy_employee_data_before_payroll;
create function private.privacy_employee_data(p_org uuid,p_employee uuid,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.privacy_employee_data_before_payroll(p_org,p_employee,p_from,p_to)||jsonb_build_object(
  'payroll_records',coalesce((select jsonb_agg(to_jsonb(x) order by x.month,x.revision) from (
   select i.id,r.month,r.revision,r.status,r.previous_run_id,i.input,i.result,i.updated_at,r.approved_at,
    (select coalesce(jsonb_agg(d.document_id order by d.created_at,d.document_id),'[]'::jsonb) from public.payroll_run_documents d where d.organisation_id=p_org and d.item_id=i.id) as documents
   from public.payroll_run_items i join public.payroll_runs r on r.organisation_id=i.organisation_id and r.id=i.run_id
   where i.organisation_id=p_org and i.employee_id=p_employee) x),'[]'::jsonb),
  'payroll_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (
   select e.id,r.month,r.revision,e.action,e.created_at,e.snapshot->'input' as input,e.snapshot->'result' as result,e.snapshot->'document_id' as document_id
   from public.payroll_run_events e join public.payroll_runs r on r.organisation_id=e.organisation_id and r.id=e.run_id
   where e.organisation_id=p_org and e.snapshot->>'employee_id'=p_employee::text) x),'[]'::jsonb)
 );
$$;
revoke all on function private.payroll_ratio(numeric,numeric,boolean),private.calculate_payroll_v3(jsonb),private.payroll_sources(uuid,uuid,date,jsonb),private.payroll_event(uuid,uuid,uuid,text,jsonb),private.privacy_employee_data_before_payroll(uuid,uuid,date,date),private.privacy_employee_data(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function public.create_payroll_run(uuid,date,uuid,text),public.save_payroll_item(uuid,uuid,integer,uuid,jsonb,boolean),public.remove_payroll_item(uuid,uuid,integer,uuid),public.approve_payroll_run(uuid,uuid,integer,boolean),public.discard_payroll_run(uuid,uuid,integer,text),public.prepare_payroll_document(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.create_payroll_run(uuid,date,uuid,text),public.save_payroll_item(uuid,uuid,integer,uuid,jsonb,boolean),public.remove_payroll_item(uuid,uuid,integer,uuid),public.approve_payroll_run(uuid,uuid,integer,boolean),public.discard_payroll_run(uuid,uuid,integer,text),public.prepare_payroll_document(uuid,uuid,integer,text) to authenticated;
