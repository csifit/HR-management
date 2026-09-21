-- HR-reviewed benefit preparation. Amounts are configured in RON, not statutory rates.
create type public.benefit_model as enum ('fixed_monthly','per_worked_day','annual_allowance','flexible_budget','non_financial');
create table public.benefit_providers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check(length(trim(name)) between 2 and 100),
  adapter_key text not null check(adapter_key in ('custom','pluxee','edenred','up_romania')),
  active boolean not null default true,
  version bigint not null default 1,
  unique(organisation_id,id), unique(organisation_id,name)
);
create table public.benefits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  provider_id uuid not null,
  name text not null check(length(trim(name)) between 2 and 100),
  model public.benefit_model not null,
  amount numeric(12,2) not null check(amount between 0 and 1000000),
  active boolean not null default true,
  version bigint not null default 1,
  foreign key(organisation_id,provider_id) references public.benefit_providers(organisation_id,id),
  check(model <> 'non_financial' or amount=0),
  unique(organisation_id,id), unique(organisation_id,name)
);
create table public.employee_benefits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null,
  benefit_id uuid not null,
  starts_on date not null check(starts_on between '2000-01-01' and '2200-12-31'),
  ends_on date check(ends_on between starts_on and '2200-12-31'),
  active boolean not null default true,
  version bigint not null default 1,
  foreign key(organisation_id,employee_id) references public.employees(organisation_id,id),
  foreign key(organisation_id,benefit_id) references public.benefits(organisation_id,id),
  unique(organisation_id,id), unique(organisation_id,employee_id,benefit_id)
);
create table public.benefit_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  month date not null check(month between '2000-01-01' and '2200-12-01' and extract(day from month)=1),
  status text not null default 'draft' check(status in ('draft','approved')),
  source_hash text not null,
  worked_days integer not null default 0,
  prepared_by uuid not null references auth.users(id),
  prepared_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  version bigint not null default 1,
  unique(organisation_id,id), unique(organisation_id,month)
);
create table public.benefit_run_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  run_id uuid not null,
  employee_id uuid not null,
  employee_benefit_id uuid not null,
  month date not null,
  employee_name text not null,
  benefit_name text not null,
  provider_name text not null,
  model public.benefit_model not null,
  unit_amount numeric(12,2) not null,
  worked_days integer not null,
  missing_days integer not null,
  annual_used numeric(12,2) not null default 0,
  suggested_amount numeric(12,2) not null,
  final_amount numeric(12,2) not null check(final_amount between 0 and 31000000),
  included boolean not null,
  flags text[] not null default '{}',
  reviewed boolean not null,
  review_note text check(length(review_note) <= 500),
  reviewed_by uuid references auth.users(id),
  version bigint not null default 1,
  foreign key(organisation_id,run_id) references public.benefit_runs(organisation_id,id),
  foreign key(organisation_id,employee_id) references public.employees(organisation_id,id),
  foreign key(organisation_id,employee_benefit_id) references public.employee_benefits(organisation_id,id),
  unique(run_id,employee_benefit_id),
  check(included or final_amount=0),
  check(model <> 'non_financial' or final_amount=0)
);
create index employee_benefits_employee_idx on public.employee_benefits(organisation_id,employee_id);
create index benefit_items_employee_idx on public.benefit_run_items(organisation_id,employee_id,month);

