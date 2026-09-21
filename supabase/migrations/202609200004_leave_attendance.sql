-- Full-day leave and daily attendance. No statutory allowance/payroll calculation.
create type public.leave_category as enum ('annual','medical','unpaid','other');
create type public.leave_status as enum ('pending','approved','rejected','cancelled');
create type public.attendance_absence as enum ('none','medical','unpaid','other');

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (length(trim(name)) between 2 and 80),
  category public.leave_category not null,
  deducts_balance boolean not null default false,
  active boolean not null default true,
  unique(organisation_id,id), unique(organisation_id,name)
);
create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null,
  leave_type_id uuid not null,
  year integer not null check (year between 2000 and 2200),
  allowance integer not null check (allowance between 0 and 730),
  foreign key(organisation_id,employee_id) references public.employees(organisation_id,id),
  foreign key(organisation_id,leave_type_id) references public.leave_types(organisation_id,id),
  unique(organisation_id,employee_id,leave_type_id,year)
);
create table public.work_calendar_days (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  day date not null check(day between '2000-01-01' and '2200-12-31'),
  is_working boolean not null,
  label text not null check(length(trim(label)) between 2 and 100),
  unique(organisation_id,day)
);
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null,
  leave_type_id uuid not null,
  start_date date not null check(start_date between '2000-01-01' and '2200-12-31'),
  end_date date not null,
  work_dates date[] not null check(cardinality(work_dates) between 1 and 366),
  days integer generated always as (cardinality(work_dates)) stored,
  status public.leave_status not null default 'pending',
  submitted_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  decision_note text check(length(decision_note) <= 500),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key(organisation_id,employee_id) references public.employees(organisation_id,id),
  foreign key(organisation_id,leave_type_id) references public.leave_types(organisation_id,id),
  check(end_date >= start_date and extract(year from start_date) = extract(year from end_date))
);
create index leave_requests_employee_idx on public.leave_requests(organisation_id,employee_id,start_date);
create index leave_requests_status_idx on public.leave_requests(organisation_id,status,start_date);
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null,
  day date not null check(day between '2000-01-01' and '2200-12-31'),
  planned_hours numeric(4,2) not null check(planned_hours between 0 and 24),
  worked_hours numeric(4,2) not null check(worked_hours between 0 and 24),
  absence public.attendance_absence not null default 'none',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key(organisation_id,employee_id) references public.employees(organisation_id,id),
  unique(organisation_id,employee_id,day),
  check(absence = 'none' or (worked_hours = 0 and planned_hours > 0))
);

alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.work_calendar_days enable row level security;
alter table public.leave_requests enable row level security;
alter table public.attendance enable row level security;
revoke all on public.leave_types,public.leave_balances,public.work_calendar_days,public.leave_requests,public.attendance from public,anon,authenticated;
grant select on public.leave_types,public.leave_balances,public.work_calendar_days,public.leave_requests,public.attendance to authenticated;
create policy leave_types_read on public.leave_types for select to authenticated using(private.role_in(organisation_id) is not null and private.organisation_status(organisation_id) <> 'blocked');
create policy calendar_read on public.work_calendar_days for select to authenticated using(private.role_in(organisation_id) is not null and private.organisation_status(organisation_id) <> 'blocked');
create policy balances_read on public.leave_balances for select to authenticated using(private.can_read_employee(organisation_id,employee_id));
create policy leave_read on public.leave_requests for select to authenticated using(private.can_read_employee(organisation_id,employee_id));
create policy attendance_read on public.attendance for select to authenticated using(private.can_read_employee(organisation_id,employee_id));

-- All writes use checked RPCs. The organisation lock also serializes calendar,
-- balance, approval and attendance changes, and coordinates suspension/blocking.
create function private.lock_time_organisation(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.organisation_status;
begin
  if private.role_in(p_org) is null then raise exception 'Organisation access required' using errcode='42501'; end if;
  select status into v_status from public.organisations where id=p_org for update;
  if v_status is distinct from 'active' then raise exception 'Organisation is not active' using errcode='P0004'; end if;
end;
$$;
create function private.can_manage_time(p_org uuid,p_employee uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_hr(p_org) or (private.role_in(p_org)='manager' and private.can_read_employee(p_org,p_employee)
    and exists(select 1 from public.employees where organisation_id=p_org and id=p_employee and manager_user_id=auth.uid()));
$$;
create function private.is_working_day(p_org uuid,p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_working from public.work_calendar_days where organisation_id=p_org and day=p_day), extract(isodow from p_day) between 1 and 5);
$$;
create function private.seed_leave_types()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.leave_types(organisation_id,name,category,deducts_balance) values
    (new.id,'Concediu de odihnă','annual',true),(new.id,'Concediu medical','medical',false),(new.id,'Concediu fără plată','unpaid',false);
  return new;
end;
$$;
insert into public.leave_types(organisation_id,name,category,deducts_balance)
  select o.id,t.name,t.category::public.leave_category,t.deducts_balance from public.organisations o cross join
  (values ('Concediu de odihnă','annual',true),('Concediu medical','medical',false),('Concediu fără plată','unpaid',false)) t(name,category,deducts_balance);
create trigger seed_leave_types after insert on public.organisations for each row execute function private.seed_leave_types();

create function private.audit_time_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_fields jsonb := '[]'::jsonb;
begin
  if tg_op='UPDATE' then
    select coalesce(jsonb_agg(n.key),'[]'::jsonb) into v_fields from jsonb_each(to_jsonb(new)) n
      where n.key not in ('version','updated_at','updated_by') and n.value is distinct from to_jsonb(old)->n.key;
  end if;
  v_action := case tg_table_name
    when 'leave_requests' then 'leave.' || case when tg_op='INSERT' then 'requested' else to_jsonb(new)->>'status' end
    when 'leave_balances' then 'leave.balance_updated'
    when 'leave_types' then 'leave.type_updated'
    when 'work_calendar_days' then 'calendar.updated'
    else 'attendance.saved' end;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
    values(new.organisation_id,auth.uid(),v_action,tg_table_name,new.id,jsonb_build_object('changed_fields',v_fields));
  return new;
end;
$$;
create trigger leave_audit after insert or update on public.leave_requests for each row execute function private.audit_time_record();
create trigger balance_audit after insert or update on public.leave_balances for each row execute function private.audit_time_record();
create trigger attendance_audit after insert or update on public.attendance for each row execute function private.audit_time_record();
create trigger calendar_audit after insert or update on public.work_calendar_days for each row execute function private.audit_time_record();
-- Seed types are setup, not human edits. Type RPC writes its own audit event.

create function public.save_leave_type(p_org uuid,p_id uuid,p_name text,p_category public.leave_category,p_deducts boolean,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.lock_time_organisation(p_org);
  if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
  if p_id is null then
    insert into public.leave_types(organisation_id,name,category,deducts_balance,active) values(p_org,trim(p_name),p_category,p_deducts,p_active) returning id into v_id;
  else
    -- Classification and balance behavior are immutable to preserve history.
    update public.leave_types set name=trim(p_name),active=p_active where organisation_id=p_org and id=p_id returning id into v_id;
    if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  end if;
  insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'leave.type_updated','leave_types',v_id);
end;
$$;
create function public.save_leave_allowance(p_org uuid,p_employee uuid,p_type uuid,p_year integer,p_allowance integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_reserved integer;
begin
  perform private.lock_time_organisation(p_org);
  if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
  if not exists(select 1 from public.employees where organisation_id=p_org and id=p_employee)
    or not exists(select 1 from public.leave_types where organisation_id=p_org and id=p_type and deducts_balance) then
    raise exception 'Record not found' using errcode='P0005';
  end if;
  select coalesce(sum(days),0) into v_reserved from public.leave_requests where organisation_id=p_org and employee_id=p_employee and leave_type_id=p_type
    and extract(year from start_date)=p_year and status in ('pending','approved');
  if p_allowance < v_reserved then raise exception 'Allowance below reserved leave' using errcode='L0001'; end if;
  insert into public.leave_balances(organisation_id,employee_id,leave_type_id,year,allowance) values(p_org,p_employee,p_type,p_year,p_allowance)
    on conflict(organisation_id,employee_id,leave_type_id,year) do update set allowance=excluded.allowance;
end;
$$;
create function public.save_calendar_day(p_org uuid,p_day date,p_working boolean,p_label text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_time_organisation(p_org);
  if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
  if private.is_working_day(p_org,p_day) is distinct from p_working and exists(
    select 1 from public.leave_requests where organisation_id=p_org and status in ('pending','approved') and p_day between start_date and end_date
  ) then raise exception 'Calendar date used by leave; cancel and resubmit first' using errcode='L0002'; end if;
  insert into public.work_calendar_days(organisation_id,day,is_working,label) values(p_org,p_day,p_working,trim(p_label))
    on conflict(organisation_id,day) do update set is_working=excluded.is_working,label=excluded.label;
end;
$$;
create function public.request_leave(p_org uuid,p_employee uuid,p_type uuid,p_start date,p_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dates date[]; v_type public.leave_types; v_employee public.employees; v_allowance integer; v_reserved integer; v_id uuid;
begin
  perform private.lock_time_organisation(p_org);
  if not (private.is_hr(p_org) or private.owns_employee(p_org,p_employee)) then raise exception 'Employee or HR access required' using errcode='42501'; end if;
  select * into v_employee from public.employees where organisation_id=p_org and id=p_employee;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  if v_employee.status not in ('active','onboarding') then raise exception 'Employee is inactive' using errcode='L0003'; end if;
  if p_start is null or p_end is null or p_start < '2000-01-01' or p_end > '2200-12-31' or p_end < p_start
    or extract(year from p_start) <> extract(year from p_end) or p_start < v_employee.start_date then
    raise exception 'Invalid leave dates; use one calendar year' using errcode='22023'; end if;
  select * into v_type from public.leave_types where organisation_id=p_org and id=p_type and active;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  select array_agg(p_start + n order by n) into v_dates from generate_series(0,p_end-p_start) n where private.is_working_day(p_org,p_start+n);
  if v_dates is null then raise exception 'No working days selected' using errcode='L0004'; end if;
  if exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status in ('pending','approved') and work_dates && v_dates) then
    raise exception 'Overlapping leave' using errcode='L0005'; end if;
  if v_type.deducts_balance then
    select allowance into v_allowance from public.leave_balances where organisation_id=p_org and employee_id=p_employee and leave_type_id=p_type and year=extract(year from p_start);
    if v_allowance is null then raise exception 'Allowance not configured' using errcode='L0006'; end if;
    select coalesce(sum(days),0) into v_reserved from public.leave_requests where organisation_id=p_org and employee_id=p_employee and leave_type_id=p_type
      and extract(year from start_date)=extract(year from p_start) and status in ('pending','approved');
    if v_reserved + cardinality(v_dates) > v_allowance then raise exception 'Insufficient leave balance' using errcode='L0001'; end if;
  end if;
  insert into public.leave_requests(organisation_id,employee_id,leave_type_id,start_date,end_date,work_dates,submitted_by)
    values(p_org,p_employee,p_type,p_start,p_end,v_dates,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
create function public.decide_leave(p_org uuid,p_id uuid,p_version bigint,p_status public.leave_status,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_request public.leave_requests; v_own boolean;
begin
  perform private.lock_time_organisation(p_org);
  select * into v_request from public.leave_requests where organisation_id=p_org and id=p_id;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  v_own := private.owns_employee(p_org,v_request.employee_id);
  if p_status='cancelled' then
    if not (private.is_hr(p_org) or (v_own and v_request.status='pending')) then raise exception 'Cancellation access required' using errcode='42501'; end if;
    if v_request.status not in ('pending','approved') then raise exception 'Request is already closed' using errcode='L0007'; end if;
  elsif p_status in ('approved','rejected') then
    if v_own or not coalesce(private.can_manage_time(p_org,v_request.employee_id),false) then raise exception 'Approver access required; no self approval' using errcode='42501'; end if;
    if v_request.status <> 'pending' then raise exception 'Request is already closed' using errcode='L0007'; end if;
  else raise exception 'Invalid decision' using errcode='22023'; end if;
  if p_version is distinct from v_request.version then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  if p_note is null or length(trim(p_note)) > 500 or (p_status in ('rejected','cancelled') and length(trim(p_note)) < 5) then
    raise exception 'Decision reason required' using errcode='22023'; end if;
  if p_status='approved' and exists(select 1 from public.attendance where organisation_id=p_org and employee_id=v_request.employee_id
    and day=any(v_request.work_dates) and (worked_hours>0 or absence<>'none' or planned_hours=0)) then raise exception 'Attendance conflicts with leave' using errcode='L0008'; end if;
  update public.leave_requests set status=p_status,decided_by=auth.uid(),decided_at=now(),decision_note=nullif(trim(p_note),''),version=version+1 where id=p_id;
end;
$$;
create function public.save_attendance(p_org uuid,p_employee uuid,p_day date,p_planned numeric,p_worked numeric,p_absence public.attendance_absence,p_version bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_version bigint; v_start date;
begin
  perform private.lock_time_organisation(p_org);
  if not coalesce(private.can_manage_time(p_org,p_employee),false) then raise exception 'HR or assigned manager access required' using errcode='42501'; end if;
  select start_date into v_start from public.employees where organisation_id=p_org and id=p_employee;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  if p_day < v_start then raise exception 'Attendance predates employment' using errcode='22023'; end if;
  if exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status='approved' and p_day=any(work_dates)) then
    raise exception 'Approved leave controls this date; cancel it before correcting attendance' using errcode='L0008'; end if;
  select version into v_version from public.attendance where organisation_id=p_org and employee_id=p_employee and day=p_day;
  if v_version is distinct from p_version then raise exception 'Record changed; refresh' using errcode='P0006'; end if;
  insert into public.attendance(organisation_id,employee_id,day,planned_hours,worked_hours,absence,updated_by)
    values(p_org,p_employee,p_day,p_planned,p_worked,p_absence,auth.uid())
    on conflict(organisation_id,employee_id,day) do update set planned_hours=excluded.planned_hours,worked_hours=excluded.worked_hours,
      absence=excluded.absence,updated_by=auth.uid(),updated_at=now(),version=public.attendance.version+1;
end;
$$;

create function public.leave_balance_summary(p_org uuid,p_employee uuid,p_year integer)
returns table(leave_type_id uuid,name text,allowance integer,used bigint,pending bigint,remaining bigint,available bigint)
language sql stable security invoker set search_path = '' as $$
  select t.id,t.name,b.allowance,coalesce(r.used,0),coalesce(r.pending,0),b.allowance-coalesce(r.used,0),b.allowance-coalesce(r.used,0)-coalesce(r.pending,0)
  from public.leave_types t left join public.leave_balances b on b.organisation_id=t.organisation_id and b.leave_type_id=t.id and b.employee_id=p_employee and b.year=p_year
  left join lateral(select sum(l.days) filter(where l.status='approved') as used,sum(l.days) filter(where l.status='pending') as pending
    from public.leave_requests l where l.organisation_id=t.organisation_id and l.leave_type_id=t.id and l.employee_id=p_employee and extract(year from l.start_date)=p_year) r on true
  where t.organisation_id=p_org and t.deducts_balance and private.can_read_employee(p_org,p_employee) order by t.name;
$$;
create function public.attendance_month(p_org uuid,p_employee uuid,p_month date)
returns table(day date,planned_hours numeric,worked_hours numeric,category text,recorded boolean,version bigint,leave_request_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_start date; v_end date;
begin
  if not coalesce(private.can_read_employee(p_org,p_employee),false) then raise exception 'Employee access required' using errcode='42501'; end if;
  if p_month is null or p_month < '2000-01-01' or p_month > '2200-12-31' then raise exception 'Invalid month' using errcode='22023'; end if;
  select start_date into v_start from public.employees where organisation_id=p_org and id=p_employee;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  v_end := (date_trunc('month',p_month) + interval '1 month - 1 day')::date;
  return query select d.day,
    case when d.day < v_start then 0 else coalesce(a.planned_hours,case when l.id is not null or private.is_working_day(p_org,d.day) then 8 else 0 end) end::numeric,
    case when l.id is not null then 0 else a.worked_hours end::numeric,
    case when l.id is not null then t.category::text when a.id is not null then a.absence::text else 'unrecorded' end,
    a.id is not null or l.id is not null,a.version,l.id
    from (select date_trunc('month',p_month)::date + n as day from generate_series(0,v_end-date_trunc('month',p_month)::date) n) d
    left join public.attendance a on a.organisation_id=p_org and a.employee_id=p_employee and a.day=d.day
    left join public.leave_requests l on l.organisation_id=p_org and l.employee_id=p_employee and l.status='approved' and d.day=any(l.work_dates)
    left join public.leave_types t on t.organisation_id=p_org and t.id=l.leave_type_id order by d.day;
end;
$$;

revoke all on function private.lock_time_organisation(uuid),private.can_manage_time(uuid,uuid),private.is_working_day(uuid,date),private.seed_leave_types(),private.audit_time_record() from public,anon,authenticated;
revoke all on function public.save_leave_type(uuid,uuid,text,public.leave_category,boolean,boolean),public.save_leave_allowance(uuid,uuid,uuid,integer,integer),public.save_calendar_day(uuid,date,boolean,text),public.request_leave(uuid,uuid,uuid,date,date),public.decide_leave(uuid,uuid,bigint,public.leave_status,text),public.save_attendance(uuid,uuid,date,numeric,numeric,public.attendance_absence,bigint),public.leave_balance_summary(uuid,uuid,integer),public.attendance_month(uuid,uuid,date) from public,anon;
grant execute on function public.save_leave_type(uuid,uuid,text,public.leave_category,boolean,boolean),public.save_leave_allowance(uuid,uuid,uuid,integer,integer),public.save_calendar_day(uuid,date,boolean,text),public.request_leave(uuid,uuid,uuid,date,date),public.decide_leave(uuid,uuid,bigint,public.leave_status,text),public.save_attendance(uuid,uuid,date,numeric,numeric,public.attendance_absence,bigint),public.leave_balance_summary(uuid,uuid,integer),public.attendance_month(uuid,uuid,date) to authenticated;

-- Aggregate the full permitted month, independently of request-list pagination.
create function public.leave_calendar(p_org uuid,p_month date,p_employee uuid default null)
returns table(day date,pending bigint,approved bigint) language sql stable security invoker set search_path = '' as $$
  select d.day,count(l.id) filter(where l.status='pending'),count(l.id) filter(where l.status='approved')
  from (select date_trunc('month',p_month)::date+n as day from generate_series(0,
    (date_trunc('month',p_month)+interval '1 month - 1 day')::date-date_trunc('month',p_month)::date) n) d
  left join public.leave_requests l on l.organisation_id=p_org and (p_employee is null or l.employee_id=p_employee)
    and l.status in ('pending','approved') and d.day=any(l.work_dates)
  where p_month between '2000-01-01' and '2200-12-31' group by d.day order by d.day;
$$;
revoke all on function public.leave_calendar(uuid,date,uuid) from public,anon;
grant execute on function public.leave_calendar(uuid,date,uuid) to authenticated;