create function private.can_read_benefits(p_org uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_hr(p_org) or private.owns_employee(p_org,p_employee);
$$;
create function private.benefit_run_approved(p_org uuid,p_run uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.benefit_runs where organisation_id=p_org and id=p_run and status='approved');
$$;
revoke all on function private.can_read_benefits(uuid,uuid),private.benefit_run_approved(uuid,uuid) from public,anon;
grant execute on function private.can_read_benefits(uuid,uuid),private.benefit_run_approved(uuid,uuid) to authenticated;
alter table public.benefit_providers enable row level security;
alter table public.benefits enable row level security;
alter table public.employee_benefits enable row level security;
alter table public.benefit_runs enable row level security;
alter table public.benefit_run_items enable row level security;
revoke all on public.benefit_providers,public.benefits,public.employee_benefits,public.benefit_runs,public.benefit_run_items from public,anon,authenticated;
grant select on public.benefit_providers,public.benefits,public.employee_benefits,public.benefit_runs,public.benefit_run_items to authenticated;
create policy providers_read on public.benefit_providers for select to authenticated using(private.role_in(organisation_id) is not null and private.organisation_status(organisation_id)<>'blocked');
create policy enrolments_read on public.employee_benefits for select to authenticated using(private.can_read_benefits(organisation_id,employee_id));
create policy benefits_read on public.benefits for select to authenticated using(private.is_hr(organisation_id) or exists(
  select 1 from public.employee_benefits e where e.organisation_id=benefits.organisation_id and e.benefit_id=benefits.id));
create policy runs_read on public.benefit_runs for select to authenticated using(private.is_hr(organisation_id));
create policy benefit_items_read on public.benefit_run_items for select to authenticated using(private.is_hr(organisation_id) or
  (private.owns_employee(organisation_id,employee_id) and private.benefit_run_approved(organisation_id,run_id)));

create function private.require_benefits_hr(p_org uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_time_organisation(p_org);
  if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
end;
$$;
create function public.save_benefit_provider(p_org uuid,p_id uuid,p_version bigint,p_name text,p_adapter text,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.require_benefits_hr(p_org);
  if p_id is null then
    insert into public.benefit_providers(organisation_id,name,adapter_key,active) values(p_org,trim(p_name),p_adapter,p_active) returning id into v_id;
  else
    update public.benefit_providers set name=trim(p_name),active=p_active,version=version+1
      where organisation_id=p_org and id=p_id and version=p_version returning id into v_id;
    if not found then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  end if;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'benefit.provider_saved','benefit_providers',v_id);
  return v_id;
end;
$$;
create function public.save_benefit(p_org uuid,p_id uuid,p_version bigint,p_provider uuid,p_name text,p_model public.benefit_model,p_amount numeric,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.require_benefits_hr(p_org);
  if p_amount is null or round(p_amount,2)<>p_amount then raise exception 'Invalid amount' using errcode='22023'; end if;
  if p_id is null then
    insert into public.benefits(organisation_id,provider_id,name,model,amount,active) values(p_org,p_provider,trim(p_name),p_model,p_amount,p_active) returning id into v_id;
  else
    -- Model remains fixed so annual spending cannot be reset by changing categories.
    update public.benefits set provider_id=p_provider,name=trim(p_name),amount=p_amount,active=p_active,version=version+1
      where organisation_id=p_org and id=p_id and version=p_version returning id into v_id;
    if not found then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  end if;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'benefit.saved','benefits',v_id);
  return v_id;
end;
$$;
create function public.save_employee_benefit(p_org uuid,p_id uuid,p_version bigint,p_employee uuid,p_benefit uuid,p_start date,p_end date,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.require_benefits_hr(p_org);
  if not exists(select 1 from public.employees where organisation_id=p_org and id=p_employee and start_date<=p_start) then
    raise exception 'Invalid employee or start date' using errcode='22023'; end if;
  if p_id is null then
    insert into public.employee_benefits(organisation_id,employee_id,benefit_id,starts_on,ends_on,active)
      values(p_org,p_employee,p_benefit,p_start,p_end,p_active) returning id into v_id;
  else
    update public.employee_benefits set starts_on=p_start,ends_on=p_end,active=p_active,version=version+1
      where organisation_id=p_org and id=p_id and employee_id=p_employee and benefit_id=p_benefit and version=p_version returning id into v_id;
    if not found then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  end if;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'benefit.enrolment_saved','employee_benefits',v_id);
  return v_id;
end;
$$;

-- Canonical calculation input includes only employment/time data, never salary.
-- A hash of this document detects changes between preparation and approval.
create function private.benefit_sources(p_org uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record; v_rows jsonb := '[]'; v_end date := (p_month+interval '1 month - 1 day')::date;
  v_start date; v_stop date; v_time jsonb; v_contracts jsonb; v_flags text[];
  v_worked integer; v_missing integer; v_absent integer; v_planned integer;
  v_contract boolean; v_full_contract boolean; v_included boolean; v_amount numeric; v_used numeric;
begin
  for r in select e.id as employee_id,e.first_name,e.last_name,e.status,e.start_date,
    eb.id as enrolment_id,eb.starts_on,eb.ends_on,eb.active as enrolment_active,eb.version as enrolment_version,
    b.id as benefit_id,b.name as benefit_name,b.model,b.amount,b.active as benefit_active,b.version as benefit_version,
    p.name as provider_name,p.active as provider_active,p.version as provider_version
    from public.employee_benefits eb join public.employees e on e.organisation_id=eb.organisation_id and e.id=eb.employee_id
    join public.benefits b on b.organisation_id=eb.organisation_id and b.id=eb.benefit_id
    join public.benefit_providers p on p.organisation_id=b.organisation_id and p.id=b.provider_id
    where eb.organisation_id=p_org and eb.starts_on<=v_end and coalesce(eb.ends_on,v_end)>=p_month
    order by eb.id
  loop
    v_start := greatest(p_month,r.starts_on,r.start_date); v_stop := least(v_end,coalesce(r.ends_on,v_end));
    select coalesce(jsonb_agg(to_jsonb(a) order by a.day),'[]') into v_time
      from public.attendance_month(p_org,r.employee_id,p_month) a;
    select count(*) filter(where (a->>'worked_hours')::numeric>0),
      count(*) filter(where (a->>'planned_hours')::numeric>0 and not (a->>'recorded')::boolean),
      count(*) filter(where a->>'category' in ('annual','medical','unpaid','other')),
      count(*) filter(where (a->>'planned_hours')::numeric>0)
      into v_worked,v_missing,v_absent,v_planned from jsonb_array_elements(v_time) a where (a->>'day')::date between v_start and v_stop;
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'start',c.start_date,'end',c.end_date) order by c.id),'[]'),
      coalesce(bool_or(c.status='active'),false),
      coalesce(bool_or(c.status='active' and c.start_date<=v_start and coalesce(c.end_date,v_stop)>=v_stop),false)
      into v_contracts,v_contract,v_full_contract from public.employment_contracts c
      where c.organisation_id=p_org and c.employee_id=r.employee_id and c.start_date<=v_stop and coalesce(c.end_date,v_stop)>=v_start;
    v_flags := '{}';
    if r.status<>'active' then v_flags:=array_append(v_flags,'employee_status'); end if;
    if not v_contract or exists(select 1 from jsonb_array_elements(v_contracts) c where c->>'status' in ('suspended','terminated')) then v_flags:=array_append(v_flags,'contract_status'); end if;
    if v_start>p_month or v_stop<v_end or (v_contract and not v_full_contract) then v_flags:=array_append(v_flags,'partial_month'); end if;
    if not r.enrolment_active or not r.benefit_active or not r.provider_active then v_flags:=array_append(v_flags,'disabled'); end if;
    if v_missing>0 then v_flags:=array_append(v_flags,'missing_attendance'); end if;
    if v_planned>0 and v_absent=v_planned then v_flags:=array_append(v_flags,'full_absence'); end if;
    if v_worked=0 then v_flags:=array_append(v_flags,'no_worked_days'); end if;
    if r.model in ('annual_allowance','flexible_budget') then v_flags:=array_append(v_flags,'manual_allocation'); end if;
    if v_end >= (now() at time zone 'Europe/Bucharest')::date then v_flags:=array_append(v_flags,'open_month'); end if;
    v_included := r.status='active' and v_contract and r.enrolment_active and r.benefit_active and r.provider_active;
    v_amount := case when not v_included then 0 when r.model='fixed_monthly' then r.amount when r.model='per_worked_day' then r.amount*v_worked else 0 end;
    select coalesce(sum(i.final_amount),0) into v_used from public.benefit_run_items i join public.benefit_runs br on br.organisation_id=i.organisation_id and br.id=i.run_id
      where i.organisation_id=p_org and i.employee_benefit_id=r.enrolment_id and br.status='approved' and extract(year from br.month)=extract(year from p_month);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'employee_id',r.employee_id,'employee_benefit_id',r.enrolment_id,'employee_name',r.first_name||' '||r.last_name,
      'benefit_name',r.benefit_name,'provider_name',r.provider_name,'model',r.model,'unit_amount',r.amount,
      'worked_days',v_worked,'missing_days',v_missing,'annual_used',case when r.model='annual_allowance' then v_used else 0 end,
      'suggested_amount',v_amount,'included',v_included,'flags',to_jsonb(v_flags),
      'source',jsonb_build_object('employee_status',r.status,'start_date',r.start_date,'enrolment_version',r.enrolment_version,
        'benefit_version',r.benefit_version,'provider_version',r.provider_version,'attendance',v_time,'contracts',v_contracts)));
  end loop;
  return v_rows;
end;
$$;
create function public.prepare_benefit_month(p_org uuid,p_month date,p_version bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_run public.benefit_runs; v_sources jsonb; r jsonb; v_worked integer;
begin
  perform private.require_benefits_hr(p_org);
  if p_month is null or p_month<'2000-01-01' or p_month>'2200-12-01' or extract(day from p_month)<>1 then raise exception 'Invalid month' using errcode='22023'; end if;
  select * into v_run from public.benefit_runs where organisation_id=p_org and month=p_month;
  if v_run.status='approved' then raise exception 'Approved month is locked' using errcode='B0001'; end if;
  if v_run.version is distinct from p_version then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  v_sources := private.benefit_sources(p_org,p_month);
  if jsonb_array_length(v_sources)=0 then raise exception 'No enrolments in this month' using errcode='B0005'; end if;
  select count(distinct (s->>'employee_id',a->>'day')) into v_worked from jsonb_array_elements(v_sources) s
    cross join lateral jsonb_array_elements(s->'source'->'attendance') a where (a->>'worked_hours')::numeric>0;
  if v_run.id is null then
    insert into public.benefit_runs(organisation_id,month,source_hash,worked_days,prepared_by) values(p_org,p_month,md5(v_sources::text),v_worked,auth.uid()) returning * into v_run;
  else
    update public.benefit_runs set source_hash=md5(v_sources::text),worked_days=v_worked,prepared_by=auth.uid(),prepared_at=now(),version=version+1 where id=v_run.id;
    delete from public.benefit_run_items where organisation_id=p_org and run_id=v_run.id;
  end if;
  for r in select value from jsonb_array_elements(v_sources) loop
    insert into public.benefit_run_items(organisation_id,run_id,employee_id,employee_benefit_id,month,employee_name,benefit_name,provider_name,model,unit_amount,worked_days,missing_days,annual_used,suggested_amount,final_amount,included,flags,reviewed)
      values(p_org,v_run.id,(r->>'employee_id')::uuid,(r->>'employee_benefit_id')::uuid,p_month,r->>'employee_name',r->>'benefit_name',r->>'provider_name',
        (r->>'model')::public.benefit_model,(r->>'unit_amount')::numeric,(r->>'worked_days')::integer,(r->>'missing_days')::integer,(r->>'annual_used')::numeric,
        (r->>'suggested_amount')::numeric,(r->>'suggested_amount')::numeric,(r->>'included')::boolean,array(select jsonb_array_elements_text(r->'flags')),jsonb_array_length(r->'flags')=0);
  end loop;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'benefit.month_prepared','benefit_runs',v_run.id);
  return v_run.id;
end;
$$;
create function public.review_benefit_item(p_org uuid,p_id uuid,p_version bigint,p_included boolean,p_amount numeric,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_item public.benefit_run_items;
begin
  perform private.require_benefits_hr(p_org);
  select * into v_item from public.benefit_run_items where organisation_id=p_org and id=p_id;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  if private.benefit_run_approved(p_org,v_item.run_id) then raise exception 'Approved month is locked' using errcode='B0001'; end if;
  if v_item.version is distinct from p_version then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  if p_note is null or length(trim(p_note)) not between 5 and 500 or p_amount is null or round(p_amount,2)<>p_amount then raise exception 'Review reason and valid amount required' using errcode='22023'; end if;
  if p_included and ((v_item.model='flexible_budget' and p_amount>v_item.unit_amount) or
    (v_item.model='annual_allowance' and p_amount+v_item.annual_used>v_item.unit_amount)) then raise exception 'Budget exceeded' using errcode='B0004'; end if;
  update public.benefit_run_items set included=p_included,final_amount=case when p_included then p_amount else 0 end,
    reviewed=true,review_note=trim(p_note),reviewed_by=auth.uid(),version=version+1 where id=p_id;
  update public.benefit_runs set version=version+1 where id=v_item.run_id;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'benefit.item_reviewed','benefit_run_items',p_id);
end;
$$;
create function public.approve_benefit_month(p_org uuid,p_id uuid,p_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_run public.benefit_runs; v_sources jsonb;
begin
  perform private.require_benefits_hr(p_org);
  select * into v_run from public.benefit_runs where organisation_id=p_org and id=p_id;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  if v_run.status='approved' then raise exception 'Approved month is locked' using errcode='B0001'; end if;
  if v_run.version is distinct from p_version then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  v_sources := private.benefit_sources(p_org,v_run.month);
  if v_run.source_hash is distinct from md5(v_sources::text) then raise exception 'Source data changed; prepare again' using errcode='B0002'; end if;
  if exists(select 1 from public.benefit_run_items where organisation_id=p_org and run_id=p_id and not reviewed) then raise exception 'Review every exception first' using errcode='B0003'; end if;
  if exists(select 1 from public.benefit_run_items i where i.organisation_id=p_org and i.run_id=p_id and i.included and
    ((i.model='flexible_budget' and i.final_amount>i.unit_amount) or (i.model='annual_allowance' and i.final_amount+i.annual_used>i.unit_amount))) then
    raise exception 'Budget exceeded' using errcode='B0004'; end if;
  update public.benefit_runs set status='approved',approved_by=auth.uid(),approved_at=now(),version=version+1 where id=p_id;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'benefit.month_approved','benefit_runs',p_id);
end;
$$;
-- Full-run totals avoid the API row limit and do not multiply worked days by benefit count.
create function public.benefit_month_summary(p_org uuid,p_run uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_worked integer;
begin
  if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
  select jsonb_build_object('employees',count(distinct employee_id),'items',count(*),'unreviewed',count(*) filter(where not reviewed),
    'included',count(*) filter(where included),'total',coalesce(sum(final_amount),0)) into v_result
    from public.benefit_run_items where organisation_id=p_org and run_id=p_run;
  select worked_days into v_worked from public.benefit_runs where organisation_id=p_org and id=p_run;
  return v_result || jsonb_build_object('worked_days',coalesce(v_worked,0));
end;
$$;
revoke all on function private.require_benefits_hr(uuid),private.benefit_sources(uuid,date) from public,anon,authenticated;
revoke all on function public.save_benefit_provider(uuid,uuid,bigint,text,text,boolean),public.save_benefit(uuid,uuid,bigint,uuid,text,public.benefit_model,numeric,boolean),public.save_employee_benefit(uuid,uuid,bigint,uuid,uuid,date,date,boolean),public.prepare_benefit_month(uuid,date,bigint),public.review_benefit_item(uuid,uuid,bigint,boolean,numeric,text),public.approve_benefit_month(uuid,uuid,bigint),public.benefit_month_summary(uuid,uuid) from public,anon;
grant execute on function public.save_benefit_provider(uuid,uuid,bigint,text,text,boolean),public.save_benefit(uuid,uuid,bigint,uuid,text,public.benefit_model,numeric,boolean),public.save_employee_benefit(uuid,uuid,bigint,uuid,uuid,date,date,boolean),public.prepare_benefit_month(uuid,date,bigint),public.review_benefit_item(uuid,uuid,bigint,boolean,numeric,text),public.approve_benefit_month(uuid,uuid,bigint),public.benefit_month_summary(uuid,uuid) to authenticated;
